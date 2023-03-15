import { AudioStreamMetadata, FilterNode, StreamMetadata, StreamRef } from "./types/graph";

export type FilterArgs<T extends Filter['type']> = Extract<Filter, { type: T, args: any }>['args']
export type Filter = 
{ type: 'tracks', args: 'video' | 'audio' } |
{ type: 'trim', args: { start: number, duration: number } } |
{ type: 'setpts' } |
{ type: 'fifo' } |
{ type: 'volume', args: number } |
{ type: 'merge' } | // implicit args: {number of inputs}
{ type: 'concat' } |
{ type: 'format', args: { pixelFormat?: string, sampleFormat?: string, sampleRate?: number, channelLayout?: string } }


/**
 * valid `args` based on previous streams, then create FilterNodes (update streams metadata)
 * @returns array of streamRef, ref to created FilterNodes' outStreams, or unchanged streamRefs.
 */
export function applySingleFilter(streamRefs: StreamRef[], filter: Filter): StreamRef[] {
    const outStreams = streamRefs.map(streamRef => {
        const s = streamRef.from.outStreams[streamRef.index]
        switch (filter.type) {
            case 'trim': {
                const name = s.mediaType == 'audio' ? 'atrim' : 'trim'
                const start = Math.max(filter.args.start, s.startTime)
                const end = Math.min(start + filter.args.duration, s.startTime + s.duration)
                const duration = Math.max(end - start, 0)
                const from: FilterNode = {
                    type: 'filter', filter: {name, ffmpegArgs: {start, duration}}, 
                    inStreams: [streamRef], outStreams: [{...s, startTime: start, duration}] }
                return {from, index: 0}
            }
            // first frame pts reset to 0
            case 'setpts': {
                const name = s.mediaType == 'audio' ? 'asetpts' : 'setpts'
                const from: FilterNode = {
                    type: 'filter', filter: {name: name, ffmpegArgs: 'PTS-STARTPTS'},
                    inStreams: [streamRef], outStreams: [{...s}] }
                return {from, index: 0}
            }
            case 'fifo': {
                const name = s.mediaType == 'audio' ? 'afifo' : 'fifo'
                const from: FilterNode = {
                    type: 'filter', filter: {name: name, ffmpegArgs: ''},
                    inStreams: [streamRef], outStreams: [{...s}] }
                return {from, index: 0}
            }
            case 'volume': {
                const volume = filter.args
                if (s.mediaType == 'video') return streamRef
                const from: FilterNode = {
                    type: 'filter', filter: {name: 'volume', ffmpegArgs: {volume}},
                    inStreams: [streamRef], outStreams: [{...s, volume}]}
                return {from, index: 0}
            }
            case 'format': {
                const {pixelFormat, channelLayout, sampleFormat, sampleRate} = filter.args
                const name = s.mediaType == 'audio' ? 'aformat' : 'format'
                const ffmpegArgs = s.mediaType == 'audio' ? 
                    {sample_fmts: sampleFormat, channel_layouts: channelLayout, sample_rates: sampleRate} :
                    {pix_fmts: pixelFormat}
                const metadata: StreamMetadata = s.mediaType == 'audio' ? 
                    {...s, sampleFormat: sampleFormat ?? s.sampleFormat, 
                        channelLayout: channelLayout ?? s.channelLayout,
                        sampleRate: sampleRate ?? s.sampleRate} :
                    {...s, pixelFormat: pixelFormat ?? s.pixelFormat}
                const from: FilterNode = {
                    type: 'filter', filter: {name, ffmpegArgs},
                    inStreams: [streamRef], outStreams: [metadata] }
                return {from, index: 0}
            }
            default: throw `${filter.type}: not support single input filter`
        }
    })

    if (streamRefs.every((r, i) => r == outStreams[i]))
        throw `${filter.type}: no nothing filtering`

    return outStreams
}


/**
 * valid `args` based on previous streams, then create FilterNodes (update streams metadata)
 * @returns array of streamRef, ref to created FilterNodes' outStreams, or unchanged streamRefs.
 */
export function applyMulitpleFilter(streamRefsArr: StreamRef[][], filter: Filter): StreamRef[] {
    
    switch (filter.type) {
        case 'concat': {
            const n = streamRefsArr.length
            const segment = streamRefsArr[0]
            const v = segment.filter(r => r.from.outStreams[r.index].mediaType == 'video').length
            const a = segment.filter(r => r.from.outStreams[r.index].mediaType == 'audio').length
            // todo... check more
            if (streamRefsArr.some(refs => refs.length != streamRefsArr[0].length))
                throw `${filter.type}: all segments should have same audio/video tracks`
            // concat
            const duration = streamRefsArr.reduce((acc, refs) => acc + refs[0].from.outStreams[refs[0].index].duration, 0)
            const from: FilterNode = {type: 'filter', inStreams: streamRefsArr.flat(),
                outStreams: streamRefsArr[0].map(r => ({...r.from.outStreams[r.index], duration})), 
                filter: {name: 'concat', ffmpegArgs: {n, v, a}} }
            return from.outStreams.map((_, i) => ({from, index: i}))
        };
        case 'merge': {
            const streamRefs = streamRefsArr.flat()
            const audioStreamRefs = streamRefs.filter(ref => ref.from.outStreams[ref.index].mediaType == 'audio')
            const inAudioStreams = audioStreamRefs.map(r => r.from.outStreams[r.index]) as AudioStreamMetadata[]
            // choose smallest duration
            const duration = inAudioStreams.reduce((acc, s) => Math.min(s.duration, acc), inAudioStreams[0].duration)
            // All inputs must have the same sample rate, and format
            if (inAudioStreams.some(m => m.sampleRate != inAudioStreams[0].sampleRate))
                throw `${filter.type}: all inputs must have same sampleRate`
            if (inAudioStreams.some(m => m.sampleFormat != inAudioStreams[0].sampleFormat))
                throw `${filter.type}: all inputs must have same sampleFormat`
            // out stream metadata mainly use first one
            const from: FilterNode = {type: 'filter', inStreams: audioStreamRefs, 
                outStreams: [{...inAudioStreams[0], duration}], 
                filter: {name: 'amerge', ffmpegArgs: {inputs: audioStreamRefs.length}}}
            return [...streamRefs.filter(ref => ref.from.outStreams[ref.index].mediaType != 'audio'),
                    {from, index: 0}]
        }
        default: throw `${filter.type}: not found multiple input filter`
    }

}

