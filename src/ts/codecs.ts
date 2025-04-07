/**
 * Unified WebCodecs (Web*) and FFmpeg (FF*) encoder/decoder/packet/frame.
 * All packet/frame assume time_base={num: 1, den: 1e6}
 * TODO...
 */
import { dataFormatMap, formatFF2Web, formatWeb2FF } from './metadata'
import { getFFmpeg, vec2Array } from './transcoder.worker'
import { ModuleType as FF, FrameInfo, StreamInfo, StdVector, DataFormat } from './types/ffmpeg'
import { Log } from './utils'


type WebPacket = EncodedVideoChunk | EncodedAudioChunk
type WebFrame = VideoFrame | AudioData
type WebEncoder = VideoEncoder | AudioEncoder
type WebDecoder = VideoDecoder | AudioDecoder



// check https://cconcolato.github.io/media-mime-support/
// https://developer.mozilla.org/en-US/docs/Web/Media/Formats/codecs_parameter
const codecMap: {[k in string]?: string} = {
    // video codec https://www.w3.org/TR/webcodecs-codec-registry/#video-codec-registry
    av1: 'av01.0.04M.08',
    vp8: 'vp8',
    h264: "avc1.640034",
    vp9: 'vp09.00.10.08',
    hevc: 'hev1.1.6.L93.B0',
    // audio codec https://www.w3.org/TR/webcodecs-codec-registry/#audio-codec-registry
    flac: 'flac',
    mp3: 'mp3',
    mp4a: 'mp4a.40.2',
    opus: 'opus',
    vorbis: 'vorbis',
    // pcm: 'pcm-u8' // todo... not work
}

export class Packet {
    FFPacket?: FF['Packet']
    WebPacket?: WebPacket
    dts: number
    mediaType: 'video' | 'audio'
    constructor(pkt: FF['Packet'] | WebPacket, dts: number, mediaType: 'video' | 'audio') {
        this.dts = dts
        this.mediaType = mediaType
        if (pkt instanceof getFFmpeg().Packet) {
            this.FFPacket = pkt
        }
        else {
            // todo...
            if (this.dts == 0)
                this.dts = pkt.timestamp
            this.WebPacket = pkt
        }
    }

    get size() {
        return this.FFPacket?.size ?? this.WebPacket?.byteLength ?? 0
    }

    get duration() {
        return this.FFPacket?.getTimeInfo().duration ?? this.WebPacket?.duration ?? 0
    }

    toFF() {
        if (!this.FFPacket && this.WebPacket) {
            const timeInfo = {
                pts: this.WebPacket.timestamp,
                dts: this.dts,
                duration: this.WebPacket.duration ?? 0
            }
            this.FFPacket = new (getFFmpeg()).Packet(this.WebPacket.byteLength, timeInfo)
            this.WebPacket.copyTo(this.FFPacket.getData())
        }
        if (!this.FFPacket) throw `Packet.toFF failed`

        return this.FFPacket
    }

    toWeb() {
        if (!this.WebPacket && this.FFPacket) {
            const {pts, duration} = this.FFPacket.getTimeInfo()
            const init = {
                type: this.FFPacket.key ? 'key' : 'delta' as EncodedVideoChunkType, 
                data: this.FFPacket.getData(), 
                timestamp: pts, 
                duration,
            }
            this.WebPacket = this.mediaType == 'video' ? 
                new EncodedVideoChunk(init) : new EncodedAudioChunk(init)
        }
        if (!this.WebPacket) throw `Packet.toWeb failed`

        return this.WebPacket
    }

    close() {
        this.FFPacket?.delete()
        // WebPacket no need to close
    }
}

export class Frame {
    FFFrame?: FF['Frame']
    WebFrame?: WebFrame
    #name: string
    constructor(frame: FF['Frame'] | WebFrame | undefined, name: string) {
        this.#name = name
        if (frame instanceof getFFmpeg().Frame) {
            this.FFFrame = frame
        }
        else {
            this.WebFrame = frame
        }
    }

