/**
 * WASM Module manager
 * Note: this file import from built wasm files, which should be built beforehand.
 */
import { inflate } from 'pako'
// @ts-ignore
import pkgJSON from '../../package.json'

const wasmFileName = `ffmpeg_built.wasm`

// production wasm (gzip) from remote CDN
let DefaultURL = `https://unpkg.com/frameflow@${pkgJSON.version}/dist/${wasmFileName}`

// this if branch will be removed after built
if (process.env.NODE_ENV == 'development') {
    DefaultURL = new URL(`../wasm/ffmpeg_built.wasm`, import.meta.url).href
    console.assert(DefaultURL.includes(wasmFileName)) // keep same wasm name with prod one
}

// store global binary wasm here
let wasmPromise: Promise<ArrayBuffer> | undefined = undefined


export function loadWASM(url: RequestInfo = DefaultURL, gzip=true) {
    if (wasmPromise) return wasmPromise
    
    console.log('Fetch WASM start...')
    // assign to global variable
    const gz = gzip ? '.gz' : ''
    wasmPromise = fetch(url + gz)
        .then(async res => {
            if (!res.ok) throw `WASM binary fetch failed.`
            return {data: await res.arrayBuffer(), type: res.headers.get('Content-Type')}
        }).then(({data, type}) => {
            console.log(`Fetch WASM (${data.byteLength}) done.`)
            return type?.includes('gzip') ? inflate(data) : data
        })
    
    return wasmPromise
}
