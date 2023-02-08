/**
 * track or track group for user convient api
 */
import mime from 'mime'
import { v4 as uuid } from 'uuid'

import { applyMulitpleFilter, applySingleFilter, Filter, FilterArgs } from "./filters"
import { loadWASM } from './loader'
import { FFWorker } from "./message"
import { Exporter, Reader } from "./streamIO"
import { DataBuffer, FormatMetadata, SourceNode, SourceType, StreamMetadata, StreamRef, TargetNode, WriteDataBuffer } from "./types/graph"
import { isNode } from './utils'
// @ts-ignore
import Worker from 'worker-loader?inline=no-fallback!./transcoder.worker.ts'


// Warning: webpack 5 only support pattern: new Worker(new URL('', import.meta.url))
// const createWorker = () => new Worker(new URL('./transcoder.worker.ts', import.meta.url))
/* use worker inline way to avoid bundle issue as dependency for further bundle. */
const createWorker = () => new Worker()


/**
 * create `SourceTrackGroup` from various sources.
 * @param src 
 * @param options 
 * @returns 
 */
async function createSource(src: SourceType, options?: {}) {
    const id = uuid() // temporarily node id for getMetadata
    // start a worker to probe data
    const worker = new FFWorker(createWorker())
    // convert all src to stream
    const reader = new Reader(id, src, worker)
    await reader.build()
    const wasm = await loadWASM()
    const metadata = await worker.send('getMetadata', {id, fullSize: reader.fullSize, url: reader.url, wasm})
    const srcTracks = new SourceTrackGroup(src, metadata.streams, metadata.container, reader.fullSize)
    // ready to end
    /* hacky way to avoid slowing down wasm loading in next worker starter.
     * Several experiments show that if create worker and load wasm immediately after worker.close(),
     * it will become 10x slower, guess it is because of GC issue.
     */
    setTimeout(() => worker.close(), 5000)

    return srcTracks
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
        const target = new Target(node, worker, args ?? {})
        await target.build()
        return target
    }
    /**
     * @param filename target filename (currently only in Node.js)
     */
    exportTo(dest: string): Promise<void>
    exportTo(dest: typeof ArrayBuffer): Promise<DataBuffer>
    exportTo(dest: typeof Blob): Promise<Blob>
    exportTo(dest: HTMLVideoElement): Promise<void>
    async exportTo(
        dest: string | typeof ArrayBuffer | typeof Blob | HTMLVideoElement, 
        args?: ExportArgs
    ): Promise<void | DataBuffer | Blob> {
        if (dest instanceof HTMLVideoElement) throw `not implemented yet`
        else if (dest == ArrayBuffer || dest == Blob) {
            const target = await this.export(args)
            const chunks = []
            let length = 0
            for await (const chunk of target) {
                length = Math.max(length, chunk.offset + chunk.data.byteLength)
                chunks.push(chunk)
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


export class SourceTrackGroup extends TrackGroup {
    node: SourceNode
    constructor(source: SourceType, streams: StreamMetadata[], format: FormatMetadata, fileSize: number) {
        const node: SourceNode = { type:'source', outStreams: streams, source,
            format: { type: 'file', container: format, fileSize} }
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
    constructor(callback?: (pg: number) => void, ms=200, decimals=4) {
        this.callback = callback
        const p = Math.pow(10, decimals)
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

class Target {
    #node: TargetNode
    #exporter: Exporter
    #outputs: WriteDataBuffer[] = []
    #end = false
    #args: ExportArgs
    #progress: Progress
    constructor(node: TargetNode, worker: FFWorker, args: ExportArgs) {
        this.#node = node
        this.#exporter = new Exporter(node, worker)
        this.#args = args
        this.#progress = new Progress(this.#args.progress)
    }
    
    async build() {
        await this.#exporter.build()
    }

    get end() {
        return this.#end && this.#outputs.length == 0
    }

    get format() {
        return this.#node.format.container.formatName
    }

    /**
     * @returns Each next iteration, return one chunk (WriteDataBuffer).
     *  Only when done==true then return undefined
     */
    async next(): Promise<WriteDataBuffer | undefined> {
        // direct return if previous having previous outputs
        if (this.#outputs.length > 0) return this.#outputs.shift() as WriteDataBuffer
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
            async next(): Promise<{value: WriteDataBuffer, done: boolean}> {
                const output = await target.next()
                return {value: output ?? {data: new Uint8Array(), offset: 0}, done: !output}
            },
            async return(): Promise<{value: WriteDataBuffer, done: boolean}> { 
                await target.close() 
                return { value: {data: new Uint8Array(), offset: 0}, done: true }
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
    format?: string // specified video/audio/image container format
    audio?: MediaStreamArgs, // audio track configurations in video container
    video?: MediaStreamArgs // video track configurations in video container
    /* Export args */
    progress?: (pg: number) => void
}

async function createTargetNode(inStreams: StreamRef[], args: ExportArgs, worker: FFWorker): Promise<TargetNode> {
    const wasm = await loadWASM()
    // infer container format from url
    if (!args.format && !args.url) throw `must provide format name or url`
    const {format, video, audio} = await worker.send('inferFormatInfo',
        { format: args.format ?? '', url: args.url ?? '', wasm })

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
        format: { type: mime.getType(format)?.includes('image') ? 'image' : 'video', 
            container: {formatName: format, duration, bitRate}}}
}



const multipleFilter = {
    /** 
     * Track[] -> TrackGroup
     */
    group: (trackArr: (TrackGroup | Track)[]) => new TrackGroup(trackArr.map(t => t.streams).flat()),
    /**
     * multiple audio streams merge
     */
    merge: (trackArr: (TrackGroup | Track)[]) => 
        new FilterTrackGroup({ type: 'merge' }, null, trackArr.map(t => t.streams)),
    concat: (trackArr: (TrackGroup | Track)[]) => 
        new FilterTrackGroup({ type: 'concat' }, null, trackArr.map(t => t.streams))
}


export default {
    source: createSource,
    ...multipleFilter,
    loadWASM
}