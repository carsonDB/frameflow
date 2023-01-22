/**
 * track or track group for user convient api
 */
import { v4 as uuid } from 'uuid'

import { applyMulitpleFilter, applySingleFilter, Filter, FilterArgs } from "./filters"
import { loadWASM } from './loader'
import { FFWorker } from "./message"
import { createTargetNode, ExportArgs, Exporter, Reader } from "./streamIO"
import { FormatMetadata, SourceNode, SourceType, StreamMetadata, StreamRef } from "./types/graph"
import { isBrowser } from './utils'



// Warning: webpack 5 only support pattern: new Worker(new URL('', import.meta.url))
const createWorker = () => new Worker(new URL('./transcoder.worker.ts', import.meta.url))

async function createSource(src: SourceType, options?: {}) {
    const id = uuid() // temporarily node id for getMetadata
    // start a worker to probe data
    const worker = new FFWorker(createWorker())
    // convert all src to stream
    const reader = new Reader(id, src, worker)
    const wasm = await loadWASM()
    const metadata = await worker.send('getMetadata', {id, fullSize: reader.fullSize, url: reader.url, wasm})
    const srcTracks = new SourceTrackGroup(src, metadata.streams, metadata.container, reader.fullSize)
    // ready to end
    worker.close()

    return srcTracks
}


class TrackGroup {
    streams: StreamRef[]
    
    constructor(streams: StreamRef[]) {
        this.streams = streams
    }

    /**
     * TrackGroup -> Track[]
     * @argument mediaType filter condition
     */
    tracks(mediaType?: 'video' | 'audio') {
        let streams = this.streams
        if (mediaType)
            streams = streams.filter(s => s.from.outStreams[s.index].mediaType == mediaType)
        return streams.map(s => new Track(s))
    }

    // group filters
    trim(args: FilterArgs<'trim'>) { 
        return new FilterTrackGroup({type: 'trim', args}, this.streams) 
    }
    loop(args: FilterArgs<'loop'>) { return new FilterTrackGroup({ type: 'loop', args }, this.streams) }
    setVolume(args: FilterArgs<'setVolume'>) { 
        return new FilterTrackGroup({ type: 'setVolume', args}, this.streams) 
    }
    setFormat(args: FilterArgs<'format'>) { return new FilterTrackGroup({ type: 'format', args }, this.streams) }

    // export media in stream
    async export(args: ExportArgs) {
        const worker = new FFWorker(createWorker())
        const node = await createTargetNode(this.streams, args, worker)
        const exporter = new Exporter(node, worker)
        await exporter.build()
        return exporter
    }
    /**
     * @param filename target filename (currently only in Node.js)
     */
    async exportTo(dest: string | HTMLVideoElement, args?: ExportArgs) {
        if (isBrowser && dest instanceof HTMLVideoElement) throw `not implemented yet`
        else if (typeof dest == 'string') {
            const url = dest
            if (isBrowser) throw `not implemented yet`
            const exporter = await this.export({...args, url})
            const { createWriteStream } = require('fs')
            const writer = createWriteStream(url) as NodeJS.WriteStream
            for await (const {data, offset} of exporter) {
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
                streams: this.node.outStreams
            }
        }
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
}