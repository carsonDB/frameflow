import { FFmpegModule, getModule, ModuleType, StdVector, StreamInfo, loadModule } from './ffmpeg.wasm'
import { GraphConfig, SourceNode, StreamMetadata, TargetNode } from "./graph"
import { WorkerHandlers, DataBuffer } from "./message"


const streamId = (nodeId: string, streamIndex: number) => `${nodeId}:${streamIndex}`
const vec2Array = <T>(vec: StdVector<T>) => {
    const arr: T[] = []
    for (let i = 0; i < vec.size(); i++) {
        arr.push(vec.get(i))
    }
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
    { type: 'file' | 'image', config: SourceNode, reader: SourceReader }

type TargetRuntime = 
    { type: 'file' | 'image', config: TargetNode, writer: TargetWriter }

export interface GraphRuntime {
    sources: SourceRuntime[]
    filterers?: ModuleType['Filterer']
    targets: TargetRuntime[]
}
let graph: GraphRuntime | null = null

const handler = new WorkerHandlers()

 handler.reply('getMetadata', async ({inputs}) => {
    const ffmpeg = await loadModule()
    const buffers = [...inputs]
    const demuxer = VideoSourceReader.createDemuxer(ffmpeg, buffers)
    const {formatName, duration, bitRate, streamInfos} = demuxer.getMetadata()
    const streams = vec2Array(streamInfos).map(s => streamInfoToMetadata(s))
    demuxer.delete()
    return {container: {duration, bitRate, formatName}, streams}
})

handler.reply('inferFormatInfo', async ({format, url}) => {
    const ffmpeg = await loadModule()
    return ffmpeg.Muxer.inferFormatInfo(format, url)
})

// three stages should send in order: buildGraph -> nextFrame -> deleteGraph
handler.reply('buildGraph', async ({graphConfig}) => { 
    await loadModule()
    graph = buildGraph(graphConfig) 
})

handler.reply('nextFrame', ({inputs, inputEnd}, transferArr) => {
    if (!graph) throw new Error("haven't built graph.")
    graph.sources.forEach(({config, reader}) => {
        const data = inputs[config.id]
        // provide some new inputs to readers
        if (data) reader.pushInputs([data])
        // set inputEnd flag to some sources
        if (inputEnd.includes(config.id)) reader.setInputEnd()
    })

    const result = executeStep(graph)
    transferArr.push(...Object.values(result.outputs).map(data => data.map(d => d.buffer)).flat())

    return result
})

handler.reply('deleteGraph', () => {
    if (!graph) return
    graph.sources.forEach(source => source.reader.close())
    graph.filterers?.delete()
    graph.targets.forEach(target => target.writer.close())
})


// /**
//  * save File blob into emscripten FS file system (without copy)
//  * @param dir saved directory
//  * @returns FS file path
//  */
// function blobToFilename(input: File, dir='/work', module: FFmpegModule) {
//     // Mount FS for files.
//     !module['FS'].analyzePath(dir).exists && FS.mkdir(dir)
//     FS.mount(module['WORKERFS'], { files: [input] }, dir);
//     return `${dir}/${input.name}`
// }


function buildGraph(graphConfig: GraphConfig): GraphRuntime {
    const ffmpeg = getModule()
    const sources: GraphRuntime['sources'] = []
    const targets: GraphRuntime['targets'] = []
    
    // build input nodes
    graphConfig.sources.forEach((source) => {
        if (source.format.type == 'file') {
            const reader = new VideoSourceReader(source, ffmpeg)
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
    })
    
    // build filter graph
    const filterers = graphConfig.filterConfig && buildFiltersGraph(graphConfig.filterConfig, ffmpeg)

    // build output node
    if (graphConfig.target.format.type == 'video') {
        const writer = new VideoTargetWriter(graphConfig.target, ffmpeg)
        targets.push({ type: 'file', config: graphConfig.target, writer })
    }
    else if (graphConfig.target.format.type == 'image') {
        const writer = new ImageTargetWriter(graphConfig.target, ffmpeg)
        targets.push({ type: 'image', config: graphConfig.target, writer })
    }

    return { sources, filterers, targets }
}

/**
 * A filter is represented by a string of the form: [in_link_1]...[in_link_N]filter_name=arguments[out_link_1]...[out_link_M]
 */
function buildFiltersGraph(graphConfig: NonNullable<GraphConfig['filterConfig']>, module: FFmpegModule): ModuleType['Filterer'] {
    const {inputs, outputs, filters} = graphConfig

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
    
    const filterSpec = filters.map((node) => {
        const inputs = node.inStreams.map(({from, index}) => `[${from.id}:${index}]`).join('')
        const output = node.outStreams.map((_, i) => `[${node.id}:${i}]`).join('')
        const filterArgs = Object.entries(node.filter.args)
        const args = filterArgs.length > 0 ? '=' + filterArgs.map(([k, v]) => `${k}=${v}`).join(':') : ''
        return `${inputs}${node.id}${args}${output}`
    }).join(';')
    
    // build filter_grpah given spec
    const mediaTypes = module.createStringStringMap()
    const src2args = module.createStringStringMap()
    inputs.forEach(ref => 
        src2args.set(streamId(ref.from.id, ref.index), buffersrcArgs(ref.from.outStreams[ref.index])))
    outputs.forEach(ref => sink2args.set(streamId(ref.from.id, ref.index), ''))
    inputs.concat(outputs).forEach(ref => 
        mediaTypes.set(streamId(ref.from.id, ref.index), ref.from.outStreams[ref.index].mediaType))
    const sink2args = module.createStringStringMap()
    const filterer = new module.Filterer(src2args, sink2args, mediaTypes, filterSpec)

    return filterer
}


/**
 * processing one frame as a step
 */
 function executeStep(graph: GraphRuntime) {
    const ffmpeg = getModule()
    // read frames from sources
    const frames: Frames = {}
    const needInputs: string[] = []
    graph.sources.forEach(source => {
        Object.assign(frames, source.reader.readFrames())
        if (source.reader.needInputs) needInputs.push(source.config.id)
    })
    const framesEmpty = Object.values(frames).length == 0
    
    // feed into filterer if exists
    if (graph.filterers && !framesEmpty) {
        const frameMap = ffmpeg.createFrameMap()
        Object.entries(frames).forEach(([streamId, frame]) => frame && frameMap.set(streamId, frame))
        const outFrameMap = graph.filterers.filter(frameMap)
        const outFrameKeys = outFrameMap.keys()
        for (let i = 0; i < outFrameKeys.size(); i++) {
            const streamId = outFrameKeys.get(i)
            frames[streamId] = outFrameMap.get(streamId)
        }
    }

    // signal: no frames to write anymore 
    const endWriting = graph.sources.every(s => s.reader.inputEnd) && framesEmpty
    // write to destinations
    const outputs: {[nodeId: string]: Uint8Array[]} = {}
    graph.targets.forEach(target => {
        endWriting ? target.writer.writeEnd() : target.writer.writeFrames(frames)
        outputs[target.config.id] = target.writer.pullOutputs()
    })
    
    return {needInputs, outputs, endWriting}
}

/**
 * pushInputs (nodeId) -> Reader -> frames (streamId) -> Writer -> pullOutputs (nodeId)
 */

type Frames = {[streamId in string]: ModuleType['Frame'] | undefined}
export type SourceReader = VideoSourceReader | ImageSourceReader
export type TargetWriter = VideoTargetWriter | ImageTargetWriter


class VideoSourceReader {
    node: SourceNode
    demuxer: ModuleType['Demuxer']
    decoders: {[streamIndex in number]: ModuleType['Decoder'] | undefined} = {}
    buffers: DataBuffer[] = []
    #inputEnd = false
    
    constructor(node: SourceNode, module: FFmpegModule) {
        this.node = node
        this.demuxer = VideoSourceReader.createDemuxer(module, this.buffers)
        node.outStreams.forEach(s => {
            this.decoders[s.index] = new module.Decoder(this.demuxer, s.index)
        })
    }
    /* buffers only allow inplace operations */
    static createDemuxer(module: FFmpegModule, buffers: DataBuffer[]) {
        return new module.Demuxer(buf => {
            const remainBuffers: DataBuffer[] = []
            buffers.length == 0 && console.warn('demuxer data buffer queue empty')
            const offset = buffers.reduce((offset, b) => {
                const size = Math.min(buf.byteLength - offset, b.byteLength)
                size > 0 && buf.set(b.subarray(0, size), offset)
                b.byteLength > size && remainBuffers.push(b.subarray(size, b.byteLength))
                return offset + size
            }, 0)
            // inplace clear all and push remainBuffers
            buffers.splice(0, buffers.length, ...remainBuffers)
            
            return offset
        })
    }

    get needInputs() { return this.buffers.length == 0 }
    pushInputs(chunk: DataBuffer[]) { this.buffers.push(...chunk) }
    setInputEnd() { this.#inputEnd = true }
    get inputEnd() { return this.#inputEnd }

    readFrames(): Frames {
        const pkt = this.demuxer.read()
        const decoder = this.decoders[pkt.streamIndex]
        if (!decoder) throw `not found the decorder of source reader`
        const frameVec = this.#inputEnd && pkt.isEmpty ? decoder.flush() : decoder.decode(pkt)
        // todo...delete pkt...
        const frames: {[streamId in string]: ModuleType['Frame'] | undefined} = {}
        vec2Array(frameVec).forEach(f => frames[streamId(this.node.id, pkt.streamIndex)] = f)
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
    node: SourceNode
    count: number = 0
    images: DataBuffer[] = []
    // fps: number // todo... different time_base
    decoder: ModuleType['Decoder']
    Packet: FFmpegModule['Packet']
    #inputEnd = false
    
    constructor(node: SourceNode, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video') 
            throw `ImageSourceReader only allow one video stream`
        // this.fps = node.outStreams[0].frameRate
        const stream = node.outStreams[0]
        const params = `codec_name:${stream.codecName};height:${stream.height};width:${stream.width}`
        this.decoder = new ffmpeg.Decoder(params)
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
    node: TargetNode
    encoders: {[streamId: string]: ModuleType['Encoder']} = {}
    targetStreamIndexes: {[streamId: string]: number} = {}
    muxer: ModuleType['Muxer']
    outputs: Uint8Array[] = []
    firstWrite = false
    
    constructor(node: TargetNode, ffmpeg: FFmpegModule) {
        this.node = node
        this.muxer = new ffmpeg.Muxer(node.format.container.formatName, data => this.outputs.push(data))
        node.outStreams.forEach((s, i) => {
            const encoder = new ffmpeg.Encoder(streamMetadataToInfo(s))
            const {from, index} = node.inStreams[i]
            // use inStream ref
            this.encoders[streamId(from.id, index)] = encoder
            this.muxer.newStream(encoder)
            this.targetStreamIndexes[streamId(from.id, index)] = i
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
        }
        // regularly write frames
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
    node: TargetNode
    encoder: ModuleType['Encoder']
    outputs: Uint8Array[] = []
    
    constructor(node: TargetNode, ffmpeg: FFmpegModule) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video')
            throw `image writer only allow one video stream`
        this.encoder = new ffmpeg.Encoder(streamMetadataToInfo(node.outStreams[0]))
    }

    writeFrames(frames: Frames) {
        // use inStream ref
        const {from, index} = this.node.inStreams[0]
        const frame = frames[streamId(from.id, index)]
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