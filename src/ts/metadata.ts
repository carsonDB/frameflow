import { StreamMetadata } from "./types/graph";


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
    }
    if (frame instanceof VideoFrame) {
        return {
            mediaType: 'video',
            height: frame.codedHeight,
            width: frame.codedWidth,
            pixelFormat: frame.format??'',
            sampleAspectRatio: {num: 1, den: 1},
            frameRate: args.frameRate ?? 30,
            ...commonInfo
        }
    }
    else {
        return {
            mediaType: 'audio',
            volume: 1,
            sampleFormat: frame.format,
            sampleRate: frame.sampleRate,
            channels: frame.numberOfChannels,
            channelLayout: '', // todo...
            ...commonInfo
        }
    }
}