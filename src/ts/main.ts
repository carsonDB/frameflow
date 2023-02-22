/**
 * track or track group for user convient api
 */
import mime from 'mime'
import { v4 as uuid } from 'uuid'

import { applyMulitpleFilter, applySingleFilter, Filter, FilterArgs } from "./filters"
import { loadWASM as _loadWASM } from './loader'
import { FFWorker } from "./message"
import { Chunk, Exporter, FileReader, getSourceInfo, newExporter, sourceToStreamCreator, StreamReader } from "./streamIO"
import { BufferData, SourceNode, SourceType, StreamMetadata, StreamRef, TargetNode } from "./types/graph"
import { isNode } from './utils'
import { webFrameToStreamMetadata } from './metadata'
import Worker from 'worker-loader?inline=no-fallback!./transcoder.worker.ts'



// Warning: webpack 5 only support pattern: new Worker(new URL('', import.meta.url))
// const createWorker = () => new Worker(new URL('./transcoder.worker.ts', import.meta.url))
/* use worker inline way to avoid bundle issue as dependency for further bundle. */
const createWorker = () => new Worker()


interface SourceArgs {
    frameRate?: number
}
/**
 * create `SourceTrackGroup` from various sources.
 * @param src 
 * @param options 
 * @returns 
 */
async function createSource(src: SourceType, args?: SourceArgs) {
    const id = uuid() // temporarily node id for getMetadata
    const {size, url} = await getSourceInfo(src)
    const worker = new FFWorker(createWorker())
    // check if file or stream
    if (size > 0) {
        // start a worker to probe data
        const reader = new FileReader(id, src, worker)
        // convert all src to stream
        const wasm = await loadWASM()
        const {streams, container} = await worker.send('getMetadata', {id, fullSize: size, url: url??'', wasm})
        const srcTracks = new SourceTrackGroup(src, streams, {type: 'file', container, fileSize: size})
        reader.close()
        return srcTracks
    }
    else {
        const stream = await sourceToStreamCreator(src)(0)
        const reader = new StreamReader(id, [], stream, worker)
        const firstChunk = await reader.probe()
        // get metadata directly from image/samples
        if (firstChunk instanceof VideoFrame || firstChunk instanceof AudioData) {
            const streamMetadata = webFrameToStreamMetadata(firstChunk, args??{})
            const srcTracks = new SourceTrackGroup(src, [streamMetadata], {type: 'stream', elementType: 'frame'})
            reader.close(srcTracks.node)
            return srcTracks
        }
        else
            throw `Only stream imgae/samples are allowed`
    }


}


class TrackGroup {
    streams: StreamRef[]
    
    constructor(streams: StreamRef[]) {
        this.streams = streams
    }

    /**
     * TrackGroup -> TrackGroup
     * @argument mediaType filter condition
     */
    filter(mediaType: 'video' | 'audio') {
        const streams = this.streams.filter(s => s.from.outStreams[s.index].mediaType == mediaType)
        return new TrackGroup(streams)
    }

    /**
     * TrackGroup -> Track[]
     * @argument mediaType filter condition
     */
    tracks() {
        let streams = this.streams
        return streams.map(s => new Track(s))
    }

    // group filters
    trim(args: FilterArgs<'trim'>) { 
        return new FilterTrackGroup({type: 'trim', args}, this.streams) 
    }
    loop(args: FilterArgs<'loop'>) { return new FilterTrackGroup({ type: 'loop', args }, this.streams) }
    setVolume(args: FilterArgs<'volume'>) { 
        return new FilterTrackGroup({ type: 'volume', args}, this.streams) 
    }
    setDataFormat(args: FilterArgs<'format'>) { return new FilterTrackGroup({ type: 'format', args }, this.streams) }

