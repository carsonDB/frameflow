import { randomUUID } from "crypto"
import { buildGraphConfig, SourceNode, StreamRef, TargetNode } from "./graph"
import { workerPaths } from "./main"
import { FFWorker } from "./message"


export class Reader {
    readableStream: ReadableStream<ArrayBuffer>
    reader: ReadableStreamDefaultReader<ArrayBuffer>
 
    constructor(stream: ReadableStream<ArrayBuffer>) {
        this.readableStream = stream
        this.reader = this.readableStream.getReader()
    }

    async read() {
        const {done, value} = await this.reader.read()
        return done ? undefined : value
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

/**
 * stream output handler
 */
export class Exporter {
    worker: FFWorker
    sources: {[nodeId in string]?: SourceNode} = {}
    targetNode: TargetNode
    lastInputs: {[nodeId: string]: ArrayBuffer} = {}
    
    constructor(inStreams: StreamRef[], args: ExportArgs) {
        // infer container format from url
        if (!args.format && !args.url) throw `must provide format name or filename`
        const {format, videoCodec, audioCodec} = Module.Muxer.inferFormatInfo(args.format ?? '', args.url ?? '')

        // format metadata, take first stream as primary stream
        const keyStream = inStreams[0].from.outStreams[inStreams[0].index]
        const { duration, bitRate } = keyStream
        const outStreams = inStreams.map(s => {
            const stream = s.from.outStreams[s.index]
            if (stream.mediaType == 'audio') return {...stream, codecName: audioCodec}
            else if (stream.mediaType == 'video') return {...stream, codecName: videoCodec}
            return stream
        })
        this.targetNode = {type: 'target', id: randomUUID(), inStreams, outStreams,
            format: { type: args.image ? 'image' : 'video', 
                container: {formatName: format, duration, bitRate}}}
        this.worker = new FFWorker(workerPaths.transcoder)
    }

    async build() { 
        const graphConfig = buildGraphConfig(this.targetNode)
        this.sources = Object.fromEntries(graphConfig.sources.map(s => [s.id, s]))
        await this.worker.send('buildGraph', { graphConfig }) 
    }
    
    async next(){
        const {outputs, needInputs} = await this.worker.send('nextFrame', 
            { inputs: this.lastInputs }, Object.values(this.lastInputs))
        const output = outputs[this.targetNode.id]
        const promises = needInputs.map(nodeId => {
            const source = this.sources[nodeId]
            if (!source || source.format.type != 'stream') throw `cannot read from source`
            return source.format.reader.read().then(value => {
                if (!value) return
                return [nodeId, value] as [string, ArrayBuffer]
            })
        })
        const inputs = (await Promise.all(promises)).filter(val => !!val) as [string, ArrayBuffer][]
        this.lastInputs = Object.fromEntries(inputs)
        
        if (!output) {
            this.close()
        }
        return output
    }

    async forEach(callback: (data: Blob) => Promise<void>) {
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
