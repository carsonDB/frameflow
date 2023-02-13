jest.mock('../graph', () => ({
    buildGraphConfig: () => {}
}))
jest.mock('../loader', () => ({
    loadWASM: async () => new Uint8Array()
}))
jest.mock('../message')





describe('class Reader (browser)', () => {

    jest.mock('../utils', () => ({ isBrowser: true, isNode: false }))
    const { Reader, Exporter } = require('../streamIO')
    
    const totalLength = 100
    jest.mock(fetch, async () => ({ 
        headers: {
            get: () => totalLength
        } 
    }))

    beforeEach(async () => {
        const reply = jest.fn((msgType, callback) => {})
        const reader = new Reader('reader_id', './video.mp4', { reply })
        await reader.build()
    })

    it('Should ready to reply for `read` and `seek` request', async () => {
        expect(reply.mock.calls).toHaveLength(2)
        expect(reply.mock.calls[0][0]).toBe('read')
        expect(reply.mock.calls[1][0]).toBe('seek')
    })

    it('Should reply data for `read` request', async () => {
        const {inputs} = await reply.mock.calls[0][1]()
        expect(inputs.length).toBeGreaterThan(0)
        // todo...
    })

    it('Should reply for `seek` request', async () => {
        // todo...
    })
    
})