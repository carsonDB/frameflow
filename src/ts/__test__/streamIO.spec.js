jest.mock('../graph', () => ({
    buildGraphConfig: () => {}
}))
jest.mock('../loader', () => ({
    loadWASM: async () => new Uint8Array()
}))
jest.mock('../message')
jest.mock('../utils', () => ({ isBrowser: true, isNode: false }))
jest.splyOn('fetch', )

const { Reader, Exporter } = require('../streamIO')


describe('class Reader', () => {

    it('Should ready to reply for `read` and `seek` request', async () => {
        const reply = jest.fn((msgType, callback) => {})
        const reader = new Reader('reader_id', './video.mp4', { reply })
        await reader.build()
        
        expect(reply.mock.calls).toHaveLength(2)
        expect(reply.mock.calls[0][0]).toBe('read')
        expect(reply.mock.calls[1][0]).toBe('seek')
        // todo... 
    })

    it('Should be ...', async () = {

    })
    
})