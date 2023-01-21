import createModule from '../wasm/ffmpeg_built.js'
import { DataBuffer, WorkerHandlers } from "./message"
import { FFmpegModule, ModuleType, StdVector, StreamInfo } from './types/ffmpeg'
import { GraphConfig, SourceConfig, StreamConfigRef, StreamMetadata, TargetConfig } from "./types/graph"


const streamId = (nodeId: string, streamIndex: number) => `${nodeId}:${streamIndex}`
const vec2Array = <T>(vec: StdVector<T>) => {
    const arr: T[] = []
    for (let i = 0; i < vec.size(); i++) {
        arr.push(vec.get(i))
    }
    // vec delete ??
    return arr
}

function streamMetadataToInfo(s: StreamMetadata): StreamInfo {
    const format = s.mediaType == 'audio' ? s.sampleFormat : s.pixelFormat
    const defaultParams = {width: 0, height: 0, frameRate: {num: 0, den: 1}, sampleRate: 0, 
        channelLayout: '', channels: 0, sampleAspectRatio: {num: 0, den: 1} }
    return {...defaultParams, ...s, format}
}

function streamInfoToMetadata(s: StreamInfo): StreamMetadata {
    if (s.mediaType == 'audio') {
        return {...s, mediaType: s.mediaType, sampleFormat: s.format, volume: 1}
    }
    else if (s.mediaType == 'video') {
        return {...s, mediaType: s.mediaType, pixelFormat: s.format}
    }
    else throw `not support other mediaType`
}

/**
 * execute runtime for a given graph config
 */
type SourceRuntime = 
    { type: 'file' | 'image', config: SourceConfig, reader: SourceReader }

type TargetRuntime = 
    { type: 'file' | 'image', config: TargetConfig, writer: TargetWriter }

interface GraphRuntime {
    sources: SourceRuntime[]
    filterers?: ModuleType['Filterer']
    targets: TargetRuntime[]
    ffmpeg: FFmpegModule
}
let graph: GraphRuntime | null = null


// initiantate wasm module
async function loadModule(wasmBinary: ArrayBuffer) {
    return await createModule({
         // Module callback functions: https://emscripten.org/docs/api_reference/module.html
         print: (msg: string) => console.log(msg),
         printErr: (msg: string) => console.error(msg),
         // locateFile: (path) => path.endsWith(`.wasm`) ? wasmFile : path
         wasmBinary
     })
}



const handler = new WorkerHandlers()

 handler.reply('getMetadata', async ({id, fullSize, url, wasm}) => {
    const ffmpeg = await loadModule(wasm)
    const inputIO = new InputStreamer(id, url, fullSize)
    const demuxer = new ffmpeg.Demuxer()
    await demuxer.build(inputIO)
    const {formatName, duration, bitRate, streamInfos} = demuxer.getMetadata()
    const streams = vec2Array(streamInfos).map(s => streamInfoToMetadata(s))
    demuxer.delete()
    return {container: {duration, bitRate, formatName}, streams}
})

handler.reply('inferFormatInfo', async ({format, url, wasm}) => {
    const ffmpeg = await loadModule(wasm)
    return ffmpeg.Muxer.inferFormatInfo(format, url)
})

// three stages should send in order: buildGraph -> nextFrame -> deleteGraph
handler.reply('buildGraph', async ({graphConfig, wasm}) => { 
    const ffmpeg = await loadModule(wasm)
    graph = await buildGraph(graphConfig, ffmpeg) 
})

handler.reply('nextFrame', async (_, transferArr) => {
    if (!graph) throw new Error("haven't built graph.")
    const result = await executeStep(graph)
    transferArr.push(...Object.values(result.outputs).map(data => data.map(d => d.buffer)).flat())

    return result
})

handler.reply('deleteGraph', () => {
    if (!graph) return
    graph.sources.forEach(source => source.reader.close())
    graph.filterers?.delete()
    graph.targets.forEach(target => target.writer.close())
})


/* direct connect to main thread, to retrieve input data */
class InputStreamer {
    #id: string
    #fullSize: number
    #url: string
    #current = 0
    #endOfFile = false
    #buffers: DataBuffer[] = []
    constructor(nodeId: string, url: string, fullSize: number) {
        this.#id = nodeId
        this.#fullSize = fullSize
        this.#url = url
    }

