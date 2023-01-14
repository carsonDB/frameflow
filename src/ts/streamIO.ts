import { v4 as uuid } from 'uuid'
import { buildGraphConfig, SourceNode, StreamRef, TargetNode } from "./graph"
import { FFWorker } from "./message"


// unify browser and nodejs of binary data
export type DataBuffer = Uint8Array | Buffer


export type SourceType = ReadableStream<DataBuffer> | string | Blob | DataBuffer
export type SourceStream = ReadableStream<DataBuffer> | NodeJS.ReadableStream
type SourceStreamReader = ReadableStreamDefaultReader<DataBuffer> | NodeJS.ReadableStream
export async function sourceToStream(src: SourceType): Promise<SourceStream> {
    let stream: SourceStream | undefined = undefined
        
    // convert any quanlified src into readableStream<DataBuffer>
    if (typeof src == 'string') {
        try {
            // network url (both)
            const url = new URL(src) // valid url
            const { body } = await fetch(url)
            body && (stream = body)
        } catch {
            // check if local file exits
            // isNode && 
            throw `not implemented yet`
        }       
    }
    else if (src instanceof Blob) {
        stream = src.stream()
    }
    else if (src instanceof ReadableStream) {
        stream = src
    }
    else if (src instanceof ArrayBuffer || src instanceof Buffer) {
        stream = new ReadableStream({ 
            start(s) { 
                s.enqueue(src) 
                s.close()
            }
        })
    }

    if (!stream) throw `cannot read source: ${src}, type: ${typeof src}`
    return stream
}



export class Reader {
    stream: SourceStream
    reader: SourceStreamReader
    buffer: DataBuffer[] = []
    end = false
 
    constructor(stream: SourceStream, options: {}) {
        this.stream = stream
        if ('getReader' in stream)
            this.reader = stream.getReader()
        else {
            this.reader = stream
            if (!stream.isPaused()) throw `nodejs stream must be in paused mode`
            stream.on('end', () => this.end = true)
        }
    }

    /* unify nodejs and browser streams */
    async readFromStream(): Promise<DataBuffer | undefined> {
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

    async probe() {
        const data = await this.readFromStream()
        data && this.buffer.push(data)
        return data
    }
    
    async read() {
        if (this.buffer.length > 0) return this.buffer.shift()
        const data = await this.readFromStream()
        return data
    }

    cacheFor(node: SourceNode) { readerRuntime.set(node, this) }

    async cancel() { 
        if ('cancel' in this.reader)
            await this.reader.cancel()
    }
}

// save SourceNode with their own Reader temporarily
export const readerRuntime = new WeakMap<SourceNode, Reader>()


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
    // infer container format from url
    if (!args.format && !args.url) throw `must provide format name or url`
    const {format, videoCodec, audioCodec} = await worker.send('inferFormatInfo', 
        { format: args.format ?? '', url: args.url ?? '' })

    // format metadata, take first stream as primary stream
    const keyStream = inStreams[0].from.outStreams[inStreams[0].index]
    const { duration, bitRate } = keyStream
    const outStreams = inStreams.map(s => {
        const stream = s.from.outStreams[s.index]
        if (stream.mediaType == 'audio') return {...stream, codecName: audioCodec}
        else if (stream.mediaType == 'video') return {...stream, codecName: videoCodec}
        return stream
    })

    return {type: 'target', id: uuid(), inStreams, outStreams,
        format: { type: args.image ? 'image' : 'video', 
            container: {formatName: format, duration, bitRate}}}
}

/**
 * stream output handler
 */
export class Exporter {
    worker: FFWorker
    sources: {[nodeId in string]?: SourceNode} = {}
    targetNode: TargetNode
    lastInputs: {[nodeId: string]: DataBuffer} = {}
    outputs: DataBuffer[] = []
    
    constructor(node: TargetNode, worker: FFWorker) {
        this.targetNode = node
        this.worker = worker
    }

    async build() { 
        const graphConfig = buildGraphConfig(this.targetNode)
        this.sources = Object.fromEntries(graphConfig.sources.map(s => [s.id, s]))
        await this.worker.send('buildGraph', { graphConfig }) 
    }
    
    async next(): Promise<DataBuffer> {
        // direct return if previous having previous outputs
        if (this.outputs.length > 0) return this.outputs.shift() as DataBuffer

        // send `inputEnd` signals
        const inputEnd = Object.values(this.sources).reduce<string[]>((acc, s) => 
            s && readerRuntime.get(s)?.end ? [...acc, s.id] : acc, [])

        const {outputs, needInputs, endWriting} = await this.worker.send('nextFrame',
            { inputs: this.lastInputs, inputEnd }, Object.values(this.lastInputs).map(b => b.buffer))
        const output = outputs[this.targetNode.id]
        // prepare for next inputs
        const promises = needInputs.map(nodeId => {
            const source = this.sources[nodeId]
            const reader = source && readerRuntime.get(source)
            if (!reader) throw `cannot read from source`
            return reader.read().then(value => {
                if (!value) return
                return [nodeId, value] as [string, DataBuffer]
            })
        })
        const inputs = (await Promise.all(promises)).filter(val => !!val) as [string, DataBuffer][]
        this.lastInputs = Object.fromEntries(inputs)
        
        if (endWriting) {
            this.close()
        }

        if (!output || output.length == 0) 
            return this.next()
        // cache from second ones
        const firstOne = output[0]
        this.outputs = output.slice(1)

        return firstOne
    }

    async forEach(callback: (data: DataBuffer) => Promise<void>) {
        while (true) {
            const output = await this.next()
            if (!output) break
            await callback(output)
        }
    }

    async close() {
        await this.worker.send('deleteGraph', undefined)
        this.worker.close() 
    }
}
