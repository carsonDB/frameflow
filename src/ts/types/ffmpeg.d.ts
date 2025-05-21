/// <reference types="emscripten" />
/** Above will import declarations from @types/emscripten, including Module etc. */



export interface AVRational { num: number, den: number }

interface StdVector<T> {
    size(): number
    get(i: number): T
    set(i: number, value: T): void
    push_back(t: T): void
    delete(): void
}

interface StdMap<T1, T2> {
    size(): number
    get(key: T1): T2
    keys(): StdVector<T1>
    set(key: T1, val: T2): void
}

class CppClass {
    delete(): void
    clone(): this
}

// demuxer
interface ReaderForDemuxer {
    size: number
    offset: number
    read: (buffer: Uint8Array) => Promise<number>
    seek: (pos: number) => Promise<void>
}
class Demuxer extends CppClass {
    constructor()
    build(reader: ReaderForDemuxer): Promise<void>
    seek(t: number, streamIndex: number): Promise<void>
    read(): Promise<Packet>
    getTimeBase(streamIndex: number): AVRational
    getMetadata(): FormatInfo
    currentTime(streamIndex: number): number
    dump(): void
}
interface FormatInfo {
    formatName: string
    bitRate: number
    duration: number
    streamInfos: StdVector<StreamInfo>
}

// decode
class Decoder extends CppClass {
    constructor(dexmuer: Demuxer, streamIndex: number, name: string)
    constructor(streamInfo: StreamInfo, name: string)
    name: number
    get timeBase(): AVRational
    get dataFormat(): DataFormat
    decode(packet: Packet): StdVector<Frame>
    flush(): StdVector<Frame>
}

// stream
class Stream extends CppClass {
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
    channelLayout: string
    sampleRate: number
}

// packet
interface TimeInfo {
    pts: number, dts: number, duration: number
}
class Packet extends CppClass {
    constructor()
    constructor(bufSize: number, timeInfo: TimeInfo)
    size: number
    key: boolean
    get streamIndex(): number
    getData(): Uint8Array
    getTimeInfo(): TimeInfo
    setTimeInfo(timeInfo: TimeInfo): void
    dump():void
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

class Frame extends CppClass {
    constructor(info: FrameInfo, pts: number, name: string);
    getFrameInfo(): FrameInfo
    static inferChannelLayout(channels: number): string
    getPlanes(): StdVector<Uint8Array>
    key: boolean
    pts: number
    dump():void
    name: string
}

// filter
class Filterer extends CppClass {
    constructor(inStreams: StdMap<string, string>, outStreams: StdMap<string, string>, mediaTypes: StdMap<string, string>, graphSpec: string)
    filter(frames: StdVector<Frame>): StdVector<Frame>
    flush(): StdVector<Frame>
    delete(): void
}
// bitstream filter
class BitstreamFilterer extends CppClass {
    constructor(filterName: string, demuxer: Demuxer, inStreamIndex: number, muxer: Muxer, outStreamIndex: number)
    filter(packet: Packet): void
    delete(): void
}

// encode
class Encoder extends CppClass {
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
class Muxer extends CppClass {
    constructor(formatName: string, writer: WriterForMuxer)
    static inferFormatInfo(format: string, filename: string): InferredFormatInfo
    dump(): void
    newStreamWithDemuxer(demuxer: Demuxer, streamIndex: number): void
    newStreamWithEncoder(encoder: Encoder): void
    newStreamWithInfo(streamInfo: StreamInfo): void
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
    BitstreamFilterer: typeof BitstreamFilterer
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

