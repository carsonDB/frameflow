/**
 * definition of graphs:
 *  UserGraph -> GraphInstance -> GraphRuntime
 */

import { SourceStream } from "../globals"

export type BufferData = Uint8Array
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
    extraData: Uint8Array
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
export type UserNode = SourceNode | FilterNode | TargetNode
export type SourceType = ReadableStream<ChunkData> | string | URL | RequestInfo | Blob | BufferData
type FileSource = string | URL | RequestInfo | Blob | BufferData
type StreamSource = SourceStream<ChunkData>
export interface StreamRef { from: SourceNode | FilterNode, index: number }
export interface SourceNode {
    type: 'source', outStreams: StreamMetadata[], url?: string
    data: { type: 'file', container: FormatMetadata, fileSize: number, source: FileSource } | 
            { type: 'stream', container?: FormatMetadata, elementType: 'frame' | 'chunk', source: StreamSource }
}

export interface FilterNode {
    type: 'filter', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    filter: { name: string, ffmpegArgs: string | {[k in string]?: string | number} }
}

export interface TargetNode {
    type: 'target', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    format: { type: 'frame' | 'video', container: FormatMetadata }
}

export type StreamInstanceRef = {from: string, index: number}
export type SourceInstance = 
    Omit<SourceNode, "data"> & 
    {id: string} & 
    {data: Omit<Exclude<SourceNode['data'], {type: "file"}>, "source"> | 
           Omit<Exclude<SourceNode['data'], {type: "stream"}>, "source"> }
export type FilterInstance = Omit<FilterNode, "inStreams"> & {inStreams: StreamInstanceRef[], id: string}
export type TargetInstance = Omit<TargetNode, "inStreams"> & {inStreams: StreamInstanceRef[], id: string}

/**
 * graph instance for execution
 */
export interface GraphInstance {
    nodes: {[id in string]?: SourceInstance | FilterInstance | TargetInstance}
    sources: string[]
    filterInstance?: {
        inputs: StreamInstanceRef[],
        outputs: StreamInstanceRef[]
        filters: string[],
    }
    targets: string[]
}