    get name() { return this.#name }

    get pts() {
        return this.FFFrame?.pts ?? this.WebFrame?.timestamp ?? 0
    }

    get frameInfo() {
        if (this.FFFrame) {
            return this.FFFrame.getFrameInfo()
        }
        else if (this.WebFrame instanceof VideoFrame && this.WebFrame.format) {
            return {
                format: formatWeb2FF('pixel', this.WebFrame.format), 
                height: this.WebFrame.codedHeight,
                width: this.WebFrame.codedWidth,
                sampleRate: 0,
                channels: 0,
                channelLayout: ''
            }
        }
        else if (this.WebFrame instanceof AudioData) {
            return {
                format: formatWeb2FF('sample', this.WebFrame.format ?? 's16'), 
                channels: this.WebFrame.numberOfChannels,
                channelLayout: getFFmpeg().Frame.inferChannelLayout(this.WebFrame.numberOfChannels),
                sampleRate: this.WebFrame.sampleRate,
                height: 0,
                width: 0,
            }
        }
        throw `Frame get dataFormat failed`
    }

    async toFF() {
        if (!this.FFFrame && this.WebFrame && this.WebFrame.format) {
            // default values
            const frameInfo: FrameInfo = {
                format: '', height: 0, width: 0, channelLayout: '', channels: 0, sampleRate: 0, nbSamples: 0}

            if (this.WebFrame instanceof VideoFrame) {
                frameInfo.format = formatWeb2FF('pixel', this.WebFrame.format) // todo...
                frameInfo.height = this.WebFrame.codedHeight
                frameInfo.width = this.WebFrame.codedWidth
            }
            else {
                frameInfo.format = formatWeb2FF('sample', this.WebFrame.format) // required FF format
                frameInfo.channels = this.WebFrame.numberOfChannels
                frameInfo.sampleRate = this.WebFrame.sampleRate
                frameInfo.nbSamples = this.WebFrame.numberOfFrames
            }
            this.FFFrame = new (getFFmpeg()).Frame(frameInfo, this.WebFrame.timestamp ?? 0, this.#name)
            const planes = vec2Array(this.FFFrame.getPlanes())
            if (this.WebFrame instanceof VideoFrame)
                // await this.WebFrame.copyTo(planes, { layout: planes.map(p => ({offset: 0, stride: 1})) })
                throw `VideoFrame to FFFrame has not implemented.`
            else
                for (const [i, p] of planes.entries()) {
                    this.WebFrame?.copyTo(p, { planeIndex: i })
                }
        }
        if (!this.FFFrame) throw `Frame.toFF() failed`

        return this.FFFrame
    }

    toWeb(frameRate: number) {
        if (!this.WebFrame && this.FFFrame) {
            // get planes data from AVFrame
            const planes = vec2Array(this.FFFrame.getPlanes())
            const data = new Uint8Array(planes.reduce((l, d) => l + d.byteLength, 0))
            const frameInfo = this.FFFrame.getFrameInfo()
            const isVideo = frameInfo.height > 0 && frameInfo.width > 0
            
            if (isVideo) {
                const init: VideoFrameBufferInit = {
                    timestamp: this.FFFrame.pts,
                    codedHeight: frameInfo.height,
                    codedWidth: frameInfo.width,
                    format: formatFF2Web('pixel', frameInfo.format),
                    duration: 1 / frameRate * 1e6
                }
                planes.reduce((offset, d) => {
                    data.set(d, offset)
                    return offset + d.byteLength
                }, 0)
                this.WebFrame = new VideoFrame(data, init)
            }
            else {
                const init: AudioDataInit = {
                    data,
                    timestamp: this.FFFrame.pts,
                    numberOfChannels: frameInfo.channels,
                    numberOfFrames: frameInfo.nbSamples, // todo...
                    format: formatFF2Web('sample', frameInfo.format),
                    sampleRate: frameInfo.sampleRate,
                }
                this.WebFrame = new AudioData(init)
            }
        }
        if (!this.WebFrame) throw `Frame.toWeb failed`

        return this.WebFrame
    }

    clone() {
        const cloned = new Frame(undefined, this.#name)
        cloned.FFFrame = this.FFFrame?.clone()
        cloned.WebFrame = this.WebFrame?.clone()
        return cloned
    }

    close() {
        this.FFFrame?.delete()
        this.WebFrame?.close()
    }
}


const videoEncorderConfig = (streamInfo: StreamInfo) => {
    const config: VideoEncoderConfig = {
        codec: codecMap[streamInfo.codecName] ?? '',
        bitrate: streamInfo.bitRate || undefined,
        height: streamInfo.height,
        width: streamInfo.width,
        framerate: streamInfo.frameRate,
    }
    
    // H.264 specific optimizations
    if (config.codec.includes('avc')) {
        config.avc = {
            format: 'annexb',
        }
    }
    
    return config
}

const audioEncoderConfig = (streamInfo: StreamInfo): AudioEncoderConfig => ({
    codec: codecMap[streamInfo.codecName] ?? '',
    bitrate: streamInfo.bitRate || undefined,
    numberOfChannels: streamInfo.channels,
    sampleRate: streamInfo.sampleRate,
})


export class Encoder {
    encoder: FF['Encoder'] | WebEncoder
    streamInfo: StreamInfo
    outputs: WebPacket[] = []
    #dts = 0
    #frameCount = 0
    /**
     * @param useWebCodecs check `Encoder.isWebCodecsSupported` before contructor if `true`
     */
    constructor(streamInfo: StreamInfo, useWebCodecs: boolean, muxFormat: string) {
        this.streamInfo = streamInfo
        if (useWebCodecs) {
            if (streamInfo.mediaType == 'video') {
                this.encoder = new VideoEncoder({
                    output: (chunk) => this.outputs.push(chunk), 
                    error: e => console.error(e.message)
                })
                this.encoder.configure(videoEncorderConfig(streamInfo))
            }
            else {
                this.encoder = new AudioEncoder({
                    output: (chunk) => this.outputs.push(chunk),
                    error: e => console.error(e.message)
                })
                this.encoder.configure(audioEncoderConfig(streamInfo))
            }
            // Log('WebCodecs:', this.encoder.constructor.name)
        }
        else {
            const info = getFFmpeg().Muxer.inferFormatInfo(muxFormat, '')
            const newStreamInfo = {...streamInfo, ...info[streamInfo.mediaType ?? 'audio']}
            this.encoder = new (getFFmpeg()).Encoder(newStreamInfo)
        }
    }

    static async isWebCodecsSupported(streamInfo: StreamInfo) {
        if (!('VideoEncoder' in self)) return false

        // todo... config override
        if (streamInfo.mediaType == 'video') {
            try {
                const { supported, config } = await VideoEncoder.isConfigSupported(videoEncorderConfig(streamInfo))
                if (!supported)
                    Log(supported,config, streamInfo)
                return supported
            }
            catch (e) {
                Log(e)
                return false
            }
        }
        else if (streamInfo.mediaType == 'audio') {
            try {
                const { supported, config } = await AudioEncoder.isConfigSupported(audioEncoderConfig(streamInfo))
                if (!supported)
                    Log(supported,config, streamInfo)
                return supported
            }
            catch (e) {
                Log(e)
                return false
            }
        }

        return false
    }

    toSupportedFormat(dataFormat: DataFormat) {
        if (this.encoder instanceof VideoEncoder) {
            const match = dataFormatMap.pixel.find(({ff}) => dataFormat.format == ff)
            return match ? dataFormat : {...dataFormat, format: dataFormatMap.pixel[0].ff}
        }
        else if (this.encoder instanceof AudioEncoder) {
            const match = dataFormatMap.sample.find(({ff}) => dataFormat.format == ff)
            return match ? dataFormat : {...dataFormat, format: dataFormatMap.sample[0].ff}
        }
        else {
            return this.encoder.dataFormat
        }
    }

    get FFEncoder() {
        return this.encoder instanceof getFFmpeg().Encoder ? this.encoder : undefined
    }

    #getPackets(pktVec?: StdVector<FF['Packet']>) { 
        const pkts1 = pktVec ? vec2Array(pktVec) : []
        const pkts2 = this.outputs.splice(0, this.outputs.length)
        const mediaType = this.streamInfo.mediaType
        if (!mediaType) throw `Encoder.#getPackets mediaType is undefined`
        return [...pkts1, ...pkts2].map(p => {
            // todo... packet pts, dts
            const pkt = new Packet(p, this.#dts, mediaType)
            this.#dts += pkt.duration
            return pkt
        })
    }

    async encode(frame: Frame): Promise<Packet[]> {
        const mediaType = this.streamInfo.mediaType
        if (!mediaType) throw `Encoder: streamInfo.mediaType is undefined`
        this.#frameCount++
        // FFmpeg
        if (this.encoder instanceof getFFmpeg().Encoder) {
            return this.#getPackets(this.encoder.encode(await frame.toFF()))
        }
        // WebCodecs
        const encoder = this.encoder
        const getPackets = this.#getPackets.bind(this)
        const dequeuePromise = () => new Promise<Packet[]>((resolve) => {
                encoder.addEventListener('dequeue', function onDequeue() {
                    resolve(getPackets())
                    encoder.removeEventListener('dequeue', onDequeue)
                })
            })
        const webFrame = frame.toWeb(this.streamInfo.frameRate)
        if (this.encoder instanceof VideoEncoder && webFrame instanceof VideoFrame) {
            this.encoder.encode(webFrame, { keyFrame: (this.#frameCount - 1) % 12 == 0 })
            return dequeuePromise()
        }
        else if (this.encoder instanceof AudioEncoder && webFrame instanceof AudioData) {
            this.encoder.encode(webFrame)
            return dequeuePromise()
        }
        else
            throw `Encoder.encode frame failed`
    }

    async flush() {
        if (this.encoder instanceof getFFmpeg().Encoder) {
            return this.#getPackets(this.encoder.flush())
        }
        else {
            await this.encoder.flush()
            return this.#getPackets()
        }
    }

    close() {
        if (this.encoder instanceof getFFmpeg().Encoder)
            this.encoder.delete()
        else
            this.encoder.close()
    }
}


const videoDecorderConfig = (streamInfo: StreamInfo): VideoDecoderConfig => ({
    codec: codecMap[streamInfo.codecName]??'',
    codedHeight: streamInfo.height,
    codedWidth: streamInfo.width,
    description: streamInfo.extraData,
})

const audioDecoderConfig = (streamInfo: StreamInfo): AudioDecoderConfig => ({
    codec: codecMap[streamInfo.codecName]??'',
    numberOfChannels: streamInfo.channels,
    sampleRate: streamInfo.sampleRate,
    // description: streamInfo.extraData, // MediaRecorder -> blob decode (don't add)
})

export class Decoder {
    #name: string
    decoder: FF['Decoder'] | WebDecoder
    outputs: WebFrame[] = []
    streamInfo: StreamInfo

    /**
     * @param useWebCodecs check `Decoder.isWebCodecsSupported` before contructor if `true`
     */
    constructor(demuxer: FF['Demuxer'] | null, name: string, streamInfo: StreamInfo, useWebCodecs?: boolean) {
        this.streamInfo = streamInfo
        this.#name = name

        if (useWebCodecs) {
            if (streamInfo.mediaType == 'video') {
                const decoder = new VideoDecoder({
                    output: frame => this.outputs.push(frame),
                    error: e => console.error(e.message)
                })
                decoder.configure(videoDecorderConfig(streamInfo))
                this.decoder = decoder
            }
            else {
                const decoder = new AudioDecoder({
                    output: frame => this.outputs.push(frame),
                    error: e => console.error(e.message)
                })
                decoder.configure(audioDecoderConfig(streamInfo))
                this.decoder = decoder
            }
            // Log('WebCodecs:', this.decoder.constructor.name)
        }
        else {
            this.decoder = demuxer ?
                new (getFFmpeg()).Decoder(demuxer, streamInfo.index, name) :
                new (getFFmpeg()).Decoder(streamInfo, name)
        }
    }

    static async isWebCodecsSupported(streamInfo: StreamInfo) {
        if (!('VideoEncoder' in self)) return false

        if (streamInfo.mediaType == 'video') {
            try {
                const { supported, config } = await VideoDecoder.isConfigSupported(videoDecorderConfig(streamInfo))
                return supported
            } 
            catch {
                return false
            }
        }
        else if (streamInfo.mediaType == 'audio') {
            try {
                const { supported, config } = await AudioDecoder.isConfigSupported(audioDecoderConfig(streamInfo))
                return supported
            }
            catch {
                return false
            }
        }

        return false
    }

    get mediaType() {
        const mediaType = this.streamInfo.mediaType
        if (!mediaType) throw `Decoder.mediaType is undefined`
        return mediaType
    }

    /* get frames from inputs or this.outputs */
    #getFrames(frameVec?: StdVector<FF['Frame']>) {
        const frames1 = frameVec ? vec2Array(frameVec) : []
        const frames2 = this.outputs.splice(0, this.outputs.length)
        return [...frames1, ...frames2].map(f => new Frame(f, this.#name))
    }

    async decode(pkt: Packet) {
        if (this.decoder instanceof getFFmpeg().Decoder) {
            return this.#getFrames(this.decoder.decode(pkt.toFF()))
        }
        else {
            const decoder = this.decoder
            const getFrames = this.#getFrames.bind(this)
            const promise = new Promise<Frame[]>((resolve) => {
                decoder.addEventListener('dequeue', function onDequeue() {
                    resolve(getFrames())
                    decoder.removeEventListener('dequeue', onDequeue)
                })
            })
            decoder.decode(pkt.toWeb())
            return promise
        }
    }

    async flush() {
        if (this.decoder instanceof getFFmpeg().Decoder) {
            return this.#getFrames(this.decoder.flush())
        }
        else {
            await this.decoder.flush()
            return this.#getFrames()
        }
    }

    close() {
        if (this.decoder instanceof getFFmpeg().Decoder)
            this.decoder.delete()
        else
            this.decoder.close()
    }
}