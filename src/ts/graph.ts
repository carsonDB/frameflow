/**
 * definition of graphs:
 *  UserGraph -> GraphConfig -> GraphRuntime
 */

interface Rational {num: number, den: number}
/**
 * all kinds of metadata infomation
 */

export interface FormatMetadata {
    formatName: string
    duration: number
    bitRate: number
}

interface CommonStreamMetadata {
    index: number,
    timeBase: Rational
    startTime: number,
    duration: number,
    bitRate: number,
    codecName: string,
}

export interface VideoStreamMetadata extends CommonStreamMetadata {
    mediaType: 'video'
    height: number,
    width: number,
    pixelFormat: string
    frameRate: Rational
    sampleAspectRatio: Rational
}

export interface AudioStreamMetadata extends CommonStreamMetadata {
    mediaType: 'audio'
    volume: number
    sampleFormat: string
    sampleRate: number
    channels: number
    channelLayout: string
}

export type StreamMetadata = AudioStreamMetadata | VideoStreamMetadata


/**
 * user defined graph
 */
// type UserGraphNode = SourceNode | FilterNode | TargetNode
export interface StreamRef { from: SourceNode | FilterNode, index: number }

export interface SourceNode {
    type: 'source', id: string, outStreams: StreamMetadata[],
    format: { type: 'file', container: FormatMetadata } | 
            { type: 'stream', elementType: 'image' | 'chunk' }
}

export interface FilterNode {
    type: 'filter', id: string, inStreams: StreamRef[], outStreams: StreamMetadata[], 
    filter: { name: string, args: {[k in string]: string | number} }
}

export interface TargetNode {
    type: 'target', id: string, inStreams: StreamRef[], outStreams: StreamMetadata[], 
    format: { type: 'image' | 'video', container: FormatMetadata }
}

/**
 * graph config for execution
 */
export interface GraphConfig {
    sources: SourceNode[]
    filterConfig?: {
        inputs: StreamRef[],
        outputs: StreamRef[]
        filters: FilterNode[],
    }
    target: TargetNode
}

/**
 * given endpoints, backtrace until sources.
 */
export function buildGraphConfig(target: TargetNode): GraphConfig {
    const sources: SourceNode[] = []
    const filterConfig: GraphConfig['filterConfig'] = {
        inputs: [],
        outputs: [],
        filters: [],
    }
    const traversal = (streamRefs: StreamRef[]) => streamRefs.forEach(({from}) => {
        if (from.type == 'source') sources.push(from)
        else if (from.type == 'filter') {
            filterConfig.filters.push(from)
            from.inStreams.forEach(ref => ref.from.type == 'source' && filterConfig.inputs.push(ref))
            traversal(from.inStreams)
        }
    })
    target.inStreams.forEach(ref => ref.from.type == 'filter' && filterConfig.outputs.push(ref))

    return {sources, filterConfig: (filterConfig.filters.length > 0 ? filterConfig: undefined), target}
}
