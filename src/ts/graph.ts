import { v4 as uuid } from 'uuid'
import { applySingleFilter } from './filters'
import { GraphInstance, StreamRef, TargetNode, UserNode } from './types/graph'

/**
 * given endpoints, backtrace until sources.
 * - make up some filterNodes (e.g. resample)
 * - tree shake and optimize the graph (todo...)
 * - convert to graphInstance (easy for further work)
 */
export function buildGraphInstance(target: TargetNode): [GraphInstance, Map<UserNode, string>] {
    // make up graph
    target = completeGraph(target) // todo... remove data format conversion

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
    const nodeInstances: GraphInstance['nodes'] = {}
    const filterInstance: GraphInstance['filterInstance'] = {
        inputs: [],
        outputs: [],
        filters: [],
    }
    node2id.forEach((id, node) => {
        if (node.type == 'source') {
            sources.push(id)
            const {source: _, ...rest} = node
            nodeInstances[id] = {...rest, id}
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

    })
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


function completeGraph(target: TargetNode): TargetNode {
    // check target inStream / outStream, see if need to add filterNode (format)
    const inStreams = target.inStreams.map((inRef, i) => {
        const outS = target.outStreams[i]
        const inS = inRef.from.outStreams[inRef.index]

        if (inS.mediaType == 'video' && outS.mediaType == 'video') {
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