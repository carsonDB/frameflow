import { v4 as uuid } from 'uuid';
import { AudioStreamMetadata, FilterNode, StreamRef } from "./graph";

export type FilterArgs<T extends Filter['type']> = Extract<Filter, { type: T, args: any }>['args']
export type Filter = 
    { type: 'tracks', args: 'video' | 'audio' } |
    { type: 'trim', args: { startTime: number, duration: number } } |
    { type: 'loop', args: number } |
    { type: 'setVolume', args: number } |
    { type: 'merge' } | // implicit args: {number of inputs}
    { type: 'concat' }


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
            const duration = streamRefsArr.reduce((acc, refs) => acc + refs[0].from.outStreams[refs[0].index].duration, 0)
            const from: FilterNode = {type: 'filter', inStreams: streamRefsArr.flat(), id: uuid(),
                outStreams: streamRefsArr[0].map(r => ({...r.from.outStreams[r.index], duration})), 
                filter: {name: 'concat', args: {n, v, a}} }
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
            const from: FilterNode = {type: 'filter', inStreams: audioStreamRefs, id: uuid(), 
                outStreams: [{...inAudioStreams[0], duration}], 
                filter: {name: 'amerge', args: {inputs: audioStreamRefs.length}}}
            return [...streamRefs.filter(ref => ref.from.outStreams[ref.index].mediaType != 'audio'),
                    {from, index: 0}]
        }
        default: throw `${filter.type}: not found multiple input filter`
    }

}


/**
 * valid `args` based on previous streams, then create FilterNodes (update streams metadata)
 * @returns array of streamRef, ref to created FilterNodes' outStreams, or unchanged streamRefs.
 */
export function applySingleFilter(streamRefs: StreamRef[], filter: Filter): StreamRef[] {
    const outStreams = streamRefs.map(streamRef => {
        const s = streamRef.from.outStreams[streamRef.index]
        switch (filter.type) {
            case 'trim': {
                const args = filter.args
                const name = s.mediaType == 'audio' ? 'atrim' : 'trim'
                if (args.startTime < s.startTime || args.duration > s.duration)
                    throw 'trim range (absolute) has exceeded input range'
                const from: FilterNode = {
                    type: 'filter', filter: {name, args}, id: uuid(), 
                    inStreams: [streamRef], outStreams: [{...s, ...args}] }
                return {from, index: 0}
            }
            case 'loop': {
                const args = filter.args
                const name = s.mediaType == 'audio' ? 'aloop' : 'loop'
                const from: FilterNode = {
                    type: 'filter', filter: {name, args: {loop: args}}, id: uuid(),
                    inStreams: [streamRef], outStreams: [{...s, duration: args*s.duration}]
                }
                return {from, index: 0}
            }
            case 'setVolume': {
                const args = filter.args
                if (s.mediaType == 'video') return streamRef
                const from: FilterNode = {
                    type: 'filter', filter: {name: 'volume', args: {volume: args}}, id: uuid(),
                    inStreams: [streamRef], outStreams: [{...s, volume: args}]}
                return {from, index: 0}
            }
            default: throw `${filter.type}: not found single input filter`
        }
    })

    if (streamRefs.every((r, i) => r == outStreams[i]))
        throw `${filter.type}: no nothing filtering`

    return outStreams
}
