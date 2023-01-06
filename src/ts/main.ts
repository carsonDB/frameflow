/**
 * track or track group for user convient api
 */

import { randomUUID } from "crypto"
import { createWriteStream, writeFile } from "fs"
import { ExportArgs, Exporter } from "./streamIO"
import { applyMulitpleFilter, applySingleFilter, Filter, FilterArgs } from "./filters"
import { FormatMetadata, SourceNode, StreamMetadata, StreamRef } from "./graph"
import { FFWorker } from "./message"


// todo... path replace
export const workerPaths = {
    transcoder: './execute.worker.ts',
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

    // export media in stream
    async export(args: ExportArgs) {
        const exporter = new Exporter(this.streams, args)
        await exporter.build()
        return exporter
    }
    /**
     * @param filename target filename (currently only in Node.js)
     */
    async exportTo(url: string, args?: ExportArgs) {
        const exporter = await this.export({...args, url})
        const writer = createWriteStream(url)
        await exporter.forEach(async data => { writer.write(data) })
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
    
    constructor(url: string | File, streams: StreamMetadata[], format: FormatMetadata) {
        const node: SourceNode = { type:'source', outStreams: streams, id: randomUUID(),
            format: { type: 'file', url, container: format } }
        super(streams.map((s, i) => ({from: node, index: i}) ))
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


async function createSource(src: string | File | ReadableStream, options: {}) {
    const workerSender = new FFWorker(workerPaths.transcoder)
    if (src instanceof ReadableStream) throw `not implemented yet`
    const metadata = await workerSender.send('getMetadata', {input: src})
    return new SourceTrackGroup(src, metadata.streams, metadata.container)
}



export default {
    source: createSource,
    ...multipleFilter,
}