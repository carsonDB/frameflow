import { v4 as uuid } from 'uuid'
import { applySingleFilter } from './filters'
import { FilterInstance, GraphInstance, StreamInstanceRef, StreamRef, TargetNode, UserNode } from './types/graph'

/**
 * given endpoints, backtrace until sources.
 * - make up some filterNodes (e.g. resample)
 * - tree shake and optimize the graph (todo...)
 * - convert to graphInstance (easy for further work)
 */
export function buildGraphInstance(target: TargetNode): [GraphInstance, Map<UserNode, string>] {
    // make up graph
    // target = completeGraph(target)

    // add uuid for each UserNode, and build map<UserNode, id>
    const node2id = new Map<UserNode, string>()
    node2id.set(target, uuid())
    const traversalGraph = (streamRefs: StreamRef[]) => streamRefs.forEach(({from}) => {
        if (!node2id.has(from)) node2id.set(from, uuid())
        if (from.type != 'source')
            traversalGraph(from.inStreams)
    })
    traversalGraph(target.inStreams)

    // convert to graphInstance
    const sources: string[] = []
    const targets: string[] = []
    let nodeInstances: GraphInstance['nodes'] = {}
    let filterInstance: NonNullable<GraphInstance['filterInstance']> = {
        inputs: [],
        outputs: [],
        filters: [],
    }
    node2id.forEach((id, node) => {
        if (node.type == 'source') {
            sources.push(id)
            const {data: {source: _, ...dataRest}, ...rest} = node
            nodeInstances[id] = {...rest, id, data: {...dataRest}}
        }
        else if (node.type == 'filter') {
            filterInstance.filters.push(id)
            const inStreams = node.inStreams.map(({from, index}) => {
                const instanceRef = {from: node2id.get(from) ?? '', index}
                if (from.type == 'source')
                    filterInstance.inputs.push(instanceRef)
                return instanceRef
            })
            nodeInstances[id] = {...node, inStreams, id}
        }
        else {
            targets.push(id)
            const inStreams = node.inStreams.map(({from, index}) => {
                const instanceRef = {from: node2id.get(from) ?? '', index}
                if (from.type == 'filter') 
                    filterInstance.outputs.push(instanceRef)
                return instanceRef
            })
            nodeInstances[id] = {...node, inStreams, id}
        }

    });
    // complete filters (+ split)
    [filterInstance.filters, nodeInstances] = filtersComplete(filterInstance.filters, nodeInstances)

    // reverse filters
    filterInstance.filters.reverse()

    const grapInstance = {
        nodes: nodeInstances,
        sources, 
        filterInstance: (filterInstance.filters.length > 0 ? filterInstance: undefined), 
        targets
    }
    
    return [grapInstance, node2id]
}


/**
 *  if one stream is used multiple times, then prepend `split` filter to clone
 * */
function filtersComplete(filters: string[], nodes: GraphInstance['nodes']) {
    const streamId = (from: string, index: number) => `${from}:${index}`
    const stats: {[streamId in string]?: 
        {streamEntries: {filter: string, index: number}[], stream: StreamInstanceRef, isVideo: boolean}} = {}
    // stats all inStreams
    for (const filterId of filters) {
        const node = nodes[filterId]
        if (node?.type !== 'filter') continue
        node.inStreams.forEach((r, i) => {
            const id = streamId(r.from, r.index)
            const fromInstance = nodes[r.from]?.outStreams[r.index]
            if (!stats[id]) {
                stats[id] = {streamEntries: [], stream: r, isVideo: fromInstance?.mediaType == 'video' }
            }
            stats[id]?.streamEntries.push({filter: filterId, index: i})
        })
    }
    Object.values(stats)
        .filter((v) => (v?.streamEntries.length??0) > 1)
        .forEach((v) => {
            const fromStream = nodes[v?.stream.from??'']?.outStreams[v?.stream.index??0]
            const numSplit = v?.streamEntries.length
            if (!v || !fromStream || !numSplit) return
            // add `split/asplit` filters
            const splitInstance: FilterInstance = {
                type: 'filter', inStreams: [v.stream], id: uuid(),
                outStreams: Array(numSplit).fill(fromStream), 
                filter: {name: v?.isVideo ? 'split' : 'asplit', ffmpegArgs: `${numSplit}`}}
            
            filters = [...filters, splitInstance.id]
            nodes = {...nodes, [splitInstance.id]: splitInstance}
            // update inStream entries
            v.streamEntries.forEach((e, i) => {
                const instance = nodes[e.filter]
                if (instance?.type != 'filter') return
                const inStreams = [...instance.inStreams]
                inStreams[e.index] = {from: splitInstance.id, index: i}
                nodes[e.filter] = {...instance, inStreams}
            })
        })

    return [filters, nodes] as const
}


function completeGraph(target: TargetNode): TargetNode {
    // check target inStream / outStream, see if need to add filterNode (format)
    const inStreams = target.inStreams.map((inRef, i) => {
        const outS = target.outStreams[i]
        const inS = inRef.from.outStreams[inRef.index]

        if (inS.mediaType == 'video' && outS.mediaType == 'video') {
            // console.warn('disable pixel format convert')
            if (inS.pixelFormat != outS.pixelFormat)
                return applySingleFilter([inRef], {type: 'format', args: {pixelFormat: outS.pixelFormat}})[0]
        }
        else if (inS.mediaType == 'audio' && outS.mediaType == 'audio') {
            const keys = ['sampleFormat', 'sampleRate', 'channelLayout'] as const
            if (keys.some(k => inS[k] != outS[k])) {
                const { channelLayout, sampleFormat, sampleRate } = outS
                return applySingleFilter([inRef], {type: 'format', args: {channelLayout, sampleFormat, sampleRate }})[0]
            }
        }
        return inRef
    })

    return {...target, inStreams}
}