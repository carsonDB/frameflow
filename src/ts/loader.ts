/**
 * WASM Module manager
 * Note: this file import from built wasm files, which should be built beforehand.
 */

// @ts-ignore
import pkgJSON from '../../package.json'

const wasmFileName = `ffmpeg_built.wasm`

// production wasm from remote CDN
let DefaultURL = `https://unpkg.com/frameflow@${pkgJSON.version}/dist/${wasmFileName}`

// this if branch will be removed after built
if (process.env.NODE_ENV == 'development') {
    DefaultURL = new URL(`../wasm/ffmpeg_built.wasm`, import.meta.url).href
    console.assert(DefaultURL.includes(wasmFileName)) // keep same wasm name with prod one
}

// store global binary wasm here
let wasmPromise: Promise<ArrayBuffer> | undefined = undefined


export function loadWASM(url: RequestInfo = DefaultURL) {
    if (wasmPromise) return wasmPromise
    
    console.log('Fetch WASM start...')
    // assign to global variable
    wasmPromise = fetch(url)
        .then(res => {
            if (!res.ok) throw `WASM binary fetch failed.`
            return res.arrayBuffer()
        }).then(bytes => {
            console.log(`Fetch WASM (${bytes.byteLength}) done.`)
            return bytes
        })
    
    return wasmPromise
}
