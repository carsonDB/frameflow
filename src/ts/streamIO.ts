import { buildGraphConfig } from './graph'
import { loadWASM } from './loader'
import { FFWorker } from "./message"
import { DataBuffer, SourceType, TargetNode, WriteDataBuffer } from "./types/graph"
import { isBrowser, isNode } from './utils'


export type SourceStream = ReadableStream<DataBuffer> | NodeJS.ReadableStream
type SourceStreamReader = ReadableStreamDefaultReader<DataBuffer> | NodeJS.ReadableStream
type SourceStreamCreator = (seekPos: number) => Promise<SourceStream>


async function fetchSourceInfo(url: string | URL): Promise<{size: number, url: string}> {
    const urlStr = typeof url == 'string' ? url : url.href
    const { headers } = await fetch(url, { method: "HEAD" })
    // if (!headers.get('Accept-Ranges')?.includes('bytes')) throw `cannot accept range fetch`
    // todo... check if accept-ranges
    return { size: parseInt(headers.get('Content-Length') ?? '0'), url: urlStr }
}


async function getSourceInfo(src: SourceType): Promise<{size: number, url?: string}> {
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
    else if (src instanceof URL) {
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


async function fetchSourceData(url: string | URL, startPos: number): Promise<SourceStream> {
    const { body, headers } = await fetch(url, { headers: { range: `bytes=${startPos}-` } })
    if (!body) throw `cannot fetch source url: ${url}`
    return body
}

/* convert any quanlified src into creator of readableStream<DataBuffer> */
const sourceToStreamCreator = (src: SourceType): SourceStreamCreator => async (seekPos: number) => {
    if (typeof src == 'string') {
        if (isNode) {
            try {
                return await fetchSourceData(new URL(src), seekPos) // valid url
            } catch {
                // check if local file exits
                const { createReadStream } = require('fs').promises
                return createReadStream(src) as NodeJS.ReadStream
            }    
        }
        else if (isBrowser) {
            return await fetchSourceData(src, seekPos)
        }
    }
    else if (src instanceof URL) {
        return await fetchSourceData(src, seekPos)
    }
    else if (src instanceof Blob) {
        return src.slice(seekPos).stream()
    }
    else if (src instanceof ReadableStream) { // ignore seekPos
        return src
    }
    else if (src instanceof ArrayBuffer || (isNode && src instanceof Buffer)) {
        return new ReadableStream({ 
                start(s) { 
                    s.enqueue(new Uint8Array(src.slice(seekPos))) 
                    s.close()
                }
            })
    }

    throw `cannot read source: "${src}", type: "${typeof src}, as stream input."`
}



export class Reader {
    #id: string
    #url = '' // todo.. send empty name
    source: SourceType
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
        this.source = source
        this.#enableReply()
    }

    async build() {
        const {size, url} = await getSourceInfo(this.source)
        this.#url = url ?? ""
        this.fullSize = size
        await this.createStream(0)
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
        const stream = await this.streamCreator(seekPos)
        this.stream = stream
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
        if (!this.reader) throw `async build first`
        if ('readable' in this.reader) {
            if (this.reader.readable) {
                const output = this.reader.read()
                if (typeof output == 'string') throw `cannot get string from source stream`
                return output
            }
            else {
                const stream = this.reader
                return new Promise((resolve, reject) => {
                    stream.on('readable', () => {
                        const output = stream.read()
                        if (typeof output == 'string') throw `cannot get string from source stream`
                        resolve(output)
                    })
                })
            }
        }
        const {done, value} = await this.reader.read()
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


/**
 * stream output handler
 */
export class Exporter {
    worker: FFWorker
    readers: Reader[] = []
    targetNode: TargetNode
    
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
            await reader.build()
            this.readers.push(reader)
        }
        const wasm = await loadWASM()
        await this.worker.send('buildGraph', { graphConfig, wasm }) 
    }
    
    /* end when return undefined  */
    async next(): Promise<{output?: WriteDataBuffer[], progress: number, done: boolean}> {
        // make sure input reply ready
        await Promise.all(this.readers.map(r => r.dataReady()))
        const {outputs, progress, endWriting} = await this.worker.send('nextFrame', undefined)
        // todo... temporarily only output one target
        if (Object.values(outputs).length !=  1) throw `Currently only one target at a time allowed`
        const output = Object.values(outputs)[0]
        
        return {output: output, progress, done: endWriting}
    }

    async close() {
        await this.worker.send('deleteGraph', undefined)
        this.worker.close() 
    }
}
