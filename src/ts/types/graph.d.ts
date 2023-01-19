/**
 * definition of graphs:
 *  UserGraph -> GraphConfig -> GraphRuntime
 */

import { SourceType } from "../streamIO"

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
type UserNode = SourceNode | FilterNode | TargetNode
export type SourceType = ReadableStream<DataBuffer> | string | URL | Blob | DataBuffer
interface StreamRef { from: SourceNode | FilterNode, index: number }
export interface SourceNode {
    type: 'source', outStreams: StreamMetadata[], source: SourceType, url?: string
    format: { type: 'file', container: FormatMetadata, fileSize: number } | 
            { type: 'stream', elementType: 'image' | 'chunk' }
}

interface FilterNode {
    type: 'filter', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    filter: { name: string, ffmpegArgs: {[k in string]?: string | number} }
}

interface TargetNode {
    type: 'target', inStreams: StreamRef[], outStreams: StreamMetadata[], 
    format: { type: 'image' | 'video', container: FormatMetadata }
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