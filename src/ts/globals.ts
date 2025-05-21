/**
 * Only for browser environment. Deprecated for nodejs environment.
 * TODO...
 */

import { Flags } from './types/flags'


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

export const Worker = window.Worker

export class SourceStream<T> {
    stream: ReadableStreamDefaultReader<T>
    #end = false
    
    constructor(stream: globalThis.ReadableStream<T>) {
        this.stream = stream.getReader()
    }

    async read() {
        const { done, value } = await this.stream.read()
        if (done) this.#end = true
        return value
    }

    get end() { return this.#end }

    async cancel() {
        await this.stream.cancel()
    }


}