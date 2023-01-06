import { AudioStreamMetadata, FilterNode, GraphConfig, GraphRuntime, SourceNode, StreamMetadata, TargetNode,
    VideoStreamMetadata } from "./graph"
import { WorkerHandlers } from "./message"


const streamId = (nodeId: string, streamIndex: number) => `${nodeId}:${streamIndex}`
const vec2Array = <T>(vec: Module.Vector<T>) => {
    const arr: T[] = []
    for (let i = 0; i < vec.size(); i++) {
        arr.push(vec.get(i))
    }
    return arr
}

function streamMetadataToInfo(s: StreamMetadata): Module.StreamInfo {
    const format = s.mediaType == 'audio' ? s.sampleFormat : s.pixelFormat
    const defaultParams = {width: 0, height: 0, frameRate: {num: 0, den: 0}, sampleRate: 0, 
        channelLayout: '', channels: 0, sampleAspectRatio: {num: 0, den: 0} }
    return {...defaultParams, ...s, format}
}

function streamInfoToMetadata(s: Module.StreamInfo): StreamMetadata {
    if (s.mediaType == 'audio') {
        return {...s, mediaType: s.mediaType, sampleFormat: s.format, volume: 1}
    }
    else if (s.mediaType == 'video') {
        return {...s, mediaType: s.mediaType, pixelFormat: s.format}
    }
    else throw `not support other mediaType`
}

// global variable
let graph: GraphRuntime | null = null

const handler = new WorkerHandlers()

 handler.reply('getMetadata', ({input}) => {
    const filename = typeof input == 'string' ? input : blobToFilename(input)    
    const demuxer = new Module.Demuxer(filename)
    const {formatName, duration, bitRate, streamInfos} = demuxer.getMetadata()
    const streams = vec2Array(streamInfos).map(s => streamInfoToMetadata(s))
    demuxer.delete()
    return {container: {duration, bitRate, formatName}, streams}
})

// three stages should send in order: buildGraph -> nextFrame -> deleteGraph
handler.reply('buildGraph', ({graphConfig}) => { graph = buildGraph(graphConfig) })
handler.reply('nextFrame', ({inputs}) => {
    if (!graph) throw new Error("haven't built graph.")
    graph.sources.forEach(({config, reader}) => {
        const data = inputs[config.id]
        if (data) reader.pushInputs([data])
    })

    const {needInputs, outputs} = executeStep(graph)
    // outputs ArrayBuffer(Uint8Array) to Blob
    const outBlobs = Object.fromEntries(
        Object.entries(outputs).map(([key, val]) => [key, new Blob(val.map(v => v.buffer))]))
    return {needInputs, outputs: outBlobs}
})
handler.reply('deleteGraph', () => {
    if (!graph) return
    graph.sources.forEach(source => source.reader.close())
    graph.filterers?.delete()
    graph.targets.forEach(target => target.writer.close())
})


/**
 * save File blob into emscripten FS file system (without copy)
 * @param dir saved directory
 * @returns FS file path
 */
function blobToFilename(input: File, dir='/work') {
    // Mount FS for files.
    !FS.analyzePath(dir).exists && FS.mkdir(dir)
    FS.mount(WORKERFS, { files: [input] }, dir);
    return `${dir}/${input.name}`
}


function buildGraph(graphConfig: GraphConfig): GraphRuntime {
    const sources: GraphRuntime['sources'] = []
    const targets: GraphRuntime['targets'] = []
    
    // build input nodes
    graphConfig.sources.forEach((source) => {
        if (source.format.type == 'file') {
            const reader = new FileSourceReader(source.format.url, source)
            sources.push({ type: 'file', reader, config: source })
        }
        else {
            if (source.format.elementType == 'image') {
                const reader = new ImageSourceReader(source)
                sources.push({ type: 'image', config: source, reader })
            }
            else {
                throw `Stream: [${source.format.elementType}] not implemented yet`
            }
        }
    })
    
    // build filter graph
    const filterers = graphConfig.filterConfig && buildFiltersGraph(graphConfig.filterConfig)

    // build output node
    if (graphConfig.target.format.type == 'video') {
        const writer = new FileTargetWriter(graphConfig.target)
        targets.push({ type: 'file', config: graphConfig.target, writer })
    }
    else if (graphConfig.target.format.type == 'image') {
        const writer = new ImageTargetWriter(graphConfig.target)
        targets.push({ type: 'image', config: graphConfig.target, writer })
    }

    return { sources, filterers, targets }
}

