import { StreamMetadata } from "./types/graph";


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
        {ff: 'rgba', web: 'RGBA'}, // choose when ff2web
        {ff: 'rgba', web: 'RGBX'},
        {ff: 'bgra', web: 'BGRA'}, // choose when ff2web
        {ff: 'bgra', web: 'BGRX'},
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

export function formatFF2Web<T extends 'pixel' | 'sample'>(type: T, format: string): typeof dataFormatMap[T][0]['web'] {
    for (const {ff, web} of dataFormatMap[type])
        if (ff == format) return web
    throw `Cannot find ${type} format: FF ${format}`
}

export function formatWeb2FF<T extends 'pixel' | 'sample'>(type: T, format: typeof dataFormatMap[T][0]['web']): string {
    for (const {ff, web} of dataFormatMap[type])
        if (web == format) return ff
    throw `Cannot find ${type} format: Web ${format}`
}


interface StreamArgs {
    frameRate?: number
}
export function webFrameToStreamMetadata(frame: VideoFrame | AudioData, args: StreamArgs): StreamMetadata {
    const commonInfo = {
        bitRate: 0,
        index: 0,
        startTime: 0,
        duration: 0,
        timeBase: {num: 1, den: 1_000_000}, // microseconds
        codecName: '',
        extraData: new Uint8Array(),
    }
    if (frame instanceof VideoFrame) {
        return {
            mediaType: 'video',
            height: frame.codedHeight,
            width: frame.codedWidth,
            pixelFormat: frame.format ? formatWeb2FF('pixel', frame.format) : '',
            sampleAspectRatio: {num: 0, den: 1},
            frameRate: args.frameRate ?? 30,
            ...commonInfo
        }
    }
    else {
        return {
            mediaType: 'audio',
            volume: 1,
            sampleFormat: frame.format ? formatWeb2FF('sample', frame.format) : '',
            sampleRate: frame.sampleRate,
            channels: frame.numberOfChannels,
            channelLayout: '', // todo...
            ...commonInfo
        }
    }
}