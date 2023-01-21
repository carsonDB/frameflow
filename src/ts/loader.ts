/**
 * FFmpeg Module manager
 * Note: this file import from built wasm files, which should be built beforehand.
 */
import wasmFile from '../wasm/ffmpeg_built.wasm'


// store global binary wasm here
let wasmPromise: Promise<ArrayBuffer> | undefined = undefined


export function loadWASM() {
    if (wasmPromise) return wasmPromise
    
    console.log('Fetch WASM start...')
    // assign to global variable
    wasmPromise = fetch(wasmFile)
        .then(res => {
            if (!res.ok) throw `WASM binary fetch failed.`
            return res.arrayBuffer()
        }).then(bytes => {
            console.log(`Fetch WASM (${bytes.byteLength}) done.`)
            return bytes
        })
    
    return wasmPromise
}
