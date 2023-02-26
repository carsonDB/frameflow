/**
 * Unify browser or nodejs platform specific APIs.
 * TODO...
 */

import { Flags } from './types/flags'
import { isNode, isBrowser } from './utils'


class GlobalFlags {
    #flags: Flags = {}
    set(obj: Flags) {
        Object.assign(this.#flags, obj)
    }
    get() {
        return structuredClone(this.#flags)
    }
}
export const globalFlags = new GlobalFlags()

export const Worker = isNode ? require('worker_threads').Worker : window.Worker


function readFromNodeStream(stream: NodeJS.ReadableStream) {
    if (stream.readable) {
        const output = stream.read()
        if (typeof output == 'string') throw `cannot get string from source stream`
        return output
    }
    else {
        return new Promise<Buffer>((resolve, reject) => {
            stream.on('readable', () => {
                const output = stream.read()
                if (typeof output == 'string') throw `cannot get string from source stream`
                resolve(output)
            })
        })
    }
}

export class SourceStream<T> {
    stream: NodeJS.ReadableStream | ReadableStreamDefaultReader<T>
    #end = false
    
    constructor(stream: globalThis.ReadableStream<T> | NodeJS.ReadableStream) {
        // nodejs stream
        if ('read' in stream) {
            if (!stream.isPaused()) throw `nodejs stream must be in paused mode`
            stream.on('end', () => this.#end = true)
            this.stream = stream
        }
        // browser stream
        else {
            this.stream = stream.getReader()
        }
    }

    async read() {
        if ('readable' in this.stream) {
            return await readFromNodeStream(this.stream)
        }
        else {
            const { done, value } = await this.stream.read()
            if (done) this.#end = true
            return value
        }
    }

    get end() { return this.#end }

    async cancel() {
        if ('cancel' in this.stream)
            await this.stream.cancel()
        else
            this.stream.pause()
    }


}