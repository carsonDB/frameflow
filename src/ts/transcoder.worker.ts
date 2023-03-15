import createModule from '../wasm/ffmpeg_built.js'
import { Decoder, Encoder, Frame, Packet } from './codecs'
import { WorkerHandlers } from "./message"
import { FFmpegModule, ModuleType as FF, StdMap, StdVector, StreamInfo } from './types/ffmpeg'
import { Flags } from './types/flags'
import { BufferData, ChunkData, GraphInstance, SourceInstance, StreamMetadata, TargetInstance, WriteChunkData } from "./types/graph"


const streamId = (nodeId: string, streamIndex: number) => `${nodeId}:${streamIndex}`
export const vec2Array = <T>(vec: StdVector<T>) => {
    if (!vec) return []
    const arr: T[] = []
    for (let i = 0; i < vec.size(); i++) {
        arr.push(vec.get(i))
    }
    // vec delete ??
    return arr
}
const map2obj = (map: StdMap<string, string>) => {
    const obj: {[k in string]: string} = {}
    const keys = vec2Array(map.keys())
    keys.forEach(k => obj[k] = map.get(k))
    return obj
}

function streamMetadataToInfo(s: StreamMetadata): StreamInfo {
    const format = s.mediaType == 'audio' ? s.sampleFormat : s.pixelFormat
    const defaultParams = {width: 0, height: 0, frameRate: 0, sampleRate: 0, 
        channelLayout: '', channels: 0, sampleAspectRatio: {num: 0, den: 1} }
    return {...defaultParams, ...s, format, extraData: s.extraData.slice(0)}
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
 * execute runtime for a given graph instance
 */
type SourceRuntime = 
    { type: 'file' | 'frame', instance: SourceInstance, reader: SourceReader }

type TargetRuntime = 
    { type: 'file' | 'frame', instance: TargetInstance, writer: TargetWriter }

interface GraphRuntime {
    sources: SourceRuntime[]
    filterer?: Filterer
    targets: TargetRuntime[]
    flags: Flags
    ffmpeg?: FFmpegModule
}
const graph: GraphRuntime = {
    sources: [],
    targets: [],
    flags: {}
}

export function getFFmpeg() {
    if (!graph.ffmpeg) throw `GraphRuntime hasn't built, cannot get FFmpegModule`
    return graph.ffmpeg
}

// initiantate wasm module
async function loadModule(wasmBinary: ArrayBuffer) {
    const ffmpeg: FFmpegModule = await createModule({
        // Module callback functions: https://emscripten.org/docs/api_reference/module.html
        wasmBinary
    })
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
handler.reply('buildGraph', async ({graphInstance, wasm, flags}) => { 
    const ffmpeg = await loadModule(wasm)
    graph.ffmpeg = ffmpeg
    graph.flags = flags
    await buildGraph(graphInstance, ffmpeg) 
})

handler.reply('nextFrame', async (_, transferArr) => {
    if (!graph) throw new Error("haven't built graph.")
    const result = await executeStep(graph)
    transferArr.push(
        ...Object.values(result.outputs).map(outs => 
            outs.map(({data}) => 'buffer' in data ? data.buffer : data)).flat())

    return result
})

handler.reply('deleteGraph', () => {
    if (!graph) return
    graph.sources.forEach(source => source.reader.close())
    graph.filterer?.close()
    graph.targets.forEach(target => target.writer.close())
})


/* direct connect to main thread, to retrieve input data */
class InputIO {
    #id: string
    #fullSize: number
    #url: string
    #offset = 0
    #endOfFile = false
    #buffers: ChunkData[] = []
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
        if (this.#offset == 0 && this.#fullSize > 0) {
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
        
        const remainBuffers: BufferData[] = []
        const offset = this.#buffers.reduce((offset, b) => {
            if (!('byteLength' in b)) throw `only read chunk with byteLength`
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
    #buffers: WriteChunkData[] = []
    
    get offset() { return this.#offset }

    write(data: ChunkData) {
        if ('byteLength' in data) {
            this.#buffers.push({data: data.slice(0), offset: this.#offset})
            this.#offset += data.byteLength
        }
        else {
            this.#buffers.push({data, offset: 0})
        }
    }

    seek(pos: number) {
        this.#offset = pos
    }

    pullOutputs() {
        return this.#buffers.splice(0, this.#buffers.length)
    }
}


async function buildGraph(graphInstance: GraphInstance, ffmpeg: FFmpegModule) {
    const sources: GraphRuntime['sources'] = []
    const targets: GraphRuntime['targets'] = []
    const { filterInstance, nodes } = graphInstance

    // build input nodes
    for (const id of graphInstance.sources) {
        const source = nodes[id]
        if (source?.type !== 'source') continue
        if (source.data.type == 'file') {
            const reader = await newVideoSourceReader(source)
            sources.push({ type: 'file', reader, instance: source })
        }
        else {
            if (source.data.elementType == 'frame') {
                const reader = await newFrameSourceReader(source)
                sources.push({ type: 'frame', instance: source, reader })
            }
            else {
                throw `Stream: [${source.data.elementType}] not implemented yet`
            }
        }
    }
    
    // build filter graph
    const filterer = filterInstance && buildFiltersGraph(filterInstance, nodes)

    // build output node
    for (const id of graphInstance.targets) {
        const target = graphInstance.nodes[id]
        if (target?.type != 'target') continue
        if (target.format.type == 'video') {
            const writer = await newVideoTargetWriter(target)
            targets.push({ type: 'file', instance: target, writer })
        }
        else if (target.format.type == 'frame') {
            const writer = await newFrameTargetWriter(target)
            targets.push({ type: 'frame', instance: target, writer })
        }
    }
    
    graph.sources = sources
    graph.filterer = filterer
    graph.targets = targets
}


/**
 * Lazy loading Filterer, create on the fly. It dynamically accept frames with types.
 */
class Filterer {
    filterer?: FF['Filterer']
    buffers: Frame[] = []
    src2args: {[k in string]?: string} = {}
    sink2args: {[k in string]?: string} = {}
    mediaTypes: {[k in string]?: 'audio' | 'video'}
    spec: string

    constructor(inputs: string[], outputs: string[], mediaTypes: Filterer['mediaTypes'], spec: string) {
        inputs.forEach(id => this.src2args[id] = '')
        outputs.forEach(id => this.sink2args[id] = '')
        this.mediaTypes = mediaTypes
        this.spec = spec
    }
    
    /* won't create filterer until every src2args set */
    async filter(frames: Frame[]): Promise<Frame[]> {
        // only input rquired frames
        frames = frames.filter(f => typeof this.src2args[f.name] == 'string')
        // try to create filterer
        if (!this.filterer) {
            // add args to src
            for (const f of frames) {
                const id = f.name
                if (this.src2args[id] !== '') continue
                const info = f.frameInfo
                this.src2args[id] = this.mediaTypes[id] == 'video' ? 
                    `video_size=${info.width}x${info.height}:pix_fmt=${info.format}:time_base=1/${1e6}` : 
                    `sample_rate=${info.sampleRate}:sample_fmt=${info.format}:channel_layout=${info.channelLayout}:time_base=1/${1e6}`
            }
            // check if all set and create filterer
            if (Object.values(this.src2args).every(args => args !== '')) {
                this.createFilterer()
            }
            // cache current frames, for future filter.
            else
                this.buffers.push(...frames.map(f => f.clone()))
        }

        // normally filter when already created filterer
        if (this.filterer) {
            const allFrames = this.buffers.splice(0, this.buffers.length).concat(frames)
            const frameVec = getFFmpeg().createFrameVector()
            for (const f of allFrames) {
                frameVec.push_back(await f.toFF())
            }
            const outVec = this.filterer.filter(frameVec)
            return vec2Array(outVec).map(f => new Frame(f, f.name))
        }
        else
            return []
    }
    
    flush() {
        return this.filterer ? vec2Array(this.filterer.flush()).map(f => new Frame(f, f.name)) : []
    }

    createFilterer() {
        const src2args = getFFmpeg().createStringStringMap()
        const sink2args = getFFmpeg().createStringStringMap()
        const mediaTypes = getFFmpeg().createStringStringMap()
        Object.entries(this.src2args).forEach(([id, args]) => src2args.set(id, args ?? ''))
        Object.entries(this.sink2args).forEach(([id, args]) => sink2args.set(id, args ?? ''))
        Object.entries(this.mediaTypes).forEach(([id, type]) => {
            if (!type) throw `createFilterer: type is undefined`
            mediaTypes.set(id, type)
        })
        this.filterer = new (getFFmpeg()).Filterer(src2args, sink2args, mediaTypes, this.spec)
    }

    close() { this.filterer?.delete() }
}


/**
 * A filter is represented by a string of the form: [in_link_1]...[in_link_N]filter_name=arguments[out_link_1]...[out_link_M]
 */
type FilterGraph = NonNullable<GraphInstance['filterInstance']>
function buildFiltersGraph(graphInstance: FilterGraph, nodes: GraphInstance['nodes']): NonNullable<GraphRuntime['filterer']> {
    const filterSpec = graphInstance.filters.map((id) => {
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
    const inputs = graphInstance.inputs.map(ref => streamId(ref.from, ref.index))
    const outputs = graphInstance.outputs.map(ref => streamId(ref.from, ref.index))
    const mediaTypes = graphInstance.inputs.concat(graphInstance.outputs).map(ref => 
        [streamId(ref.from, ref.index), nodes[ref.from]?.outStreams[ref.index].mediaType] as const)

    return new Filterer(inputs, outputs, Object.fromEntries(mediaTypes), filterSpec)
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
    const sourcesEnd = graph.sources.every(s => s.reader.inputEnd)

    // feed into filterer if exists
    if (graph.filterer) {
        const filterOuts = !sourcesEnd ? graph.filterer.filter(frames) : graph.filterer.flush()
        frames.push(...await filterOuts)
    }
    // signal: no frames to write anymore 
    const endWriting = sourcesEnd && frames.length == 0

    // write to destinations
    const outputs: {[nodeId: string]: WriteChunkData[]} = {}
    for (const target of graph.targets) {
        if (endWriting)
            await target.writer.writeEnd()
        else
            await target.writer.writeFrames(frames)
        outputs[target.instance.id] = target.writer.pullOutputs()
    }
    
    // delete frames
    frames.forEach(f => f?.close())

    // current progress in [0, 1]
    const progress = graph.sources.reduce((pg, s) => Math.min(s.reader.progress, pg), 1)

    return {outputs, progress, endWriting}
}


/**
 * pushInputs (nodeId) -> Reader -> frames (streamId) -> Writer -> pullOutputs (nodeId)
 */

export type SourceReader = VideoSourceReader | FrameSourceReader
export type TargetWriter = VideoTargetWriter | FrameTargetWriter


/* demuxer need async build */
async function newVideoSourceReader(node: SourceInstance) {
    const ffmpeg = getFFmpeg()
    const url = node.url ?? ''
    const fileSize = node.data.type == 'file' ? node.data.fileSize : 0
    const inputIO = new InputIO(node.id, url, fileSize)
    const demuxer = new ffmpeg.Demuxer()
    await demuxer.build(inputIO)
    const decoders: VideoSourceReader['decoders'] = {}
    for (let i = 0; i < node.outStreams.length; i++) {
        const s = node.outStreams[i]
        const id = streamId(node.id, i)
        const info = streamMetadataToInfo(s)
        const useWebCodecs = await Decoder.isWebCodecsSupported(info)
        decoders[s.index] = new Decoder(demuxer, id, info, useWebCodecs)
    }

    return new VideoSourceReader(node, demuxer, decoders)
}

class VideoSourceReader {
    node: SourceInstance
    demuxer: FF['Demuxer']
    decoders: {[streamIndex in number]?: Decoder}
    #inputIO?: InputIO
    #endOfPacket = false
    
    constructor(node: SourceInstance, demuxer: FF['Demuxer'], decorders: VideoSourceReader['decoders']) {
        this.node = node
        this.demuxer = demuxer
        this.decoders = decorders
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
        if (this.node.data.type == 'file') {
            return time / this.node.data.container.duration
        }
        return 0
    }

    async readFrames(): Promise<Frame[]> {
        const ffPkt = await this.demuxer.read()
        if (ffPkt.size == 0)
            this.#endOfPacket = true
        const decoder = this.decoders[ffPkt.streamIndex]
        if (!decoder) throw `not found the decorder of source reader`
        const pkt = new Packet(ffPkt, ffPkt.getTimeInfo().dts, decoder.mediaType)
        const frames = this.inputEnd && pkt.size == 0 ? 
                        (await decoder.flush()) : 
                        (await decoder.decode(pkt))
        // free temporary variables
        pkt.close()

        return frames
    }

    close() {
        this.demuxer.delete()
        Object.values(this.decoders).forEach(d => d?.close())
    }

}

/**
 * stream of compressed images / uncompressed video frame / uncompressed audio data
 */
async function newFrameSourceReader(node: SourceInstance) {
    if (node.outStreams.length != 1 || node.outStreams[0].mediaType != 'video') 
            throw `FrameSourceReader only allow one video stream`
    const streamInfo = streamMetadataToInfo(node.outStreams[0])
    const useWebCodecs = await Decoder.isWebCodecsSupported(streamInfo)

    return new FrameSourceReader(node, streamInfo, useWebCodecs)
}

class FrameSourceReader {
    node: SourceInstance
    count: number = 0
    fps: number // number of frames per second (audio/video)
    streamInfo: StreamInfo
    decoder?: Decoder
    #name: string
    #inputIO: InputIO
    Packet: FFmpegModule['Packet']
    
    constructor(node: SourceInstance, streamInfo: StreamInfo, useWebCodecs: boolean) {
        this.node = node
        this.#name = streamId(node.id, 0)
        this.fps = streamInfo.frameRate // todo...
        this.#inputIO = new InputIO(node.id)
        this.streamInfo = streamInfo
        if (streamInfo.codecName.length > 0)
            this.decoder = new Decoder(null, this.#name, streamInfo, useWebCodecs)
        this.Packet = getFFmpeg().Packet
    }

    get inputEnd() { return this.#inputIO.end }

    get currentTime() {
        return this.count / this.fps
    }
    
    get progress() { return 0 }

    async readFrames(): Promise<Frame[]> {
        const image = await this.#inputIO.readImage()
        if (!image && this.inputEnd && this.decoder) {
            return await this.decoder.flush()
        }
        else if (!image) return []
        const pts = this.count
        this.count += 1
        const duration = 1 / this.fps
        if ('byteLength' in image && this.decoder) {
            const pkt = new this.Packet(image.byteLength, {pts, dts: pts, duration})
            pkt.getData().set(new Uint8Array(image))
            const mediaType = this.streamInfo.mediaType
            if (!mediaType) throw `FrameSourceReader: StreamInfo.mediaType is undefined`
            return await this.decoder.decode(new Packet(pkt, pts, mediaType))
        }
        else if ('buffer' in image) {
            throw `BufferData cannot directly as frame`
        }
        else
            return [new Frame(image, this.#name)]
    }

    close() {
        this.decoder?.close()
    }
}


async function newVideoTargetWriter(node: TargetInstance) {
    const ffmpeg = getFFmpeg()
    const outputIO = new OutputIO()
    const muxer = new ffmpeg.Muxer(node.format.container.formatName, outputIO)
    const encoders: VideoTargetWriter['encoders'] = {}
    const targetStreamIndexes: VideoTargetWriter['targetStreamIndexes'] = {}
    for (let i = 0; i < node.outStreams.length; i++) {
        const s = node.outStreams[i]
        const {from, index} = node.inStreams[i]
        const id = streamId(from, index)
        const info = streamMetadataToInfo(s)
        const useWebCodecs = await Encoder.isWebCodecsSupported(info)
        const encoder = new Encoder(info, useWebCodecs, node.format.container.formatName)
        // use inStream ref
        encoders[id] = encoder
        const timeBase = s.mediaType == 'audio' ? {num: 1, den: s.sampleRate} : {num: 1, den: s.frameRate}
        if (encoder.FFEncoder)
            muxer.newStream(encoder.FFEncoder, timeBase) // todo... remove timeBase
        else
            muxer.newStream({...info, timeBase})
        targetStreamIndexes[id] = i
    }

    return new VideoTargetWriter(node, muxer, encoders, outputIO, targetStreamIndexes)
}

class VideoTargetWriter {
    node: TargetInstance
    encoders: {[streamId: string]: Encoder}
    targetStreamIndexes: {[streamId: string]: number}
    muxer: FF['Muxer']
    #outputIO: OutputIO
    firstWrite = false
    dataFilterers: {[streamId: string]: Filterer | undefined | null} = {} // null means no need
    
    constructor(
        node: TargetInstance,
        muxer: FF['Muxer'], 
        encoders: VideoTargetWriter['encoders'],
        outputIO: OutputIO,
        targetStreamIndexes: VideoTargetWriter['targetStreamIndexes']
    ) {
        this.node = node
        this.muxer = muxer
        this.encoders = encoders
        this.#outputIO = outputIO
        this.targetStreamIndexes = targetStreamIndexes
    }
    
    /**
     * @param frames last writing when frames=undefined
     */
    async writeFrames(frames: Frame[]) {
        // start writing
        if (!this.firstWrite) {
            this.firstWrite = true
            this.muxer.writeHeader()
        }
        // convert if data format is different
        frames = await Promise.all(frames.map(f => this.dataFormatFilter(f)))
        // write frames
        for (const f of frames) {
            const streamId = f.name
            if (!this.encoders[streamId]) continue
            const pkts = await this.encoders[streamId].encode(f)
            for (const pkt of pkts) {
                this.muxer.writeFrame(pkt.toFF(), this.targetStreamIndexes[streamId])
                pkt.close()
            }
        }
    }

    async dataFormatFilter(frame: Frame) {
        const streamId = frame.name
        if (!this.encoders[streamId]) return frame
        // first time check if diff
        if (this.dataFilterers[streamId] === undefined) {
            const fmt1 = frame.frameInfo
            const fmt2 = this.encoders[streamId].toSupportedFormat(fmt1)
            const keys = ['format', 'channelLayout', 'sampleRate'] as const
            const isDiff = keys.some(k => fmt1[k] && fmt2[k] && fmt1[k] != fmt2[k])
            if (isDiff) {
                const isVideo = fmt1.height > 0 && fmt1.width > 0
                const spec = isVideo ? 
                    `format=pix_fmts=${fmt2.format}` : 
                    `aformat=sample_fmts=${fmt2.format}:sample_rates=${fmt2.sampleRate}:channel_layouts=${fmt2.channelLayout}`
                // same streamId of input and same output
                this.dataFilterers[streamId] = new Filterer(
                    [streamId], [streamId], {[streamId]: isVideo ? 'video' : 'audio'}, `[${streamId}]${spec}[${streamId}]`)
            }
            else
                this.dataFilterers[streamId] = null
        }
        // null (no need) or Filterer
        const filterer = this.dataFilterers[streamId]
        if (filterer) {
            const outFrames = await filterer.filter([frame])
            return outFrames[0]
        }
        else 
            return frame
    }

    /* end writing (encoders flush + writeTrailer) */
    async writeEnd() {
        for (const [streamId, encoder] of Object.entries(this.encoders)) {
            const pkts = await encoder.flush()
            for (const p of pkts) {
                this.muxer.writeFrame(p.toFF(), this.targetStreamIndexes[streamId])
            }
        }
        this.muxer.writeTrailer()
    }

    pullOutputs() {
        return this.#outputIO.pullOutputs()
    }

    close() {
        this.muxer.delete()
        Object.values(this.encoders).forEach(en => en.close())
    }

}

async function newFrameTargetWriter(node: TargetInstance) {
    if (node.outStreams.length != 1)
        throw `FrameTargetWriter only allow one stream`
    const streamInfo = streamMetadataToInfo(node.outStreams[0])
    const useWebCodecs = await Encoder.isWebCodecsSupported(streamInfo)
    return new FrameTargetWriter(node, streamInfo, useWebCodecs)
}

class FrameTargetWriter {
    node: TargetInstance
    encoder: Encoder
    #outputIO: OutputIO
    
    constructor(node: TargetInstance, streamInfo: StreamInfo, useWebCodecs: boolean) {
        this.node = node
        this.encoder = new Encoder(streamInfo, useWebCodecs, node.format.container.formatName)
        this.#outputIO = new OutputIO()
    }

    #pktVec2outputs(pkts: Packet[]) {
        for (const pkt of pkts) {
            const data = pkt.toFF().getData()
            this.#outputIO.write(data)
        }
    }

    async writeFrames(frames: Frame[]) {
        // use inStream ref
        const {from, index} = this.node.inStreams[0]
        const selfFrames = frames.filter(f => f.name == streamId(from, index))
        const rawVideo = this.node.outStreams[0].codecName == 'rawvideo'
        for (const f of selfFrames) {
            if (rawVideo) {
                const frame = f.clone() // todo... FFFrame
                if (frame.WebFrame)
                    this.#outputIO.write(frame.WebFrame)
                else
                    throw `Output rawvideo (bitmap) not implemented`
            }
            else {
                const pktVec = await this.encoder.encode(f)
                this.#pktVec2outputs(pktVec)
            }
        }
    }
    
    /* flush at end of writing */
    async writeEnd() {
        const pkts = await this.encoder.flush()
        this.#pktVec2outputs(pkts)
    }

    pullOutputs() {
        return this.#outputIO.pullOutputs()
    }

    close() {
        this.encoder.close()
    }

}