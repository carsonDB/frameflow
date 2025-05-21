/**
 * WASM Module manager
 * Note: this file import from built wasm files, which should be built beforehand.
 */
import Worker from 'worker-loader?inline=no-fallback!./transcoder.worker.ts'
// @ts-ignore
import pkgJSON from '../../package.json'
import { FFWorker } from './message'

// Warning: webpack 5 only support pattern: new Worker(new URL('', import.meta.url))
// const createWorker = () => new Worker(new URL('./transcoder.worker.ts', import.meta.url))
/* use worker inline way to avoid bundle issue as dependency for further bundle. */
export const createWorker = () => new Worker()


const wasmFileName = `ffmpeg_built.wasm`
// production wasm from remote CDN
let DefaultURL = `https://unpkg.com/frameflow@${pkgJSON.version}/dist/${wasmFileName}`

// this if branch will be removed after built
if (process.env.NODE_ENV !== 'production') {
    DefaultURL = new URL(`../wasm/ffmpeg_built.wasm`, import.meta.url).href
    console.assert(DefaultURL.includes(wasmFileName)) // keep same wasm name with prod one
}

// store default global things here
const defaults = {
    wasm: undefined as Promise<ArrayBuffer> | undefined,
    worker: undefined as Promise<FFWorker> | undefined
}

function loadWASM(url: RequestInfo = DefaultURL) {
    if (defaults.wasm) return defaults.wasm    
    console.log('Fetch WASM start...')
    // assign to global variable
    defaults.wasm = fetch(url).then(async res => {
        if (!res.ok) throw `WASM binary fetch failed.`
        const wasm = await res.arrayBuffer()
        console.log(`Fetch WASM (${wasm.byteLength}) done.`)
        return wasm
    })
    
    return defaults.wasm
}

export interface LoadArgs { newWorker?: boolean, url?: string }

export function loadWorker(args?: LoadArgs) {
    const {newWorker, url} = args ?? {}
    if (!newWorker && defaults.worker) return defaults.worker
    // assign to global variable
    const ffWorker = loadWASM(url).then(async wasm => {
        const ffWorker = new FFWorker(createWorker())
        // pass wasm to used and must return for future uses
        const loadResult = ffWorker.send('load', {wasm}, [wasm])
        defaults.wasm = loadResult.then(({wasm}) => wasm)
        await loadResult
        return ffWorker
    })
    if (!newWorker && !defaults.worker) {
        defaults.worker = ffWorker
    }

    return ffWorker
}
