/**
 * definition of graphs:
 *  UserGraph -> GraphConfig -> GraphRuntime
 */

import { SourceType } from "../streamIO"

export type BufferData = Uint8Array | Buffer
export type ChunkData = BufferData | VideoFrame | AudioData
export interface WriteChunkData { data: ChunkData, offset: number }


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

/**
 * Video Track (stream) metadata
 */
export interface VideoStreamMetadata extends CommonStreamMetadata {
    /**
     * mediaType = 'video' or 'audio'
     */
    mediaType: 'video'
    /**
     * height of video frame
     */
    height: number,
    width: number,
    pixelFormat: string
    frameRate: number
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
type UserNode = SourceNode | FilterNode | TargetNode
export type SourceType = ReadableStream<BufferData> | string | URL | RequestInfo | Blob | BufferData
interface StreamRef { from: SourceNode | FilterNode, index: number }
export interface SourceNode {
    type: 'source', outStreams: StreamMetadata[], source: SourceType, url?: string
    format: { type: 'file', container: FormatMetadata, fileSize: number } | 
            { type: 'stream', elementType: 'frame' | 'chunk' }
}

interface FilterNode {
    type: 'filter', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    filter: { name: string, ffmpegArgs: string | {[k in string]?: string | number} }
}

interface TargetNode {
    type: 'target', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    format: { type: 'frame' | 'video', container: FormatMetadata }
}

type StreamConfigRef = {from: string, index: number}
type SourceConfig = Omit<SourceNode, "source"> & {id: string}
type FilterConfig = Omit<FilterNode, "inStreams"> & {inStreams: StreamConfigRef[], id: string}
type TargetConfig = Omit<TargetNode, "inStreams"> & {inStreams: StreamConfigRef[], id: string}

/**
 * graph config for execution
 */
export interface GraphConfig {
    nodes: {[id in string]?: SourceConfig | FilterConfig | TargetConfig}
    sources: string[]
    filterConfig?: {
        inputs: StreamConfigRef[],
        outputs: StreamConfigRef[]
        filters: string[],
    }
    targets: string[]
}