/**
 * A filter is represented by a string of the form: [in_link_1]...[in_link_N]filter_name=arguments[out_link_1]...[out_link_M]
 */
function buildFiltersGraph({inputs, outputs, filters}: NonNullable<GraphConfig['filterConfig']>): Module.Filterer {

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
    const mediaTypes = Module.createStringStringMap()
    const src2args = Module.createStringStringMap()
    inputs.forEach(ref => 
        src2args.set(streamId(ref.from.id, ref.index), buffersrcArgs(ref.from.outStreams[ref.index])))
    outputs.forEach(ref => sink2args.set(streamId(ref.from.id, ref.index), ''))
    inputs.concat(outputs).forEach(ref => 
        mediaTypes.set(streamId(ref.from.id, ref.index), ref.from.outStreams[ref.index].mediaType))
    const sink2args = Module.createStringStringMap()
    const filterer = new Module.Filterer(src2args, sink2args, mediaTypes, filterSpec)

    return filterer
}


/**
 * processing one frame as a step
 */
 function executeStep(graph: GraphRuntime) {
    // read frames from sources
    const frames: Frames = {}
    const needInputs: string[] = []
    graph.sources.forEach(source => {
        Object.assign(frames, source.reader.readFrames())
        if (source.reader.needInputs()) needInputs.push(source.config.id)
    })
    // feed into filterer if exists
    if (graph.filterers) {
        const frameMap = Module.createFrameMap()
        Object.entries(frames).forEach(([streamId, frame]) => frame && frameMap.set(streamId, frame))
        const outFrameMap = graph.filterers.filter(frameMap)
        const outFrameKeys = outFrameMap.keys()
        for (let i = 0; i < outFrameKeys.size(); i++) {
            const streamId = outFrameKeys.get(i)
            frames[streamId] = outFrameMap.get(streamId)
        }
    }
    // write to destinations
    const outputs: {[nodeId: string]: Uint8Array[]} = {}
    graph.targets.forEach(target => {
        target.writer.writeFrames(frames)
        outputs[target.config.id] = target.writer.pullOutputs()
    })
    // todo... flush at end of writing...
    
    return {needInputs, outputs}
}

/**
 * pushInputs (nodeId) -> Reader -> frames (streamId) -> Writer -> pullOutputs (nodeId)
 */

type Frames = {[streamId in string]: Module.Frame | undefined}
export type SourceReader = FileSourceReader | ImageSourceReader
export type TargetWriter = FileTargetWriter | ImageTargetWriter


class FileSourceReader {
    node: SourceNode
    demuxer: Module.Demuxer
    decoders: {[streamIndex in number]: Module.Decoder} = {}
    
    constructor(url: string | File, node: SourceNode) {
        this.node = node
        const filename = typeof url == 'string' ? url : blobToFilename(url)    
        this.demuxer = new Module.Demuxer(filename)
        node.outStreams.forEach(s => {
            this.decoders[s.index] = new Module.Decoder(this.demuxer, s.index)
        })
    }

    needInputs() { return false }
    pushInputs(images: ArrayBuffer[]) {
        throw `FileSourceReader don't need pushInputs`
    }

    readFrames(): Frames {
        const pkt = this.demuxer.read()
        const decoder = this.decoders[pkt.streamIndex]
        const frameVec = !pkt.isEmpty ? decoder.decode(pkt) : decoder.flush()
        // todo...delete pkt...
        const frames: {[streamId in string]: Module.Frame | undefined} = {}
        vec2Array(frameVec).forEach(f => frames[streamId(this.node.id, pkt.streamIndex)] = f)
        return frames
    }

