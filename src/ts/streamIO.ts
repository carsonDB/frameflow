import { v4 as uuid } from 'uuid'
import { globalFlags, SourceStream } from './globals'
import { buildGraphInstance } from './graph'
import { FFWorker } from "./message"
import { BufferData, ChunkData, SourceNode, SourceType, TargetNode, WriteChunkData } from "./types/graph"
import { isBrowser, isNode } from './utils'


type SourceStreamCreator = (seekPos: number) => Promise<SourceStream<ChunkData>>


async function fetchSourceInfo(url: URL | RequestInfo): Promise<{size: number, url: string}> {
    let urlStr = ''
    if (typeof url == 'string') urlStr = url
    else if (url instanceof URL) urlStr = url.href
    else urlStr = url.url

    const { headers } = await fetch(url, { method: "HEAD" })
    // if (!headers.get('Accept-Ranges')?.includes('bytes')) throw `cannot accept range fetch`
    // todo... check if accept-ranges
    return { size: parseInt(headers.get('Content-Length') ?? '0'), url: urlStr }
}


export async function getSourceInfo(src: SourceType): Promise<{size: number, url?: string}> {
    if (typeof src == 'string') {
        if (isNode) {
            try {
                return await fetchSourceInfo(new URL(src)) // URL is used to valid url string
            } catch {
                // check if local file exits
                const { stats } = require('fs').promises
                return { url: src, size: (await stats(src)).size }
            }    
        }
        else if (isBrowser) {
            return await fetchSourceInfo(src)
        }
    }
    else if (src instanceof URL || src instanceof Request) {
        return await fetchSourceInfo(src)
    }
    else if (src instanceof Blob) {
        return { size: src.size, url: src instanceof File ? src.name : '' }
    }
    else if (src instanceof ReadableStream) {
        return { size: 0}
    }
    else if (src instanceof ArrayBuffer || (isNode && src instanceof Buffer)) {
        return { size: src.byteLength }
    }

    throw `cannot read source: "${src}", type: "${typeof src}, as stream input."`
}


async function fetchSourceData(url: RequestInfo | URL, startPos: number): Promise<SourceStream<BufferData>> {
    const { body, headers } = await fetch(url, { headers: { range: `bytes=${startPos}-` } })
    if (!body) throw `cannot fetch source url: ${url}`
    return new SourceStream(body)
}

/* convert any quanlified src into creator of SourceStream<DataBuffer> */
export const sourceToStreamCreator = (src: SourceType): SourceStreamCreator => async (seekPos: number) => {
    if (typeof src == 'string') {
        if (isNode) {
            try {
                return await fetchSourceData(new URL(src), seekPos) // valid url
            } catch {
                // check if local file exits
                const { createReadStream } = require('fs').promises
                return new SourceStream(createReadStream(src) as NodeJS.ReadStream)
            }    
        }
        else if (isBrowser) {
            return await fetchSourceData(src, seekPos)
        }
    }
    else if (src instanceof URL || src instanceof Request) {
        return await fetchSourceData(src, seekPos)
    }
    else if (src instanceof Blob) {
        return new SourceStream(src.slice(seekPos).stream())
    }
    else if (src instanceof ReadableStream) { // ignore seekPos
        return new SourceStream(src)
    }
    else if (src instanceof ArrayBuffer || (isNode && src instanceof Buffer)) {
        return new SourceStream(new ReadableStream({ 
                start(s) { 
                    s.enqueue(new Uint8Array(src.slice(seekPos))) 
                    s.close()
                }
            }))
    }

    throw `cannot read source: "${src}", type: "${typeof src}, as stream input."`
}



export class FileReader {
    #id: string
    #url = '' // todo.. send empty name
    source: SourceType
    streamCreator: SourceStreamCreator
    stream: SourceStream<ChunkData> | undefined = undefined
    worker: FFWorker
    // #dataReady: boolean = false
    // #ondataReady = () => {} // callback when new data available
 
    constructor(id: string, source: SourceType, worker: FFWorker) {
        this.#id = id
        this.worker = worker
        this.streamCreator = sourceToStreamCreator(source)
        this.source = source
        this.#enableReply()
    }
    
    #enableReply() {
        
