const { applySingleFilter, applyMulitpleFilter } = require('../filters')


describe('Single input filters', () => {
    
    it('Should trim video and audio streams', () => {
        const sourceNode = {outStreams: [
            {mediaType: 'video', startTime: 1, duration: 10 },
            {mediaType: 'audio', startTime: 2, duration: 20},
        ]}
        const streamRefs = [
            {from: sourceNode, index: 0},
            {from: sourceNode, index: 1},
        ]

        const trim = {
            type: "trim",
            args: { start: 2, duration: 3, }
        }
        const outRefs = applySingleFilter(streamRefs, trim)
        expect(outRefs).toHaveLength(2)
        expect(outRefs[0].from.outStreams[0].mediaType).toBe('video')
        expect(outRefs[1].from.outStreams[0].mediaType).toBe('audio')
    })
})


describe('Multiple input filters', () => {

})
