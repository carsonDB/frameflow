import { FormatMetadata, GraphConfig, StreamMetadata } from "./graph"


type MessageType = SendMessage['type']
type SendMessage =
    { type: 'getMetadata', data: { input: string | File } } |
    { type: 'buildGraph', data: {graphConfig: GraphConfig} } |
    { type: 'nextFrame', data: { inputs: {[nodeId in string]?: ArrayBuffer} } } |
    { type: 'deleteGraph', data: undefined }

type ReplyData<T extends MessageType> = Extract<ReplyMessage, { type: T }>['data']
type ReplyMessage = 
    { type: 'getMetadata', data: { container: FormatMetadata, streams: StreamMetadata[] } } |
    { type: 'buildGraph', data: void } |
    { type: 'nextFrame', data: {outputs: {[nodeId: string]: Blob | undefined}, needInputs: string[]} } |
    { type: 'deleteGraph', data: void }


/**
 * 
 */
export class FFWorker {
    worker: Worker
    #listeners: { [k in string]?: (replyData: ReplyMessage['data']) => void } = {}

    constructor(url: string) {
        this.worker = new Worker(url)
        this.worker.onmessage = (e: MessageEvent<ReplyMessage>) => {
            // execute the callback, then delete the listener
            const {type, data} = e.data
            this.#listeners[type]?.(data)
            delete this.#listeners['type']
        }
    }
    
    send<T extends MessageType>(type: T, data: Extract<SendMessage, {type: T}>['data'], transferArray?: ArrayBuffer[]) {
        const promise = new Promise<ReplyData<T>>((resolve, reject) => {
            this.#listeners[type] = (replyData: ReplyData<T>) => { resolve(replyData) }
            // worker.onmessageerror
        })
        this.worker.postMessage({type, data}, transferArray ?? [])
        return promise
    }

    close() { this.worker.terminate() }
}


/**
 * 
 */
type replyCallback<T extends MessageType> = (t: Extract<SendMessage, {type: T}>['data']) => 
    Extract<ReplyMessage, { type: T }>['data']
export class WorkerHandlers {
    #listeners: {[T in string]?: (t: SendMessage['data']) => ReplyMessage['data']} = {}
    
    constructor() {
        self.onmessage  = (e: MessageEvent<SendMessage>) => {
            // execute the callback, then delete the listener
            const { type, data } = e.data
            const replyData = this.#listeners[type]?.(data) 
            self.postMessage({ type, replyData })
        }
    }
    
    reply<T extends MessageType>(msgType: T, callback: replyCallback<T>) 
    { 
        this.#listeners[msgType] = callback
    }
}