        this.worker.reply('read', async (_, _2, transferArr) => {
            // create stream for the first time
            this.stream = this.stream ?? (await this.streamCreator(0))
            const data = await this.stream.read()
            // this.#dataReady = false
            // call after sended data
            // setTimeout(() => {
            //     this.#ondataReady()
            //     this.#ondataReady = () => {} // only call once
            // }, 0)
            // this.#dataReady = true
            data && transferArr.push('buffer' in data ? data.buffer : data)
            return {inputs: data ? [data] : []}
        }, this.#id)

        this.worker.reply('seek', async ({pos}) => { 
            this.stream = await this.streamCreator(pos)
        }, this.#id)
    }

    get url() { return this.#url ?? '' }

    get end() { return this.stream?.end ?? true }
    
    // /* worker has already had data */
    // async dataReady() {
    //     if (this.#dataReady) return
    //     return new Promise<void>((resolve) => {
    //         this.#ondataReady = () => resolve()
    //     })
    // }
}


export class StreamReader {
    cacheData: ChunkData[]
    #id: string
    worker: FFWorker
    stream: SourceStream<ChunkData>

    constructor(id: string, cacheData: ChunkData[], stream: SourceStream<ChunkData>, worker: FFWorker) {
        this.#id = id
        this.worker = worker
        this.cacheData = cacheData
        this.stream = stream
        this.#enableReply()
    }

    #enableReply() {
        this.worker.reply('read', async (_, _2, transferArr) => {
            const chunk = await this.read()
            chunk && transferArr.push('buffer' in chunk ? chunk.buffer : chunk )
            return {inputs: chunk ? [chunk] : []}
        }, this.#id)
        
        this.worker.reply('seek', () => {
            throw `Stream input cannot be seeked.`
        }, this.#id)
    }

    get end() { return this.stream.end }

    async probe() {
        const data = await this.stream.read()
        data && this.cacheData.push(data)
        return data
    }

    async read() {
        if (this.cacheData.length > 0)
            return this.cacheData.shift()
        return await this.stream.read()
    }

    close(source: SourceNode) { 
        SourceCacheData.set(source, this.cacheData) 
    }
}

type Reader = FileReader | StreamReader

/**
 * cache Reader of a SourceNode, when source created, to may be used for exporting.
 **/
const SourceCacheData = new WeakMap<SourceNode, ChunkData[]>()


/**
 * Generic data type for all data buffer with unified API.
 */
export class Chunk {
    #data: ChunkData
    #offset = 0
    constructor(data: ChunkData | WriteChunkData) {
        if ('offset' in data) {
            this.#data = data.data
            this.#offset = data.offset
        }
        else
            this.#data = data
    }

    get data() {
        return ('buffer' in this.#data) ? this.#data : undefined
    }

    get videoFrame() {
        return (this.#data instanceof VideoFrame) ? this.#data : undefined
    }

    get audioData() {
        return (this.#data instanceof AudioData) ? this.#data : undefined
    }

    get offset() {
        return this.#offset
    }
}


/**
 * stream output handler
 */
export async function newExporter(node: TargetNode, worker: FFWorker) {
    const [graphInstance, node2id] = buildGraphInstance(node)
    const id = uuid()
    const readers = []
    // create readers from sources
    for (const [node, id] of node2id) {
        if (node.type != 'source') continue
        const reader = node.data.type == 'file' ? 
            new FileReader(id, node.data.source, worker) :
            new StreamReader(id, SourceCacheData.get(node) ?? [], node.data.source, worker)
        readers.push(reader)
    }
    await worker.send('buildGraph', { graphInstance, flags: globalFlags.get() }, [], id) 
    
    return new Exporter(id, worker, readers)
}

export class Exporter {
    id: string
    worker: FFWorker
    readers: Reader[] // readers should be exists when exporting
    
    constructor(id: string, worker: FFWorker, readers: Reader[]) {
        this.id = id
        this.worker = worker
        this.readers = readers
    }
    
    /* end when return undefined  */
    async next() {
        // // make sure input reply ready
        // await Promise.all(this.readers.map(r => r.dataReady()))
        const {outputs, progress, endWriting} = await this.worker.send('nextFrame', undefined, [], this.id)
        // todo... temporarily only output one target
        if (Object.values(outputs).length !=  1) throw `Currently only one target at a time allowed`
        const output = Object.values(outputs)[0]

        const chunks = (output??[]).map(d => new Chunk(d))

        return { output: chunks, progress, done: endWriting }
    }

    async close() {
        await this.worker.send('deleteGraph', undefined, [], this.id)
    }
}