    // export media in stream
    async export(args?: ExportArgs) {
        const worker = new FFWorker(createWorker())
        const node = await createTargetNode(this.streams, args ?? {}, worker)
        const target = await newTarget(node, worker, args ?? {})
        return target
    }
    /**
     * @param filename target filename (currently only in Node.js)
     */
    exportTo(dest: string): Promise<void>
    exportTo(dest: typeof ArrayBuffer): Promise<BufferData>
    exportTo(dest: typeof Blob): Promise<Blob>
    exportTo(dest: HTMLVideoElement): Promise<void>
    async exportTo(
        dest: string | typeof ArrayBuffer | typeof Blob | HTMLVideoElement, 
        args?: ExportArgs
    ): Promise<void | BufferData | Blob> {
        if (dest instanceof HTMLVideoElement) throw `not implemented yet`
        else if (dest == ArrayBuffer || dest == Blob) {
            const target = await this.export(args)
            const chunks: {data: BufferData, offset: number}[] = []
            let length = 0
            for await (const chunk of target) {
                if (!chunk.data) continue
                length = Math.max(length, chunk.offset + chunk.data.byteLength)
                chunks.push({data: chunk.data, offset: chunk.offset})
            }
            const videoData = new Uint8Array(length)
            chunks.forEach(c => videoData.set(c.data, c.offset))
            if (dest == ArrayBuffer) return videoData
            return new Blob([videoData], {type: mime.getType(target.format) ?? ''})
        }
        else if (typeof dest == 'string') {
            const url = dest
            if (!isNode) throw `not implemented yet`
            const target = await this.export({...args, url})
            const { createWriteStream } = require('fs')
            const writer = createWriteStream(url) as NodeJS.WriteStream
            for await (const {data, offset} of target) {
                if (!data) continue
                writer.write(data, ) // todo...
            }
            writer.end()
        }
        else throw `not support export destination: "${dest}"`
    }
}


// single track can be seen as num_group=1, for convience to visit each stream
class Track extends TrackGroup {
    constructor(stream: StreamRef) {
        super([stream])
    }
    get metadata() { return this.streams[0].from.outStreams[this.streams[0].index] }
}


class SourceTrackGroup extends TrackGroup {
    node: SourceNode
    constructor(source: SourceType, streams: StreamMetadata[], formatInfo: SourceNode['format']) {
        const node: SourceNode = { type:'source', outStreams: streams, source, format: formatInfo }
        super(streams.map((s, i) => ({from: node, index: i}) ))
        this.node = node
    }

    get metadata() { 
        if (this.node.format.type == 'file') {
            return {
                ...this.node.format.container, 
                tracks: this.node.outStreams
            }
        }
    }

    get duration() {
        return this.node.format.type == 'file' ? this.node.format.container.duration : 0
    }

}

class FilterTrackGroup extends TrackGroup {
    /**
     * 
     * @param inStreams single filter input
     * @param inStreamsArr multiple filter inputs
     */
    constructor(filter: Filter, inStreams: StreamRef[] | null, inStreamsArr: StreamRef[][] = []) {
        const streamRefs = inStreams ? 
            applySingleFilter(inStreams, filter) : applyMulitpleFilter(inStreamsArr, filter)
        super(streamRefs)
    }

    get metadata() {
        throw `Currently only SourceTrackGroup has this method.`
    }
}


class Progress {
    progress = 0
    callback?: (pg: number) => void
    handler: ReturnType<typeof setInterval>
    constructor(callback?: (pg: number) => void, ms=200) {
        this.callback = callback
        this.handler = setInterval(() => {
            this.callback?.(this.progress)
        }, ms)
    }

    setProgress(pg: number) {
        this.progress = pg
    }

    close() {
        clearInterval(this.handler)
    }

}

async function newTarget(node: TargetNode, worker: FFWorker, args: ExportArgs) {
    const exporter = await newExporter(node, worker)
    return new Target(node, exporter, args)
}

class Target {
    #node: TargetNode
    #exporter: Exporter
    #outputs: Chunk[] = []
    #end = false
    #args: ExportArgs
    #progress: Progress
    constructor(node: TargetNode, exporter: Exporter, args: ExportArgs) {
        this.#node = node
        this.#exporter = exporter
        this.#args = args
        this.#progress = new Progress(this.#args.progress)
    }

    get end() {
        return this.#end && this.#outputs.length == 0
    }

    get format() {
        return this.#node.format.container.formatName
    }

