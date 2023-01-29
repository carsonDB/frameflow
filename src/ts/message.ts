// import { Worker } from 'worker_threads'

import { InferredFormatInfo } from "./types/ffmpeg"
import { DataBuffer, FormatMetadata, GraphConfig, StreamMetadata, WriteDataBuffer } from "./types/graph"



type MessageType = keyof Messages
interface Messages {
    getMetadata: {
        send: { id: string, fullSize: number, url: string, wasm: ArrayBuffer },
        reply: { container: FormatMetadata, streams: StreamMetadata[] }
    }
    inferFormatInfo: {
        send: { format: string, url: string, wasm: ArrayBuffer }
        reply: InferredFormatInfo
    }
    buildGraph: {
        send: { graphConfig: GraphConfig, wasm: ArrayBuffer }
        reply: void
    }
    nextFrame: {
        send: undefined,
        reply: { outputs: {[nodeId in string]?: WriteDataBuffer[]}, endWriting: boolean, progress: number}
    }
    deleteGraph: {
        send: undefined
        reply: void
    }
}

type BackMessageType = keyof BackMessages
interface BackMessages {
    read: {
        send: undefined
        reply: { inputs: DataBuffer[] }
    }
    seek: {
        send: { pos: number }
        reply: void
    }
}

type AllMessageType = keyof AllMessages
type AllPostMessage = {type: AllMessageType, data: any, id: string}
interface AllMessages extends Messages, BackMessages {}
type AllReplyCallback<T extends MessageType | BackMessageType> = (t: AllMessages[T]['send'], transferArr: DataBuffer['buffer'][]) => 
    AllMessages[T]['reply'] | Promise<AllMessages[T]['reply']>


function sendMessage<T extends AllMessageType>(
    sender: any, 
    sendMsg: T, 
    data: AllMessages[T]['send'],
    transferArray?: ArrayBuffer[],
    id=''
) {
    const promise = new Promise<AllMessages[T]['reply']>((resolve, reject) => {
        const listener = (e: MessageEvent<{type: T, data: AllMessages[T]['reply'], id: string}>) => {
            const {type: replyMsg, data, id: replyId } = e.data
            if (sendMsg != replyMsg || id != replyId) return // ignore the different msgType / id
            // execute the callback, then delete the listener
            resolve(data)
            // delete event listener
            sender.removeEventListener('message', listener)
        }
        sender.addEventListener('message', listener)
        sender.addEventListener('messageerror', function errorListener() { 
            reject()
            sender.removeEventListener('messageerror', errorListener)
        })
    })
    const msg: AllPostMessage = {type: sendMsg, data, id} // make sure id cannot missing
    sender.postMessage(msg, transferArray ?? [])
    return promise
}

function replyMessage<T extends AllMessageType>(
    replier: any,
    msgType: T, 
    callback: AllReplyCallback<T>,
    id=''
) { 
    replier.addEventListener('message', (e: MessageEvent<{type: T, data: AllMessages[T]['send'], id: string}>) => {
        const { type, data, id: sendId } = e.data
        if (msgType != type || id != sendId) return; // ignore different sendMsg / id
        const transferArr: DataBuffer['buffer'][] = []
        const replyData = callback(data, transferArr)
        if (replyData instanceof Promise) {
            replyData.then(data => {
                const msg: AllPostMessage = {type, data, id} // make sure id cannot missing
                replier.postMessage(msg)
            })
        }
        else {
            const msg: AllPostMessage = {type, data: replyData, id} // make sure id cannot missing
            replier.postMessage(msg, [...transferArr])
        }
        // dont delete callback, since it register once, always listen to main thread
    })
}


export class FFWorker {
    worker: Worker
    
    constructor(worker: Worker) {
        this.worker = worker
        // todo... nodejs and browser workers
    }
    
    send<T extends MessageType>(sendMsg: T, data: Messages[T]['send'], transferArray?: ArrayBuffer[], id?: string) {
        return sendMessage(this.worker, sendMsg, data, transferArray, id)
    }

    reply<T extends BackMessageType>(msgType: T, callback: AllReplyCallback<T>, id?: string) {
        return replyMessage(this.worker, msgType, callback, id)
    }

    close() { this.worker.terminate() }
}


/**
 * 
*/
export class WorkerHandlers {
        
    reply<T extends MessageType>(msgType: T, callback: AllReplyCallback<T>, id?: string) { 
        return replyMessage(self, msgType, callback, id)
    }

    send<T extends BackMessageType>(msgType: T, data: BackMessages[T]['send'], transferArray?: ArrayBuffer[], id?: string) {
        return sendMessage(self, msgType, data, transferArray, id)
    }
}

