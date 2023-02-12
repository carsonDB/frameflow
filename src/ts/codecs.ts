import { getFFmpeg, vec2Array } from './transcoder.worker'
import * as FF from './types/ffmpeg'
import { AVRational } from './types/ffmpeg'


type WebPacket = EncodedVideoChunk | EncodedAudioChunk
type WebFrame = VideoFrame | AudioData
type WebEncoder = VideoEncoder | AudioEncoder
type WebDecoder = VideoDecoder | AudioDecoder

const baseTimeBase = {num: 1, den: 1_000_000}

const ts_rescale = (time: number, from: AVRational, to: AVRational) => {
    return time * from.num / from.den * to.den / to.num
}


const dataFormatMap: 
    { pixel: {ff: string, web: VideoPixelFormat}[], 
      sample: {ff: string, web: AudioSampleFormat}[] } = 
{
    pixel: [
        {ff: 'yuv420p', web: 'I420'},
        {ff: 'yuva420p', web: 'I420A'},
        {ff: 'yuv422p', web: 'I422'},
        {ff: 'yuv444p', web: 'I444'},
        {ff: 'nv12', web: 'NV12'},
        {ff: 'rgba', web: 'BGRA'},
        // todo...
        {ff: '0rgb', web: 'RGBX'},
        {ff: 'bgra', web: 'BGRA'},
        {ff: '0bgr', web: 'BGRX'},
    ],
    sample: [
        {ff: 'u8', web: 'u8'},
        {ff: 'u8p', web: 'u8-planar'},
        {ff: 's16', web: 's16'},
        {ff: 's16p', web: 's16-planar'},
        {ff: 's32', web: 's32'},
        {ff: 's32p', web: 's32-planar'},
        {ff: 'flt', web: 'f32'},
        {ff: 'fltp', web: 'f32-planar'},
    ],
}

function formatFF2Web<T extends 'pixel' | 'sample'>(type: T, format: string): typeof dataFormatMap[T][0]['web'] {
    for (const {ff, web} of dataFormatMap[type])
        if (ff == format) return web
    throw `Cannot find ${type} format: FF ${format}`
}

function formatWeb2FF<T extends 'pixel' | 'sample'>(type: T, format: typeof dataFormatMap[T][0]['web']): string {
    for (const {ff, web} of dataFormatMap[type])
        if (web == format) return ff
    throw `Cannot find ${type} format: Web ${format}`
}


// map from FFmpeg pixelFormat to [WebCodecs.VideoPixelFormat, pixelSize]
const sampleFormatMap: {[k in string]?: [AudioSampleFormat, number]} = {

}

const codecMap: {[k in string]?: string} = {
    // av1: ,
    vp8: 'vp8',
    h264: 'avc1.420034',
}

export class Packet {
    FFPacket?: FF.Packet
    WebPacket?: WebPacket
    dts = 0
    mediaType: 'video' | 'audio'
    constructor(pkt: FF.Packet | {packet: WebPacket, dts: number}, mediaType: 'video' | 'audio') {
        if (pkt instanceof FF.Packet)
            this.FFPacket = pkt
        else {
            this.dts = pkt.dts
            this.WebPacket = pkt.packet
        }
        this.mediaType = mediaType
    }

    toFF(toTimeBase: AVRational) {
        if (!this.FFPacket && this.WebPacket) {
            const pts = ts_rescale(this.WebPacket.timestamp, baseTimeBase, toTimeBase)
            const dts = ts_rescale(this.dts, baseTimeBase, toTimeBase)
            const duration = ts_rescale(this.WebPacket.duration??0, baseTimeBase, toTimeBase)
            this.FFPacket = new (getFFmpeg()).Packet(this.WebPacket.byteLength, {pts, dts, duration})
            this.WebPacket.copyTo(this.FFPacket.getData())
        }
        return this.FFPacket
    }

    toWeb(fromTimeBase: AVRational) {
        if (!this.WebPacket && this.FFPacket) {
            const timeInfo = this.FFPacket.getTimeInfo()
            const timestamp = ts_rescale(timeInfo.pts, fromTimeBase, baseTimeBase)
            const duration = ts_rescale(timeInfo.duration, fromTimeBase, baseTimeBase)
            const init = {
                type: this.FFPacket.key ? 'key' : 'delta' as EncodedVideoChunkType, 
                data: this.FFPacket.getData(), 
                timestamp, 
                duration
            }
            this.WebPacket = this.mediaType == 'video' ? 
                new EncodedVideoChunk(init) : new EncodedAudioChunk(init)
        }

        return this.FFPacket
    }

    close() {
        this.FFPacket?.delete()
        // WebPacket no need to close
    }
}

export class Frame {
    FFFrame?: FF.Frame
    WebFrame?: WebFrame
    streamInfo: FF.StreamInfo
    constructor(frame: FF.Frame | WebFrame, streamInfo: FF.StreamInfo) {
        if (frame instanceof FF.Frame)
            this.FFFrame = frame
        else
            this.WebFrame = frame

        this.streamInfo = streamInfo
    }

    toFF(toTimeBase: AVRational) {
        if (!this.FFFrame && this.WebFrame) {
            const pts = ts_rescale(this.WebFrame.timestamp??0, baseTimeBase, toTimeBase)
            this.FFFrame = new (getFFmpeg()).Frame(pts)
            const {format, height, width} = this.streamInfo
            // todo... format maybe changed for encoder
            this.FFFrame.videoReInit(format, height, width)
            const planes = vec2Array(this.FFFrame.getPlanes())
            planes.forEach((p, i) => this.WebFrame?.copyTo(p, {planeIndex: i}))
        }

        return this.FFFrame
    }

