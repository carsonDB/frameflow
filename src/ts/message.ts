// import { Worker } from 'worker_threads'

import { FormatMetadata, GraphConfig, StreamMetadata } from "./graph"
import { DataBuffer } from './streamIO'


// type MessageType = SendMessage['type']
// type SendMessage =
//     { type: 'getMetadata', data: { inputs: DataBuffer[], module: FFmpegModule } } | // todo...send/reply
//     { type: 'buildGraph', data: { graphConfig: GraphConfig, module: FFmpegModule } } |
//     { type: 'nextFrame', data: { inputs: {[nodeId in string]?: DataBuffer }, inputEnd: string[] } } |
//     { type: 'deleteGraph', data: undefined }

// type ReplyMessage = 
//     { type: 'getMetadata', data: { container: FormatMetadata, streams: StreamMetadata[] } } |
//     { type: 'buildGraph', data: undefined } |
//     { type: 'nextFrame', data: { 
//         outputs: {[nodeId in string]?: DataBuffer[]}, needInputs: string[], endWriting: boolean} 
//     } |
//     { type: 'deleteGraph', data: undefined }

type MessageType = keyof Messages
interface Messages {
    getMetadata: {
        send: { inputs: DataBuffer[] },
        reply: { container: FormatMetadata, streams: StreamMetadata[] }
    }
    inferFormatInfo: {
        send: { format: string, url: string }
        reply: { format: string, videoCodec: string, audioCodec: string }
    }
    buildGraph: {
        send: { graphConfig: GraphConfig }
        reply: void
    }
    nextFrame: {
        send: { inputs: {[nodeId in string]?: DataBuffer }, inputEnd: string[] },
        reply: { outputs: {[nodeId in string]?: DataBuffer[]}, needInputs: string[], endWriting: boolean}
    }
    deleteGraph: {
        send: undefined
        reply: void
    }
}


/**
 * 
 */
// type ReplyData<T extends MessageType> = Extract<ReplyMessage, { type: T }>['data'] | undefined
export class FFWorker {
    worker: Worker
    // #listeners: { [k in string]?: (replyData: ReplyMessage['data']) => void } = {}

    constructor(url: string | URL) {
        // todo... nodejs and browser workers
        this.worker = new Worker(url)
        // this.worker.onmessage = (e: MessageEvent<ReplyMessage>) => {
        //     // execute the callback, then delete the listener
        //     const {type, data} = e.data
        //     this.#listeners[type]?.(data)
        //     delete this.#listeners['type']
        // }
    }
    
    send<T extends MessageType>(sendMsg: T, data: Messages[T]['send'], transferArray?: ArrayBuffer[]) {
        const promise = new Promise<Messages[T]['reply']>((resolve, reject) => {
            // this.#listeners[type] = (replyData: ReplyData<T>) => { resolve(replyData) }
            const worker = this.worker
            const listener = (e: MessageEvent<{type: T, data: Messages[T]['reply']}>) => {
                const {type: replyMsg, data} = e.data
                if (sendMsg != replyMsg) return // ignore the different msg
                // execute the callback, then delete the listener
                resolve(data) // todo... replace any
                // delete event listener
                worker.removeEventListener('message', listener)
            }
            this.worker.addEventListener('message', listener)
            this.worker.addEventListener('messageerror', function errorListener() { 
                reject()
                worker.removeEventListener('messageerror', errorListener)
            })
        })
        this.worker.postMessage({type: sendMsg, data}, transferArray ?? [])
        return promise
    }

    close() { this.worker.terminate() }
}


/**
 * 
*/
type ReplyCallback<T extends MessageType> = (t: Messages[T]['send'], transferArr: DataBuffer['buffer'][]) => 
    Messages[T]['reply'] | Promise<Messages[T]['reply']>
export class WorkerHandlers {
    // #listeners: {[T in string]?: (t: SendMessage['data'], transferArr: DataBuffer['buffer'][]) => ReplyMessage['data']} = {}
    
    // constructor() {
        // self.onmessage  = (e: MessageEvent<SendMessage>) => {
            //     // execute the callback, then delete the listener
            //     const { type, data } = e.data
            //     const transferArr: DataBuffer['buffer'][] = []
        //     const replyData = this.#listeners[type]?.(data, transferArr)
        //     const postMessage = self.postMessage as (message: any, transfer?: Transferable[]) => void
        //     postMessage({ type, replyData }, [...transferArr])
        // }
        // }
        
    reply<T extends MessageType>(msgType: T, callback: ReplyCallback<T>) { 
        self.addEventListener('message', (e: MessageEvent<{type: T, data: Messages[T]['send']}>) => {
            const { type, data } = e.data
            if (msgType != type) return // ignore different msg
            const transferArr: DataBuffer['buffer'][] = []
            const replyData = callback(data, transferArr)
            const postMessage = self.postMessage as (message: any, transfer?: Transferable[]) => void
            if (replyData instanceof Promise) replyData.then(data => postMessage({ type, data }))
            else postMessage({ type, data: replyData }, [...transferArr])
            // dont delete callback, since it register once, always listen to main thread
        })
        // this.#listeners[msgType] = callback
    }
}