    get url() { return this.#url }
    get size() { return this.#fullSize }
    get current() { return this.#current }

    async read(buff: Uint8Array) {
        // cache empty, read from main thread
        if (this.#buffers.length == 0) {
            // first time seek to start position
            if (this.#current == 0) {
                await this.seek(0)
            }
            const {inputs} = await handler.send('read', undefined, undefined, this.#id)
            this.#buffers.push(...inputs)
            // end of file
            if (this.#buffers.length == 0)
                this.#endOfFile = true
        }
        
        const remainBuffers: DataBuffer[] = []
        const offset = this.#buffers.reduce((offset, b) => {
            const size = Math.min(buff.byteLength - offset, b.byteLength)
            size > 0 && buff.set(b.subarray(0, size), offset)
            b.byteLength > size && remainBuffers.push(b.subarray(size, b.byteLength))
            return offset + size
        }, 0)
        this.#buffers = remainBuffers
        this.#current += offset
            
        return offset
    }

    async seek(pos: number) { 
        await handler.send('seek', {pos}, undefined, this.#id) 
        this.#buffers = []
    }

    get end() { return this.#endOfFile }
}


async function buildGraph(graphConfig: GraphConfig, ffmpeg: FFmpegModule): Promise<GraphRuntime> {
    const sources: GraphRuntime['sources'] = []
    const targets: GraphRuntime['targets'] = []
    const { filterConfig, nodes } = graphConfig

    // build input nodes
    for (const id of graphConfig.sources) {
        const source = nodes[id]
        if (source?.type !== 'source') continue
        if (source.format.type == 'file') {
            const reader = new VideoSourceReader(source, ffmpeg)
            await reader.build()
            sources.push({ type: 'file', reader, config: source })
        }
        else {
            if (source.format.elementType == 'image') {
                const reader = new ImageSourceReader(source, ffmpeg)
                sources.push({ type: 'image', config: source, reader })
            }
            else {
                throw `Stream: [${source.format.elementType}] not implemented yet`
            }
        }
    }
    
    // build filter graph
    const filterers = filterConfig && buildFiltersGraph(filterConfig, nodes, ffmpeg)

    // build output node
    graphConfig.targets.forEach((id) => {
        const target = graphConfig.nodes[id]
        if (target?.type != 'target') return
        if (target.format.type == 'video') {
            const writer = new VideoTargetWriter(target, ffmpeg)
            targets.push({ type: 'file', config: target, writer })
        }
        else if (target.format.type == 'image') {
            const writer = new ImageTargetWriter(target, ffmpeg)
            targets.push({ type: 'image', config: target, writer })
        }
    });

    return { sources, filterers, targets, ffmpeg }
}

/**
 * A filter is represented by a string of the form: [in_link_1]...[in_link_N]filter_name=arguments[out_link_1]...[out_link_M]
 */
type FilterGraph = NonNullable<GraphConfig['filterConfig']>
function buildFiltersGraph(graphConfig: FilterGraph, nodes: GraphConfig['nodes'], module: FFmpegModule): ModuleType['Filterer'] {
    const {inputs, outputs, filters} = graphConfig
    const getStream = ({from, index}: StreamConfigRef) => {
        const node = nodes[from]
        if (!node) throw `getStream: cannot find configNode`
        return node.outStreams[index]
    }

    const buffersrcArgs = (s: StreamMetadata, keyValSep='=', pairsSep=':') => {
        const streamInfo: {[k: string]: number | string} = s.mediaType == 'video' ? {
            width: s.width, height: s.height, pix_fmt: s.pixelFormat, 
            time_base: `${s.timeBase.num}/${s.timeBase.den}`,
            pixel_aspect: `${s.sampleAspectRatio.num}/${s.sampleAspectRatio.den}`
        } : {
            time_base: `${s.timeBase.num}/${s.timeBase.den}`,
            sample_rate: s.sampleRate, sample_fmt: s.sampleFormat,
            channel_layout: s.channelLayout
        }

        return Object.entries(streamInfo).map(([k, v]) => `${k}${keyValSep}${v}`).join(pairsSep)
    }
    
    const filterSpec = filters.map((id) => {
        const node = nodes[id]
        if (node?.type != 'filter') return ``
        const inputs = node.inStreams.map(({from, index}) => `[${from}:${index}]`).join('')
        const outputs = node.outStreams.map((_, i) => `[${id}:${i}]`).join('')
        const filterArgs = Object.entries(node.filter.ffmpegArgs)
        const args = filterArgs.length > 0 ? 
            ('=' + filterArgs.map(([k, v]) => v ? `${k}=${v}` : '').join(':')) : ''
        return `${inputs}${node.filter.name}${args}${outputs}`
    }).join(';')

    // build filter_grpah given spec
    const mediaTypes = module.createStringStringMap()
    const src2args = module.createStringStringMap()
    inputs.forEach(ref => 
        src2args.set(streamId(ref.from, ref.index), buffersrcArgs(getStream(ref))))
    const sink2args = module.createStringStringMap()
    outputs.forEach(ref => sink2args.set(streamId(ref.from, ref.index), ''))
    inputs.concat(outputs).forEach(ref => 
        mediaTypes.set(streamId(ref.from, ref.index), getStream(ref).mediaType))
    const filterer = new module.Filterer(src2args, sink2args, mediaTypes, filterSpec)

    return filterer
}


/**
 * processing one frame as a step
 */
 async function executeStep(graph: GraphRuntime) {
    // read frames from sources
    const frames: Frames = {}
    const needInputs: string[] = []

    for (const source of graph.sources) {
        Object.assign(frames, await source.reader.readFrames())
        if (source.reader.needInputs) needInputs.push(source.config.id)
    }
    const framesEmpty = Object.values(frames).length == 0
    
    // feed into filterer if exists
    if (graph.filterers && !framesEmpty) {
        const frameVec = graph.ffmpeg.createFrameVector()
        Object.values(frames).forEach((frame) => frame && frameVec.push_back(frame))
        const outFrameVec = graph.filterers.filter(frameVec)
        vec2Array(outFrameVec).forEach(f => frames[f.name]= f)
    }
    // signal: no frames to write anymore 
    const endWriting = graph.sources.every(s => s.reader.inputEnd) && framesEmpty
    // console.log('target write start', frames, endWriting)
    // write to destinations
    const outputs: {[nodeId: string]: Uint8Array[]} = {}
    graph.targets.forEach(target => {
        endWriting ? target.writer.writeEnd() : target.writer.writeFrames(frames)
        outputs[target.config.id] = target.writer.pullOutputs()
    })
    // console.log('target write end')

    // delete frames
    Object.values(frames).forEach(f => f?.delete())
    
    return {needInputs, outputs, endWriting}
}

/**
 * pushInputs (nodeId) -> Reader -> frames (streamId) -> Writer -> pullOutputs (nodeId)
 */

type Frames = {[streamId in string]: ModuleType['Frame'] | undefined}
export type SourceReader = VideoSourceReader | ImageSourceReader
export type TargetWriter = VideoTargetWriter | ImageTargetWriter


class VideoSourceReader {
    node: SourceConfig
    demuxer: ModuleType['Demuxer']
    module: FFmpegModule
    decoders: {[streamIndex in number]: ModuleType['Decoder'] | undefined} = {}
    buffers: DataBuffer[] = []
    #inputIO: InputStreamer | undefined = undefined
    
    constructor(node: SourceConfig, module: FFmpegModule) {
        this.node = node
        this.demuxer = new module.Demuxer()
        this.module = module
    }
    
    /* demuxer need async build, so decoders must be created later */
    async build() {
        const url = this.node.url ?? ''
        const fileSize = this.node.format.type == 'file' ? this.node.format.fileSize : 0
        this.#inputIO = new InputStreamer(this.node.id, url, fileSize)
        await this.demuxer.build(this.#inputIO)
        this.node.outStreams.forEach((s, i) => {
            this.decoders[s.index] = new this.module.Decoder(this.demuxer, s.index, streamId(this.node.id, i))
        })
    }

    get needInputs() { return this.buffers.length == 0 }
    pushInputs(chunk: DataBuffer[]) { this.buffers.push(...chunk) }
    get inputEnd() { return this.#inputIO?.end }

    async readFrames(): Promise<Frames> {
        const pkt = await this.demuxer.read()
        const decoder = this.decoders[pkt.streamIndex]
        if (!decoder) throw `not found the decorder of source reader`
        const frameVec = this.inputEnd && pkt.size == 0 ? decoder.flush() : decoder.decode(pkt)
        const frames: {[streamId in string]: ModuleType['Frame'] | undefined} = {}
        vec2Array(frameVec).forEach(f => frames[f.name] = f)
        // free temporary variables
        pkt.delete()

        return frames
    }

    close() {
        this.demuxer.delete()
        Object.values(this.decoders).forEach(d => d?.delete())
    }

}

/**
 * stream of images
 */
class ImageSourceReader {
    node: SourceConfig
    count: number = 0
    images: DataBuffer[] = []
    // fps: number // todo... different time_base
    decoder: ModuleType['Decoder']
    Packet: FFmpegModule['Packet']
    #inputEnd = false
    
    constructor(node: SourceConfig, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video') 
            throw `ImageSourceReader only allow one video stream`
        // this.fps = node.outStreams[0].frameRate
        const stream = node.outStreams[0]
        const params = `codec_name:${stream.codecName};height:${stream.height};width:${stream.width}`
        this.decoder = new ffmpeg.Decoder(params, streamId(this.node.id, 0))
        this.Packet = ffmpeg.Packet
    }

    setInputEnd() { this.#inputEnd = true }
    needInputs() { return this.images.length == 0 }
    pushInputs(images: DataBuffer[]) { this.images.push(...images) }
    get inputEnd() { return this.#inputEnd }

    readFrames(): Frames {
        const image = this.images.shift()
        if (!image && this.inputEnd) {
            const frames = this.decoder.flush()
            return frames.size() > 0 ? {[streamId(this.node.id, 0)]: frames.get(0)} : {}
        }
        else if (!image) return {}
        const pts = this.count
        this.count += 1
        const pkt = new this.Packet(image.byteLength, pts)
        pkt.getData().set(new Uint8Array(image))
        const frames = this.decoder.decode(pkt)
        return frames.size() > 0 ? {[streamId(this.node.id, 0)]: frames.get(0)} : {}
    }

    close() {
        this.decoder.delete()
    }
}


class VideoTargetWriter {
    node: TargetConfig
    encoders: {[streamId: string]: ModuleType['Encoder']} = {}
    targetStreamIndexes: {[streamId: string]: number} = {}
    muxer: ModuleType['Muxer']
    outputs: Uint8Array[] = []
    firstWrite = false
    
    constructor(node: TargetConfig, ffmpeg: FFmpegModule) {
        this.node = node
        this.muxer = new ffmpeg.Muxer(node.format.container.formatName, data => {
            // console.log('onWrite', data)
            this.outputs.push(data.slice(0))
        })
        node.outStreams.forEach((s, i) => {
            const encoder = new ffmpeg.Encoder(streamMetadataToInfo(s))
            const {from, index} = node.inStreams[i]
            // use inStream ref
            this.encoders[streamId(from, index)] = encoder
            this.muxer.newStream(encoder)
            this.targetStreamIndexes[streamId(from, index)] = i
        })
    }
    
    /**
     * @param frames last writing when frames=undefined
     */
    writeFrames(frames: Frames) {
        // start writing
        if (!this.firstWrite) {
            this.firstWrite = true
            this.muxer.openIO()
            this.muxer.writeHeader()
            // console.log('write header done')
        }
        // write frames
        Object.entries(frames).forEach(([streamId, frame]) => {
            if (!this.encoders[streamId] || !frame) return
            const pktVec = this.encoders[streamId].encode(frame)
            vec2Array(pktVec).forEach(pkt => {
                pkt.streamIndex = this.targetStreamIndexes[streamId];
                this.muxer.writeFrame(pkt)
            })
        })
    }

    /* end writing (encoders flush + writeTrailer) */
    writeEnd() {
        Object.values(this.encoders).forEach(encoder => {
            const pktVec = encoder.flush()
            vec2Array(pktVec).forEach(pkt => this.muxer.writeFrame(pkt))
        })
        this.muxer.writeTrailer()
    }

    pullOutputs() {
        const outputs = this.outputs
        this.outputs = []
        return outputs
    }

    close() {
        this.muxer.delete()
        Object.values(this.encoders).forEach(en => en.delete())
    }

}

class ImageTargetWriter {
    node: TargetConfig
    encoder: ModuleType['Encoder']
    outputs: Uint8Array[] = []
    
    constructor(node: TargetConfig, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video')
            throw `image writer only allow one video stream`
        this.encoder = new ffmpeg.Encoder(streamMetadataToInfo(node.outStreams[0]))
    }

    writeFrames(frames: Frames) {
        // use inStream ref
        const {from, index} = this.node.inStreams[0]
        const frame = frames[streamId(from, index)]
        if (!frame) return
        const pktVec = this.encoder.encode(frame)
        vec2Array(pktVec).forEach(pkt => this.outputs.push(pkt.getData()))
    }
    
    /* flush at end of writing */
    writeEnd() {
        const pktVec = this.encoder.flush()
        vec2Array(pktVec).forEach(pkt => this.outputs.push(pkt.getData()))
    }

    pullOutputs() {
        const outputs = this.outputs
        this.outputs = []
        return outputs
    }

    close() {
        this.encoder.delete()
    }

}