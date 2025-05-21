export const isWebWorker =
    typeof self === "object" &&
    self.constructor &&
    self.constructor.name === "DedicatedWorkerGlobalScope";

export function Log(...msg: any[]) {
    console.log(...msg)
}

export class BufferPool {
    pool: ArrayBuffer[]
    max: number

    constructor(max = 20) {
        this.pool = [];
        this.max = max;
    }

    private getNextPowerOf2(size: number): number {
        return Math.pow(2, Math.ceil(Math.log2(size)));
    }

    create(size: number) {
        // Find smallest buffer >= requested size
        const bestBuffer = this.pool
            .filter(buffer => buffer.byteLength >= size)
            .sort((a, b) => a.byteLength - b.byteLength)[0];

        if (bestBuffer) {
            this.pool = this.pool.filter(b => b !== bestBuffer);
            return new Uint8Array(bestBuffer, 0, size);
        }

        // Create new buffer with next power of 2 size
        return new Uint8Array(new ArrayBuffer(this.getNextPowerOf2(size)), 0, size);
    }

    delete(buffer: Uint8Array) {
        if (this.pool.length < this.max) {
            this.pool.push(buffer.buffer);
        }
    }
}