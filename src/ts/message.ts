// import { Worker } from 'worker_threads'

import { InferredFormatInfo } from "./types/ffmpeg"
import { Flags } from "./types/flags"
import { ChunkData, FormatMetadata, GraphInstance, StreamMetadata, WriteChunkData } from "./types/graph"


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
        send: { graphInstance: GraphInstance, wasm: ArrayBuffer, flags: Flags }
        reply: void
    }
    nextFrame: {
        send: undefined,
        reply: { outputs: {[nodeId in string]?: WriteChunkData[]}, endWriting: boolean, progress: number}
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
        reply: { inputs: ChunkData[] }
    }
    seek: {
        send: { pos: number }
        reply: void
    }
}

type AllMessageType = keyof AllMessages
type AllPostMessage = {type: AllMessageType, data: any, id: string}
interface AllMessages extends Messages, BackMessages {}
type AllReplyCallback<T extends MessageType | BackMessageType> = 
    (t: AllMessages[T]['send'], transferArr: TransferArray) => 
        AllMessages[T]['reply'] | Promise<AllMessages[T]['reply']>

type TransferArray = (Transferable | VideoFrame | AudioData)[]

// close VideoFrame/AudioData (refCount--)
const closeTransferArray = (arr: TransferArray) => arr.forEach(data => 'close' in data && data.close())

function sendMessage<T extends AllMessageType>(
    sender: any, 
    sendMsg: T, 
    data: AllMessages[T]['send'],
    transferArray: TransferArray = [],
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
    sender.postMessage(msg, transferArray)
    closeTransferArray(transferArray)

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
        const transferArr: TransferArray = []
        const replyData = callback(data, transferArr)
        if (replyData instanceof Promise) {
            replyData.then(data => {
                const msg: AllPostMessage = {type, data, id} // make sure id cannot missing
                replier.postMessage(msg, [...transferArr])
                closeTransferArray(transferArr)
        })
        }
        else {
            const msg: AllPostMessage = {type, data: replyData, id} // make sure id cannot missing
            replier.postMessage(msg, [...transferArr])
            closeTransferArray(transferArr)
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
    
    send<T extends MessageType>(sendMsg: T, data: Messages[T]['send'], transferArray?: TransferArray, id?: string) {
        return sendMessage(this.worker, sendMsg, data, transferArray, id)
    }

    reply<T extends BackMessageType>(msgType: T, callback: AllReplyCallback<T>, id?: string) {
        return replyMessage(this.worker, msgType, callback, id)
    }

    close() { 
        /* hacky way to avoid slowing down wasm loading in next worker starter.
        * Several experiments show that if create worker and load wasm immediately after worker.close(),
        * it will become 10x slower, guess it is because of GC issue.
        */
        setTimeout(() => this.worker.terminate(), 5000)
    }
}


/**
 * 
*/
export class WorkerHandlers {
        
    reply<T extends MessageType>(msgType: T, callback: AllReplyCallback<T>, id?: string) { 
        return replyMessage(self, msgType, callback, id)
    }

    send<T extends BackMessageType>(msgType: T, data: BackMessages[T]['send'], transferArray?: TransferArray, id?: string) {
        return sendMessage(self, msgType, data, transferArray, id)
    }
}