    toWeb(fromTimeBase: AVRational) {
        if (!this.WebFrame && this.FFFrame) {
            const timestamp = ts_rescale(this.FFFrame.pts, fromTimeBase, baseTimeBase)
            // get planes data from AVFrame
            const planes = vec2Array(this.FFFrame.getPlanes())
            const data = new Uint8Array(planes.reduce((l, d) => l + d.byteLength, 0))

            if (this.streamInfo.mediaType == 'video') {
                const format = formatFF2Web('pixel', this.streamInfo.format)
                const init: VideoFrameBufferInit = {
                    timestamp,
                    codedHeight: this.streamInfo.height,
                    codedWidth: this.streamInfo.width,
                    format
                }
                planes.reduce((offset, d) => {
                    data.set(d, offset)
                    return offset + d.byteLength
                }, 0)
                this.WebFrame = new VideoFrame(data, init)
            }
            else {
                const format = formatFF2Web('sample', this.streamInfo.format)
                const init: AudioDataInit = {
                    data,
                    timestamp,
                    numberOfChannels: this.streamInfo.channels,
                    numberOfFrames: 1, // todo...
                    format,
                    sampleRate: this.streamInfo.sampleRate,
                }
                this.WebFrame = new AudioData(init)
            }
        }

        return this.WebFrame
    }

    close() {
        this.FFFrame?.delete()
        this.WebFrame?.close()
    }
}

export class Encoder {
    encoder: FF.Encoder | WebEncoder
    streamInfo: FF.StreamInfo
    outputs: WebPacket[] = []

    constructor(streamInfo: FF.StreamInfo, useWebCodecs: boolean) {
        this.streamInfo = streamInfo
        // check if webCodecs support given configuration
        if (useWebCodecs) {
            if (streamInfo.mediaType == 'video') {
                this.encoder = new VideoEncoder({
                    output: (chunk) => this.outputs.push(chunk), 
                    error: e => console.error(e.message)
                })
            }
            else {
                this.encoder = new AudioEncoder({
                    output: (chunk) => this.outputs.push(chunk),
                    error: e => console.error(e.message)
                })
            }
        }
        else {
            this.encoder = new (getFFmpeg()).Encoder(streamInfo)
        }
    }

    /** clear output buffers */
    #flushOutputs() { return this.outputs.splice(0, this.outputs.length) }

    async encode(frame: WebFrame | FF.Frame) {
        const mediaType = this.streamInfo.mediaType
        if (!mediaType) throw `Encoder: streamInfo.mediaType is undefined`
        if (frame instanceof FF.Frame && this.encoder instanceof FF.Encoder) {
            const dts = 0; // todo...
            return vec2Array(this.encoder.encode(frame)).map(p => new Packet(p, mediaType))
        }
        else if (this.encoder instanceof VideoEncoder && frame instanceof VideoFrame) {
            this.encoder.encode(frame) // dts...
        }
        else if (this.encoder instanceof AudioEncoder && frame instanceof AudioData) {
            this.encoder.encode(frame) // dts...
        }
        
        return this.#flushOutputs()
    }

    async flush() {
        if (this.encoder instanceof FF.Encoder) {
            return vec2Array(this.encoder.flush())
        }
        else {
            await this.encoder.flush()
        }

        return this.#flushOutputs()
    }

    close() {
        if (this.encoder instanceof FF.Encoder)
            this.encoder.delete()
        else
            this.encoder.close()
    }
}


export class Decoder {
    decoder: FF.Decoder | WebDecoder
    outputs: WebFrame[] = []
    streamInfo: FF.StreamInfo
    constructor(demuxer: FF.Demuxer, name: string, streamInfo: FF.StreamInfo, useWebCodecs: boolean) {
        this.streamInfo = streamInfo

        if (useWebCodecs) {
            if (streamInfo.mediaType == 'video') {
                const decoder = new VideoDecoder({
                    output: frame => this.outputs.push(frame),
                    error: e => console.error(e.message)
                })
                decoder.configure({ 
                    codec: codecMap[streamInfo.codecName]??'',  // todo...
                    codedHeight: streamInfo.height,
                    codedWidth: streamInfo.width,
                })
                this.decoder = decoder
            }
            else {
                const decoder = new AudioDecoder({
                    output: frame => this.outputs.push(frame),
                    error: e => console.error(e.message)
                })
                decoder.configure({ 
                    codec: codecMap[streamInfo.codecName]??'',  // todo...
                    numberOfChannels: streamInfo.channels,
                    sampleRate: streamInfo.sampleRate
                })
                this.decoder = decoder
            }
        }
        else {
            this.decoder = new (getFFmpeg()).Decoder(demuxer, streamInfo.index, name)
        }
    }

    static isWebCodecsSupport(streamInfo: FF.StreamInfo) {

    }

    async decode(pkt: Packet) {

    }

    async flush() {
        if (this.decoder instanceof FF.Decoder) {
            return vec2Array(this.decoder.flush()).map(f => new Frame(f, this.streamInfo))
        }
        else {
            await this.decoder.flush()
            return // todo...
        }
    }

    close() {
        if (this.decoder instanceof FF.Decoder)
            this.decoder.delete()
        else
            this.decoder.close()
    }
}