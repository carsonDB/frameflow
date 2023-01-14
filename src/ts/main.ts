/**
 * track or track group for user convient api
 */
import { v4 as uuid } from 'uuid'

import { applyMulitpleFilter, applySingleFilter, Filter, FilterArgs } from "./filters"
import { FormatMetadata, SourceNode, StreamMetadata, StreamRef } from "./graph"
import { FFWorker } from "./message"
import { createTargetNode, DataBuffer, ExportArgs, Exporter, Reader, sourceToStream, SourceType } from "./streamIO"


// webpack 5 support new URL('', import.meta.url)
export const workerPaths = {
    transcoder: new URL('./transcoder.worker.ts', import.meta.url),
}


async function createSource(src: SourceType, options: {}) {
    // convert all src to stream
    const sourceStream = await sourceToStream(src)
    const reader = new Reader(sourceStream, options)
    // get probe data from stream
    let toProbeSize = 1024*1024
    const inputs: DataBuffer[] = []
    while (!reader.end && toProbeSize > 0) {
        const data = await reader.probe()
        if (!data) continue
        inputs.push(data)
        toProbeSize -= data.byteLength
    }
    // start a worker to probe data
    const worker = new FFWorker(workerPaths.transcoder)
    const metadata = await worker.send('getMetadata', {inputs})
    const srcTracks = new SourceTrackGroup(metadata.streams, metadata.container)
    // ready to end
    worker.close()
    reader.cacheFor(srcTracks.node)

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

    // export media in stream
    async export(args: ExportArgs) {
        const worker = new FFWorker(workerPaths.transcoder)
        const node = await createTargetNode(this.streams, args, worker)
        const exporter = new Exporter(node, worker)
        await exporter.build()
        return exporter
    }
    /**
     * @param filename target filename (currently only in Node.js)
     */
    async exportTo(url: string, args?: ExportArgs) {
        const exporter = await this.export({...args, url})
        const { createWriteStream } = require('fs')
        const writer = createWriteStream(url) as NodeJS.WriteStream
        await exporter.forEach(async data => { writer.write(data) })
        writer.end()
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
    constructor(streams: StreamMetadata[], format: FormatMetadata) {
        const node: SourceNode = { type:'source', outStreams: streams, id: uuid(),
            format: { type: 'file', container: format } }
        super(streams.map((s, i) => ({from: node, index: i}) ))
        this.node = node
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