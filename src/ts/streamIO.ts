import { buildGraphConfig } from './graph'
import { loadWASM } from './loader'
import { FFWorker } from "./message"
import { SourceType, StreamRef, TargetNode, DataBuffer, WriteDataBuffer } from "./types/graph"
import { isBrowser, isNode } from './utils'


export type SourceStream = ReadableStream<DataBuffer> | NodeJS.ReadableStream
type SourceStreamReader = ReadableStreamDefaultReader<DataBuffer> | NodeJS.ReadableStream
type SourceStreamCreator = (seekPos: number) => Promise<{stream: SourceStream, size: number, url?: string}>

async function fetchSource(url: string | URL, startPos: number): Promise<{stream: SourceStream, size: number, url: string}> {
    // todo... seekPos
    const { body, headers } = await fetch(url)
    const urlStr = typeof url == 'string' ? url : url.href
    if (!body) throw `cannot fetch source url: ${url}`
    return { stream: body, size: parseInt(headers.get('content-length') ?? '0'), url: urlStr }
}

const sourceToStreamCreator = (src: SourceType): SourceStreamCreator => async (seekPos: number) => {
    // convert any quanlified src into creator of readableStream<DataBuffer>
    if (typeof src == 'string') {
        if (isNode) {
            try {
                const url = new URL(src) // valid url
                return await fetchSource(url, seekPos)
            } catch {
                // check if local file exits
                const { createReadStream, stats } = require('fs').promises
                return {
                    url: src,
                    stream: createReadStream(src) as NodeJS.ReadStream, 
                    size: (await stats(src)).size 
                }
            }    
        }
        else if (isBrowser) {
            return await fetchSource(src, seekPos)
        }
    }
    else if (src instanceof URL) {
        return await fetchSource(src, seekPos)
    }
    else if (src instanceof Blob) {
        const url = src instanceof File ? src.name : ''
        return { stream: src.slice(seekPos).stream(), size: src.size, url }
    }
    else if (src instanceof ReadableStream) { // ignore seekPos
        return { stream: src, size: 0}
    }
    else if (src instanceof ArrayBuffer || (isNode && src instanceof Buffer)) {
        return {
            stream: new ReadableStream({ 
                start(s) { 
                    s.enqueue(new Uint8Array(src.slice(seekPos))) 
                    s.close()
                }
            }),
            size: src.byteLength
        }
    }

    throw `cannot read source: "${src}", type: "${typeof src}, as stream input."`
}



export class Reader {
    #id: string
    #url = '' // todo.. send empty name
    streamCreator: SourceStreamCreator
    stream: SourceStream | undefined = undefined
    reader: SourceStreamReader | undefined = undefined
    fullSize: number = 0
    worker: FFWorker
    #dataReady: boolean = false
    #ondataReady = () => {} // callback when new data available
    end = false
 
    constructor(id: string, source: SourceType, worker: FFWorker) {
        this.#id = id
        this.worker = worker
        this.streamCreator = sourceToStreamCreator(source)
        this.#enableReply()
    }
    
    #enableReply() {
        
        this.worker.reply('read', async () => {
            const data = await this.readFromStream()
            this.#dataReady = false
            // call after sended data
            setTimeout(() => {
                this.#ondataReady()
                this.#ondataReady = () => {} // only call once
            }, 0)
            this.#dataReady = true

            return {inputs: data ? [data] : []}
        }, this.#id)

        this.worker.reply('seek', async ({pos}) => { 
            await this.createStream(pos)
        }, this.#id)
    }

    get url() { return this.#url ?? '' }
    
    async createStream(seekPos: number) {
        const {stream, size, url} = await this.streamCreator(seekPos)
        this.#url = url ?? ""
        this.stream = stream
        this.fullSize = size
        if ('getReader' in stream)
            this.reader = stream.getReader()
        else {
            this.reader = stream
            if (!stream.isPaused()) throw `nodejs stream must be in paused mode`
            stream.on('end', () => this.end = true)
        }

        return {stream: this.stream, reader: this.reader}
    }

    /* unify nodejs and browser streams */
    async readFromStream(): Promise<DataBuffer | undefined> {
        // create stream and reader for the first time
        const reader = this.reader ?? (await this.createStream(0)).reader
        if ('readable' in reader) {
            if (reader.readable) {
                const output = reader.read()
                if (typeof output == 'string') throw `cannot get string from source stream`
                return output
            }
            else {
                const stream = reader
                return new Promise((resolve, reject) => {
                    stream.on('readable', () => {
                        const output = stream.read()
                        if (typeof output == 'string') throw `cannot get string from source stream`
                        resolve(output)
                    })
                })
            }
        }
        const {done, value} = await reader.read()
        if (done) this.end = true

        return value
    }
    
    /* worker has already had data */
    async dataReady() {
        if (this.#dataReady) return
        return new Promise<void>((resolve) => {
            this.#ondataReady = () => resolve()
        })
    }
}


interface MediaStreamArgs {
    codec?: string // todo... replace with discrete options
}

export interface ExportArgs {
    url?: string // export filename
    image?: string // must provide image format if export images
    format?: string // specified video/audio container format
    audio?: MediaStreamArgs, // audio track configurations in video container
    video?: MediaStreamArgs // video track configurations in video container
}

export async function createTargetNode(inStreams: StreamRef[], args: ExportArgs, worker: FFWorker): Promise<TargetNode> {
    const wasm = await loadWASM()
    // infer container format from url
    if (!args.format && !args.url) throw `must provide format name or url`
    // todo... infer too slow ??
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
        format: { type: args.image ? 'image' : 'video', 
            container: {formatName: format, duration, bitRate}}}
}

/**
 * stream output handler
 */
export class Exporter {
    worker: FFWorker
    readers: Reader[] = []
    targetNode: TargetNode
    outputs: WriteDataBuffer[] = []
    
    constructor(node: TargetNode, worker: FFWorker) {
        this.targetNode = node
        this.worker = worker
    }

    async build() { 
        const [graphConfig, node2id] = buildGraphConfig(this.targetNode)
        // create readers from sources
        for (const [node, id] of node2id) {
            if (node.type != 'source') continue
            const reader = new Reader(id, node.source, this.worker)
            this.readers.push(reader)
        }
        const wasm = await loadWASM()
        await this.worker.send('buildGraph', { graphConfig, wasm }) 
    }
    
    /* end when return undefined  */
    async next(): Promise<WriteDataBuffer | undefined> {
        // direct return if previous having previous outputs
        if (this.outputs.length > 0) return this.outputs.shift() as WriteDataBuffer
        // make sure input reply ready
        for (const reader of this.readers)
        await reader.dataReady()
        const {outputs, endWriting} = await this.worker.send('nextFrame', undefined)
        const output = Object.values(outputs)[0]
        
        if (endWriting) {
            await this.close()
        }
        
        if (!output || output.length == 0) 
        return this.next()
        // cache from second ones
        const firstOne = output[0]
        this.outputs = output.slice(1)
        
        return firstOne
    }
    
    /* for await...of loop */
    [Symbol.asyncIterator]() {
        const exporter = this
        return {
            async next(): Promise<{value: WriteDataBuffer, done: boolean}> {
                const output = await exporter.next()
                return {value: output ?? {data: new Uint8Array(), offset: 0}, done: !output}
            },
            async return(): Promise<{value: WriteDataBuffer, done: boolean}> { 
                await exporter.close() 
                return { value: {data: new Uint8Array(), offset: 0}, done: true }
            }
        }
    }

    async close() {
        await this.worker.send('deleteGraph', undefined)
        this.worker.close() 
    }
}
