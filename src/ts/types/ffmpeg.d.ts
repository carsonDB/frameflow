/// <reference types="emscripten" />
/** Above will import declarations from @types/emscripten, including Module etc. */



interface AVRational { num: number, den: number }

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
    current: number
    url: string
    read: (buffer: Uint8Array) => Promise<number>
    seek: (pos: number) => Promise<void>
}
class Demuxer {
    constructor()
    build(reader: ReaderForDemuxer): Promise<void>
    seek(t: number, streamIndex: number): Promise<void>
    read(): Promise<Packet>
    getMetadata(): FormatInfo
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
    constructor(params: string, name: string)
    decode(packet: Packet): StdVector<Frame>
    name: number
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
    // video
    width: number
    height: number
    frameRate: AVRational
    sampleAspectRatio: AVRational
    // audio
    channels: number
    channelLayout: string
    sampleRate: number
}

// packet
class Packet {
    constructor()
    constructor(bufSize: number, pts: number)
    size: number
    get streamIndex(): number
    set streamIndex(index: number)
    getData(): Uint8Array
    delete(): void
}

// frame
class Frame {
    getData(plane_index: number): Uint8Array
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

// muxer
class Muxer {
    constructor(formatName: string, onWrite: (data: Uint8Array) => void)
    static inferFormatInfo(format: string, filename: string): InferredFormatInfo
    dump(): void
    newStream(encoder: Encoder): void
    openIO(): void
    writeHeader(): void
    writeTrailer(): void
    writeFrame(packet: Packet): void
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
    createFrameVector(): StdVector<Frame>
    createStringStringMap(): StdMap<string, string>
}

export interface FFmpegModule extends ModuleClass, ModuleFunction, EmscriptenModule {}
export interface ModuleType extends ModuleInstance, ModuleFunction {}

export default function createFFmpegModule<T extends FFmpegModule = FFmpegModule>(moduleOverrides?: Partial<T>): Promise<T>

