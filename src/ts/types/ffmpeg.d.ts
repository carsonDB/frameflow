/// <reference types="emscripten" />
/** Above will import declarations from @types/emscripten, including Module etc. */



export interface AVRational { num: number, den: number }

interface StdVector<T> {
    size(): number
    get(i: number): T
    set(i: number, T)
    push_back(T)
}

interface StdMap<T1, T2> {
    size(): number
    get(key: T1): T2
    keys(): StdVector<T1>
    set(key: T1, val: T2)
}

// demuxer
interface ReaderForDemuxer {
    size: number
    offset: number
    url: string
    read: (buffer: Uint8Array) => Promise<number>
    seek: (pos: number) => Promise<void>
}
class Demuxer {
    constructor()
    build(reader: ReaderForDemuxer): Promise<void>
    seek(t: number, streamIndex: number): Promise<void>
    read(): Promise<Packet>
    getTimeBase(streamIndex: number): AVRational
    getMetadata(): FormatInfo
    currentTime(streamIndex: number): number
    dump(): void
    delete(): void
}
interface FormatInfo {
    formatName: string
    bitRate: number
    duration: number
    streamInfos: StdVector<StreamInfo>
}

// decode
class Decoder {
    constructor(dexmuer: Demuxer, streamIndex: number, name: string)
    constructor(streamInfo: StreamInfo, name: string)
    name: number
    get timeBase(): AVRational
    get dataFormat(): DataFormat
    decode(packet: Packet): StdVector<Frame>
    flush(): StdVector<Frame>
    delete(): void
}

// stream
class Stream {
}

interface StreamInfo {
    index: number
    timeBase: AVRational
    bitRate: number
    startTime: number
    duration: number
    codecName: string
    mediaType: 'video' | 'audio' | undefined
    format: string // pixelFormat if codecType is 'video'; sampleFormat if codecType is 'audio'
    extraData: Uint8Array
    // video
    width: number
    height: number
    frameRate: number
    sampleAspectRatio: AVRational
    // audio
    channels: number
    channelLayout: string
    sampleRate: number
}

interface DataFormat {
    format: string // pixel_fmt / sample_fmt
    channels: number
    channel_layout: string
    sample_rate: number
}

// packet
interface TimeInfo {
    pts: number, dts: number, duration: number
}
class Packet {
    constructor()
    constructor(bufSize: number, timeInfo: TimeInfo)
    size: number
    key: boolean
    get streamIndex(): number
    getData(): Uint8Array
    getTimeInfo(): TimeInfo
    dump():void
    delete(): void
}

// frame
interface FrameInfo {
    format: string
    height: number
    width: number
    sampleRate: number
    channels: number
    channelLayout: string;
    nbSamples: number;
}

class Frame {
    constructor(info: FrameInfo, pts: number, name: string);
    getFrameInfo(): FrameInfo
    getPlanes(): StdVector<Uint8Array>
    key: boolean
    pts: number
    dump():void
    delete(): void
    name: string
}

// filter
class Filterer {
    constructor(inStreams: StdMap<string, string>, outStreams: StdMap<string, string>, mediaTypes: StdMap<string, string>, graphSpec: string)
    filter(frames: StdVector<Frame>): StdVector<Frame>
    delete(): void
}

// encode
class Encoder {
    constructor(params: StreamInfo)
    get timeBase(): AVRational
    get dataFormat(): DataFormat
    encode(f: Frame): StdVector<Packet>
    flush(): StdVector<Packet>
    delete(): void
}

// inferred info
interface InferredStreamInfo {
    codecName: string
    format: string // pix_format / sample_format
}

interface InferredFormatInfo {
    format: string,
    video: InferredStreamInfo
    audio: InferredStreamInfo
}

interface WriterForMuxer {
    write(data: Uint8Array): void
    seek(pos: number): void
}

// muxer
class Muxer {
    constructor(formatName: string, writer: WriterForMuxer)
    static inferFormatInfo(format: string, filename: string): InferredFormatInfo
    dump(): void
    newStream(encoder: Encoder, time_base): void
    newStream(streamInfo: StreamInfo): void
    // openIO(): void
    writeHeader(): void
    writeTrailer(): void
    writeFrame(packet: Packet, streamIndex: number): void
    delete(): void
}

interface ModuleClass {
    Demuxer: typeof Demuxer
    Muxer: typeof Muxer
    Decoder: typeof Decoder
    Encoder: typeof Encoder
    Frame: typeof Frame
    Packet: typeof Packet
    Filterer: typeof Filterer
}

type ModuleInstance = {[k in keyof ModuleClass]: InstanceType<ModuleClass[k]>}

interface ModuleFunction {
    setConsoleLogger(verbose: boolean): void
    createFrameVector(): StdVector<Frame>
    createStringStringMap(): StdMap<string, string>
}

export interface FFmpegModule extends ModuleClass, ModuleFunction, EmscriptenModule {}
export interface ModuleType extends ModuleInstance, ModuleFunction {}

export default function createFFmpegModule<T extends FFmpegModule = FFmpegModule>(moduleOverrides?: Partial<T>): Promise<T>

