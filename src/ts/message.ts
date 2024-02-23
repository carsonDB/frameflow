// import { Worker } from 'worker_threads'

import { InferredFormatInfo } from "./types/ffmpeg"
import { Flags } from "./types/flags"
import { ChunkData, FormatMetadata, GraphInstance, StreamMetadata, WriteChunkData } from "./types/graph"


type MessageType = keyof Messages
interface Messages {
    load: {
        send: { wasm: ArrayBuffer },
        reply: {wasm: ArrayBuffer},
    }
    getMetadata: {
        send: { fileSize: number },
        reply: { container: FormatMetadata, streams: StreamMetadata[] }
    }
    inferFormatInfo: {
        send: { format: string, url: string }
        reply: InferredFormatInfo
    }
    buildGraph: {
        send: { graphInstance: GraphInstance, flags: Flags }
        reply: void
    }
    nextFrame: {
        send: void,
        reply: { outputs: {[nodeId in string]?: WriteChunkData[]}, endWriting: boolean, progress: number}
    }
    deleteGraph: {
        send: void
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
    (t: AllMessages[T]['send'], id: string, transferArr: TransferArray) => 
        AllMessages[T]['reply'] | Promise<AllMessages[T]['reply']>

type TransferArray = (Transferable | VideoFrame | AudioData)[]

// close VideoFrame/AudioData (refCount--)
const closeTransferArray = (arr: TransferArray) => arr.forEach(data => 'close' in data && data.close())

function sendMessage<T extends AllMessageType>(
    sender: any, 
    sendMsg: T, 
    data: AllMessages[T]['send'],
    transferArray: TransferArray = [],
    sendId=''
) {
    const promise = new Promise<AllMessages[T]['reply']>((resolve, reject) => {
        const listener = (e: MessageEvent<{type: T, data: AllMessages[T]['reply'], id: string}>) => {
            const {type: replyMsg, data, id: replyId } = e.data
            if (sendMsg != replyMsg || sendId != replyId) return // ignore the different msgType / id
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
    const msg: AllPostMessage = {type: sendMsg, data, id: sendId} // make sure id cannot missing
    sender.postMessage(msg, transferArray)
    closeTransferArray(transferArray)

    return promise
}

/**
 * 
 * @param replyId if replyId was given, filter the request (sendId). Otherwise, use sendId as replyId
 */
function replyMessage<T extends AllMessageType>(
    replier: any,
    msgType: T, 
    callback: AllReplyCallback<T>,
    replyId?: string
) { 
    replier.addEventListener('message', (e: MessageEvent<{type: T, data: AllMessages[T]['send'], id: string}>) => {
        const { type, data, id: sendId } = e.data
        if (msgType != type || (replyId && replyId != sendId)) return; // ignore different sendMsg / id
        const id = replyId ?? sendId
        const transferArr: TransferArray = []
        const replyData = callback(data, sendId, transferArr)
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

/**
 * only allow one access, others wait in promise
 */
export class Lock {
    #promises: PromiseHandle[] = []
    
    /**
     * 
     * @returns unlock function
     */
    async start() {
        const prevPromise: PromiseHandle | undefined = this.#promises[this.#promises.length - 1]
        const promisehandle = new PromiseHandle()
        this.#promises.push(promisehandle)
        if (prevPromise) {
            await prevPromise.promise
        }

        // unlock function
        return () => {
            this.#promises = this.#promises.filter(p => promisehandle != p)
            promisehandle.resolve()
        }
    }
}

class PromiseHandle {
    #promise: Promise<void>
    #resolve?: (value: void | PromiseLike<void>) => void
    constructor() {
        this.#promise = new Promise((resolve) => {
            this.#resolve = resolve
        })
    }

    get promise() { return this.#promise }

    resolve() {
        this.#resolve?.()
    }
}

export class FFWorker {
    worker: Worker
    lock = new Lock()
    
    constructor(worker: Worker) {
        this.worker = worker
    }
    
    async send<T extends MessageType>(sendMsg: T, data: Messages[T]['send'], transferArray: TransferArray, id?: string) {
        const unlock = await this.lock.start()
        const result = await sendMessage(this.worker, sendMsg, data, transferArray, id)
        unlock()
        return result
    }

    reply<T extends BackMessageType>(msgType: T, callback: AllReplyCallback<T>, id: string) {
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
        
    reply<T extends MessageType>(msgType: T, callback: AllReplyCallback<T>) { 
        return replyMessage(self, msgType, callback)
    }

    send<T extends BackMessageType>(msgType: T, data: BackMessages[T]['send'], transferArray: TransferArray, id: string) {
        return sendMessage(self, msgType, data, transferArray, id)
    }
}