    close() {
        this.demuxer.delete()
        Object.values(this.decoders).forEach(d => d.delete())
    }

}

/**
 * stream of images
 */
class ImageSourceReader {
    node: SourceNode
    count: number = 0
    images: ArrayBuffer[] = []
    // fps: number // todo... different time_base
    decoder: Module.Decoder
    
    constructor(node: SourceNode) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video') 
            throw `ImageSourceReader only allow one video stream`
        // this.fps = node.outStreams[0].frameRate
        const stream = node.outStreams[0]
        const params = `codec_name:${stream.codecName};height:${stream.height};width:${stream.width}`
        this.decoder = new Module.Decoder(params)
    }

    needInputs() { return this.images.length == 0 }

    pushInputs(images: ArrayBuffer[]) {
        this.images.push(...images)
    }

    readFrames(): Frames {
        const image = this.images.shift()
        if (!image) {
            const frames = this.decoder.flush()
            return frames.size() > 0 ? {[streamId(this.node.id, 0)]: frames.get(0)} : {}
        }
        const pts = this.count
        this.count += 1
        const pkt = new Module.Packet(image.byteLength, pts)
        pkt.getData().set(new Uint8Array(image))
        const frames = this.decoder.decode(pkt)
        return frames.size() > 0 ? {[streamId(this.node.id, 0)]: frames.get(0)} : {}
    }

    close() {
        this.decoder.delete()
    }
}


class FileTargetWriter {
    node: TargetNode
    encoders: {[streamId: string]: Module.Encoder} = {}
    muxer: Module.Muxer
    outputs: Uint8Array[] = []
    firstWrite = false
    
    constructor(node: TargetNode) {
        this.node = node
        this.muxer = new Module.Muxer(node.format.container.formatName, data => this.outputs.push(data))
        node.outStreams.forEach((s, i) => {
            const encoder = new Module.Encoder(streamMetadataToInfo(s))
            this.encoders[streamId(node.id, i)] = encoder
            this.muxer.newStream(encoder)
        })
    }
    
    /**
     * @param frames last writing when frames=undefined
     */
    writeFrames(frames?: Frames) {
        // start writing
        if (!this.firstWrite) {
            this.firstWrite = true
            this.muxer.openIO()
            this.muxer.writeHeader()
        }
        // end writing (encoders flush + writeTrailer)
        if (!frames || Object.keys(frames).length == 0) {
            Object.values(this.encoders).forEach(encoder => {
                const pktVec = encoder.flush()
                vec2Array(pktVec).forEach(pkt => this.muxer.writeFrame(pkt))
            })
            this.muxer.writeTrailer()
            return
        }
        // regularly write frames
        Object.entries(frames).forEach(([streamId, frame]) => {
            if (!this.encoders[streamId] || !frame) return
            const pktVec = this.encoders[streamId].encode(frame)
            vec2Array(pktVec).forEach(pkt => this.muxer.writeFrame(pkt))
        })
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
    encoder: Module.Encoder
    outputs: Uint8Array[] = []
    
    constructor(node: TargetNode) {
        this.node = node
        if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video')
            throw `image writer only allow one video stream`
        const stream = node.outStreams[0]
        const params = `height:${stream.height};width:${stream.width};time_base:1/1`
        this.encoder = new Module.Encoder(streamMetadataToInfo(node.outStreams[0]))
    }

    writeFrames(frames?: Frames) {
        // flush at end of writing
        if (!frames) {
            const pktVec = this.encoder.flush()
            vec2Array(pktVec).forEach(pkt => this.outputs.push(pkt.getData()))
            return
        }
        const frame = frames[streamId(this.node.id, 0)]
        if (!frame) return
        const pktVec = this.encoder.encode(frame)
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