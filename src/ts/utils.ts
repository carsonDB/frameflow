export const isBrowser =
    typeof window !== "undefined" && typeof window.document !== "undefined";

export const isNode =
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null;

export const isWebWorker =
    typeof self === "object" &&
    self.constructor &&
    self.constructor.name === "DedicatedWorkerGlobalScope";

export function Log(...msg: any[]) {
    console.log(...msg)
}
