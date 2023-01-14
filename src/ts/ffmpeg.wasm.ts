/**
 * FFmpeg Module manager
 * Note: this file import from built wasm files, which should be built beforehand.
 */
import createModule, { FFmpegModule } from '../wasm/ffmpeg.js'
import wasmFile from '../../wasm/ffmpeg.wasm'

export { StdVector, StdMap, AVRational, StreamInfo, FormatInfo, ModuleType, FFmpegModule } from '../wasm/ffmpeg.js'


// store global instance of Module here
let wasmModule: FFmpegModule | undefined = undefined

export async function loadModule() {
    if (!wasmModule)
        wasmModule = await createModule()
    // Module callback functions: https://emscripten.org/docs/api_reference/module.html
    wasmModule['print'] = (msg: string) => console.log(msg)
    wasmModule['printErr'] = (msg: string) => console.error(msg)
    wasmModule['locateFile'] = (path) => path.endsWith(`.wasm`) ? wasmFile : path

    return wasmModule
}

export function getModule() {
    if (!wasmModule) throw `haven't load ffmpeg module yet`
    return wasmModule
}