    /**
     * @returns Each next iteration, return one chunk (Chunk ).
     *  Only when done==true then return undefined
     */
    async next(): Promise<Chunk | undefined> {
        // direct return if previous having previous outputs
        if (this.#outputs.length > 0) return this.#outputs.shift() as Chunk
        if (this.#end) return
        const {output, done, progress} = await this.#exporter.next()
        this.#progress.setProgress(progress)
        if (done) {
            this.#end = true
            await this.close()
        }
        
        /* convert (DataBuffer | undefined)[] to DataBuffer */
        if (!output && !done) return await this.next()
        if (output) {
            this.#outputs.push(...output)
            return await this.next()
        }
    }

    /* for await...of loop */
    [Symbol.asyncIterator]() {
        const target = this
        return {
            async next(): Promise<{value: Chunk, done: boolean}> {
                const output = await target.next()
                return {value: output ?? new Chunk(new Uint8Array()), done: !output}
            },
            async return(): Promise<{value: Chunk, done: boolean}> { 
                await target.close() 
                return { value: new Chunk(new Uint8Array()), done: true }
            }
        }
    }

    close() {
        this.#progress.close()
        return this.#exporter.close()
    }
}

interface MediaStreamArgs {
    // codec?: string // todo... replace with discrete options
}

interface ExportArgs {
    /* Target args */
    url?: string // export filename
    format?: string // specified video/audio/image/rawvideo container format // todo...
    audio?: MediaStreamArgs, // audio track configurations in video container
    video?: MediaStreamArgs // video track configurations in video container
    /* Export args */
    disableWebCodecs?: boolean,
    progress?: (pg: number) => void
}

async function createTargetNode(inStreams: StreamRef[], args: ExportArgs, worker: FFWorker): Promise<TargetNode> {
    // infer container format from url
    if (!args.format && !args.url) throw `must provide format name or url`
    const {format, video, audio} = await worker.send('inferFormatInfo',
        { format: args.format ?? '', url: args.url ?? '', wasm: await loadWASM() })
    
    const type = format.includes('rawvideo') ?
        'frame' :
        mime.getType(format)?.includes('image') ? 'frame' : 'video'
    // format metadata, take first stream as primary stream
    const keyStream = inStreams[0].from.outStreams[inStreams[0].index]
    const { duration, bitRate } = keyStream
    const outStreams = inStreams.map(s => {
        const stream = s.from.outStreams[s.index]
        if (stream.mediaType == 'audio') 
            return {...stream, codecName: audio.codecName, sampleFormat: audio.format}
        else if (stream.mediaType == 'video') 
            return {...stream, codecName: video.codecName, pixelFormat: video.format}
        return stream
    })

    return {type: 'target', inStreams, outStreams,
        format: { type, container: {formatName: format, duration, bitRate}}}
}




/////////////////////////////
// All exports APIs are below.
/////////////////////////////

/**
 * Create source (`SourceTrackGroup`) in one function. 
 * @param src ReadableStream<Uint8Array | Buffer> | string | URL | Request | Blob | Buffer | Uint8Array
 * @param options unused temporarily
 * @returns SourceTrackGroup can be used further.
 */
export const source = (src: SourceType, options?: {}) => createSource(src, options)

/** 
* Convert array of Track or TrackGroup into one TrackGroup.
* This is convenient when we need to apply operations on multiple tracks.
* Track[] -> TrackGroup
*/
export const group = (trackArr: (TrackGroup | Track)[]) => new TrackGroup(trackArr.map(t => t.streams).flat())

/**
 * Multiple audio tracks merge into one audio track.
 */
export const merge = (trackArr: (TrackGroup | Track)[]) => 
    new FilterTrackGroup({ type: 'merge' }, null, trackArr.map(t => t.streams))

/**
 * Concat multiple tracks along timeline.
 * @param trackArr 
 * @returns 
 */
export const concat = (trackArr: (TrackGroup | Track)[]) => 
    new FilterTrackGroup({ type: 'concat' }, null, trackArr.map(t => t.streams))

/**
 * Preload of wasm binary file.
 * 
 * This function can be called multiple times, but only fetch once.
 * So don't worry about repetitive calls.
 * 
 * @returns ArrayBuffer wasm binary
 */
export const loadWASM = () => _loadWASM()