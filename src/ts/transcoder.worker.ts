import createModule from '../wasm/ffmpeg_built.js'
import { WorkerHandlers } from "./message"
import { FFmpegModule, ModuleType, Packet, StdVector, StreamInfo } from './types/ffmpeg'
import { DataBuffer, GraphConfig, Rational, SourceConfig, StreamConfigRef, StreamMetadata, TargetConfig, WriteDataBuffer } from "./types/graph"


const streamId = (nodeId: string, streamIndex: number) => `${nodeId}:${streamIndex}`
export const vec2Array = <T>(vec: StdVector<T>) => {
    const arr: T[] = []
    for (let i = 0; i < vec.size(); i++) {
        arr.push(vec.get(i))
    }
    // vec delete ??
    return arr
}

function streamMetadataToInfo(s: StreamMetadata): StreamInfo {
    const format = s.mediaType == 'audio' ? s.sampleFormat : s.pixelFormat
    const defaultParams = {width: 0, height: 0, frameRate: 0, sampleRate: 0, 
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

export function getFFmpeg() {
    if (!graph) throw `GraphRuntime hasn't built, cannot get FFmpegModule`
    return graph.ffmpeg
}

// initiantate wasm module
async function loadModule(wasmBinary: ArrayBuffer) {
    // console.time('loadModule')
    const ffmpeg: FFmpegModule = await createModule({
        // Module callback functions: https://emscripten.org/docs/api_reference/module.html
        wasmBinary
    })
    // console.timeEnd('loadModule')
    ffmpeg.setConsoleLogger(false)

    return ffmpeg
}


const handler = new WorkerHandlers()

 handler.reply('getMetadata', async ({id, fullSize, url, wasm}) => {
    const ffmpeg = await loadModule(wasm)
    const inputIO = new InputIO(id, url, fullSize)
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
    transferArr.push(...Object.values(result.outputs).map(outs => outs.map(({data}) => data.buffer)).flat())
    return result
})

handler.reply('deleteGraph', () => {
    if (!graph) return
    graph.sources.forEach(source => source.reader.close())
    graph.filterers?.delete()
    graph.targets.forEach(target => target.writer.close())
})


/* direct connect to main thread, to retrieve input data */
class InputIO {
    #id: string
    #fullSize: number
    #url: string
    #offset = 0
    #endOfFile = false
    #buffers: DataBuffer[] = []
    constructor(nodeId: string, url?: string, fullSize?: number) {
        this.#id = nodeId
        this.#fullSize = fullSize ?? 0
        this.#url = url ?? ''
    }

    get url() { return this.#url }
    get size() { return this.#fullSize }
    get offset() { return this.#offset }

    async dataReady() {
        if (this.#buffers.length > 0) return
        // cache empty, read from main thread
        // first time seek to start position
        if (this.#offset == 0) {
            await this.seek(0)
        }
        const {inputs} = await handler.send('read', undefined, undefined, this.#id)
        this.#buffers.push(...inputs)
        // end of file
        if (this.#buffers.length == 0)
            this.#endOfFile = true
    }

    /* for image read */
    async readImage() {
        await this.dataReady()
        return this.#buffers.shift()
    }

    /* for demuxer (video) read */
    async read(buff: Uint8Array) {
        await this.dataReady()
        
        const remainBuffers: DataBuffer[] = []
        const offset = this.#buffers.reduce((offset, b) => {
            const size = Math.min(buff.byteLength - offset, b.byteLength)
            size > 0 && buff.set(b.subarray(0, size), offset)
            b.byteLength > size && remainBuffers.push(b.subarray(size, b.byteLength))
            return offset + size
        }, 0)
        this.#buffers = remainBuffers
        this.#offset += offset
            
        return offset
    }

    async seek(pos: number) { 
        await handler.send('seek', {pos}, undefined, this.#id) 
        this.#buffers = []
        this.#endOfFile = false
    }

    get end() { return this.#endOfFile }
}


class OutputIO {
    #offset = 0
    buffers: WriteDataBuffer[] = []
    
    get offset() { return this.#offset }

    write(data: Uint8Array) {
        this.buffers.push({data: data.slice(0), offset: this.#offset})
        this.#offset += data.byteLength
    }

    seek(pos: number) {
        this.#offset = pos
    }
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

    const buffersrcArgs = (id: string, s: StreamMetadata, keyValSep='=', pairsSep=':') => {
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
        let args = ''
        if (typeof node.filter.ffmpegArgs == 'string') {
            args = node.filter.ffmpegArgs
        }
        else {
            const filterArgs = Object.entries(node.filter.ffmpegArgs)
            args = filterArgs.map(([k, v]) => v != undefined ? `${k}=${v}` : '').join(':')
        }
        args = args.length > 0 ? ('=' + args) : args
        
        return `${inputs}${node.filter.name}${args}${outputs}`
    }).join(';')

    // build filter_grpah given spec
    const src2args = module.createStringStringMap()
    inputs.forEach(ref => {
        const id = streamId(ref.from, ref.index)
        src2args.set(id, buffersrcArgs(id, getStream(ref)))
    })

    const sink2args = module.createStringStringMap()
    outputs.forEach(ref => sink2args.set(streamId(ref.from, ref.index), ''))
    
    // both src and sink media type
    const mediaTypes = module.createStringStringMap()
    inputs.concat(outputs).forEach(ref => 
        mediaTypes.set(streamId(ref.from, ref.index), getStream(ref).mediaType))
    
    const filterer = new module.Filterer(src2args, sink2args, mediaTypes, filterSpec)

    // from 

    return filterer
}


/**
 * processing one frame as a step
 */
 async function executeStep(graph: GraphRuntime) {
    // find the smallest timestamp source stream and read packet
    const {reader} = graph.sources.reduce((acc, {reader}) => {
        if (reader.inputEnd) return acc
        const currentTime = reader.currentTime ?? Infinity
        return (currentTime < acc.currentTime) ? {reader, currentTime} : acc
    }, {reader: null as SourceReader | null, currentTime: Infinity})
    // read frames from sources
    const frames = await reader?.readFrames() ?? []

    // feed into filterer if exists
    if (graph.filterers && frames.length != 0) {
        const frameVec = graph.ffmpeg.createFrameVector()
        Object.values(frames).forEach((frame) => frame && frameVec.push_back(frame))
        const outFrameVec = graph.filterers.filter(frameVec)
        vec2Array(outFrameVec).forEach(f => frames.push(f))
    }
    // signal: no frames to write anymore 
    const endWriting = graph.sources.every(s => s.reader.inputEnd) && frames.length == 0

    // write to destinations
    const outputs: {[nodeId: string]: WriteDataBuffer[]} = {}
    graph.targets.forEach(target => {
        endWriting ? target.writer.writeEnd() : target.writer.writeFrames(frames)
        outputs[target.config.id] = target.writer.pullOutputs()
    })
    
    // delete frames
    frames.forEach(f => f?.delete())

    // current progress in [0, 1]
    const progress = graph.sources.reduce((pg, s) => Math.min(s.reader.progress, pg), 1)
    
    return {outputs, progress, endWriting}
}

/**
 * pushInputs (nodeId) -> Reader -> frames (streamId) -> Writer -> pullOutputs (nodeId)
 */

type Frames = ModuleType['Frame'][]
export type SourceReader = VideoSourceReader | ImageSourceReader
export type TargetWriter = VideoTargetWriter | ImageTargetWriter


class VideoSourceReader {
    node: SourceConfig
    demuxer: ModuleType['Demuxer']
    module: FFmpegModule
    decoders: {[streamIndex in number]?: ModuleType['Decoder']} = {}
    #inputIO?: InputIO
    #endOfPacket = false
    
    constructor(node: SourceConfig, module: FFmpegModule) {
        this.node = node
        this.demuxer = new module.Demuxer()
        this.module = module
    }
    
    /* demuxer need async build, so decoders must be created later */
    async build() {
        const url = this.node.url ?? ''
        const fileSize = this.node.format.type == 'file' ? this.node.format.fileSize : 0
        this.#inputIO = new InputIO(this.node.id, url, fileSize)
        await this.demuxer.build(this.#inputIO)
        this.node.outStreams.forEach((s, i) => {
            const id = streamId(this.node.id, i)
            const decoder = new this.module.Decoder(this.demuxer, s.index, id)
            this.decoders[s.index] = decoder
        })
    }

    get inputEnd() { return this.#inputIO?.end || this.#endOfPacket }

    /* smallest currentTime among all streams */
    get currentTime() {
        return this.node.outStreams.reduce((acc, s) => {
            return Math.min(acc, this.demuxer.currentTime(s.index))
        }, Infinity)
    }

    get progress() {
        const time = this.currentTime
        if (this.node.format.type == 'file') {
            return time / this.node.format.container.duration
        }
        return 0
    }

    async readFrames(): Promise<Frames> {
        const pkt = await this.demuxer.read()
        if (pkt.size == 0)
            this.#endOfPacket = true
        const decoder = this.decoders[pkt.streamIndex]
        if (!decoder) throw `not found the decorder of source reader`
        const frameVec = this.inputEnd && pkt.size == 0 ? decoder.flush() : decoder.decode(pkt)
        // free temporary variables
        pkt.delete()

        return vec2Array(frameVec)
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
    // fps: number // todo... different time_base
    decoder: ModuleType['Decoder']
    Packet: FFmpegModule['Packet']
    #inputIO: InputIO
    #inputEnd = false
    
    constructor(node: SourceConfig, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video') 
            throw `ImageSourceReader only allow one video stream`
        // this.fps = node.outStreams[0].frameRate
        this.#inputIO = new InputIO(node.id)
        const stream = node.outStreams[0]
        const params = `codec_name:${stream.codecName};height:${stream.height};width:${stream.width}`
        this.decoder = new ffmpeg.Decoder(params, streamId(this.node.id, 0))
        this.Packet = ffmpeg.Packet
    }

    get inputEnd() { return this.#inputEnd }

    get currentTime() { throw `not implemented yet` }
    
    get progress() { return 0 }

    async readFrames(): Promise<Frames> {
        const image = await this.#inputIO.readImage()
        if (!image && this.inputEnd) {
            const frames = this.decoder.flush()
            return vec2Array(frames)
        }
        else if (!image) return []
        const pts = this.count
        this.count += 1
        const pkt = new this.Packet(image.byteLength, pts)
        pkt.getData().set(new Uint8Array(image))
        const frames = this.decoder.decode(pkt)
        return vec2Array(frames)
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
    #outputIO: OutputIO
    firstWrite = false
    
    constructor(node: TargetConfig, ffmpeg: FFmpegModule) {
        this.node = node
        this.#outputIO = new OutputIO()
        this.muxer = new ffmpeg.Muxer(node.format.container.formatName, this.#outputIO)
        node.outStreams.forEach((s, i) => {
            const {from, index} = node.inStreams[i]
            const id = streamId(from, index)
            const encoder = new ffmpeg.Encoder(streamMetadataToInfo(s))
            // use inStream ref
            this.encoders[id] = encoder
            const timeBase = s.mediaType == 'audio' ? {num: 1, den: s.sampleRate} : {num: 1, den: s.frameRate}
            this.muxer.newStream(encoder, timeBase) // todo... remove timeBase
            this.targetStreamIndexes[id] = i
        })
    }
    
    /**
     * @param frames last writing when frames=undefined
     */
    writeFrames(frames: Frames) {
        // start writing
        if (!this.firstWrite) {
            this.firstWrite = true
            this.muxer.writeHeader()
        }
        // write frames
        frames.forEach(f => {
            const streamId = f.name
            if (!this.encoders[streamId]) return
            const pktVec = this.encoders[streamId].encode(f)
            vec2Array(pktVec).forEach(pkt => {
                this.muxer.writeFrame(pkt, this.targetStreamIndexes[streamId])
                pkt.delete()
            })
        })
    }

    /* end writing (encoders flush + writeTrailer) */
    writeEnd() {
        Object.entries(this.encoders).forEach(([streamId, encoder]) => {
            const pktVec = encoder.flush()
            vec2Array(pktVec).forEach(pkt => this.muxer.writeFrame(pkt, this.targetStreamIndexes[streamId]))
        })
        this.muxer.writeTrailer()
    }

    pullOutputs() {
        return this.#outputIO.buffers.splice(0, this.#outputIO.buffers.length)
    }

    close() {
        this.muxer.delete()
        Object.values(this.encoders).forEach(en => en.delete())
    }

}

class ImageTargetWriter {
    node: TargetConfig
    encoder: ModuleType['Encoder']
    outputs: WriteDataBuffer[] = []
    offset = 0
    
    constructor(node: TargetConfig, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video')
            throw `image writer only allow one video stream`
        this.encoder = new ffmpeg.Encoder(streamMetadataToInfo(node.outStreams[0]))
    }

    #pktVec2outputs(pktVec: StdVector<Packet>) {
        vec2Array(pktVec).forEach(pkt => {
            const data = pkt.getData()
            this.outputs.push({data, offset: this.offset})
            this.offset += data.byteLength
        })
    }

    writeFrames(frames: Frames) {
        // use inStream ref
        const {from, index} = this.node.inStreams[0]
        frames.filter(f => f.name == streamId(from, index)).forEach(f => {
            const pktVec = this.encoder.encode(f)
            this.#pktVec2outputs(pktVec)
        })
    }
    
    /* flush at end of writing */
    writeEnd() {
        const pktVec = this.encoder.flush()
        this.#pktVec2outputs(pktVec)
    }

    pullOutputs() {
        return this.outputs.splice(0, this.outputs.length)
    }

    close() {
        this.encoder.delete()
    }

}