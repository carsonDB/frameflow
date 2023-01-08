/**
 * copy from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/emscripten/index.d.ts
 */

declare namespace Module {
    interface AVRational { num: number, den: number }
    interface Vector<T> {
        size(): number
        get(i: number): T
        set(i: number, T)
        push_back(T)
    }
    interface Map<T1, T2> {
        size(): number
        get(key: T1): T2
        keys(): Vector<T1>
        set(key: T1, val: T2)
    }
    function createFrameMap(): Map<string, Frame>
    function createStringStringMap(): Map<string, string>

    // demuxer
    class Demuxer {
        constructor(filename: string)
        streams: Vector<Frame>
        seek(t: number, streamIndex: number): void
        read(): Packet
        getMetadata(): FormatInfo
        delete(): void
    }
    interface FormatInfo {
        formatName: string
        bitRate: number
        duration: number
        streamInfos: Vector<StreamInfo>
    }

    // decode
    class Decoder {
        constructor(dexmuer: Demuxer, streamIndex: number)
        constructor(params: string)
        decode(packet: Packet): Vector<Frame>
        flush(): Vector<Frame>
        delete(): void
    }

    // stream
    class Stream {
    }
    interface StreamInfo {
        index: number
        timeBase: AVRational
        bitRate: number
        startTime: number
        duration: number
        codecName: string
        mediaType: 'video' | 'audio' | undefined
        format: string // pixelFormat if codecType is 'video'; sampleFormat if codecType is 'audio'
        // video
        width: number
        height: number
        frameRate: AVRational
        sampleAspectRatio: AVRational
        // audio
        channels: number
        channelLayout: string
        sampleRate: number
    }

    // packet
    class Packet {
        constructor(bufSize: number, pts: number)
        isEmpty: boolean
        get streamIndex(): number
        set streamIndex(index: number)
        getData(): Uint8Array
        delete(): void
    }

    // frame
    class Frame {
        imageData(plane_index: number): Frame
        delete(): void
    }

    // filter
    class Filterer {
        constructor(inStreams: Map<string, string>, outStreams: Map<string, string>, mediaTypes: Map<string, string>, graphSpec: string)
        filter(frames: Map<string, Frame>): Map<string, Frame>
        delete(): void
    }

    // encode
    class Encoder {
        constructor(params: StreamInfo)
        encode(f: Frame): Vector<Packet>
        flush(): Vector<Packet>
        delete(): void
    }

    // muxer
    class Muxer {
        constructor(formatName: string, onWrite: (data: Uint8Array) => void)
        static inferFormatInfo(format: string, filename: string): {format: string, videoCodec: string, audioCodec}
        newStream(encoder: Encoder): void
        openIO(): void
        writeHeader(): void
        writeTrailer(): void
        writeFrame(packet: Packet): void
        delete(): void
    }
}


declare namespace FS {
    interface Lookup {
        path: string;
        node: FSNode;
    }

    interface FSStream {}
    interface FSNode {}
    interface ErrnoError {}

    let ignorePermissions: boolean;
    let trackingDelegate: any;
    let tracking: any;
    let genericErrors: any;

    //
    // paths
    //
    function lookupPath(path: string, opts: any): Lookup;
    function analyzePath(path: string, dontResolveLastLink?: boolean): {
        isRoot: boolean, exists: boolean, error: Error, name: string, path: string,
        /** more items... */
    }
    function getPath(node: FSNode): string;

    //
    // nodes
    //
    function isFile(mode: number): boolean;
    function isDir(mode: number): boolean;
    function isLink(mode: number): boolean;
    function isChrdev(mode: number): boolean;
    function isBlkdev(mode: number): boolean;
    function isFIFO(mode: number): boolean;
    function isSocket(mode: number): boolean;

    //
    // devices
    //
    function major(dev: number): number;
    function minor(dev: number): number;
    function makedev(ma: number, mi: number): number;
    function registerDevice(dev: number, ops: any): void;

    //
    // core
    //
    function syncfs(populate: boolean, callback: (e: any) => any): void;
    function syncfs(callback: (e: any) => any, populate?: boolean): void;
    function mount(type: Emscripten.FileSystemType, opts: any, mountpoint: string): any;
    function unmount(mountpoint: string): void;

    function mkdir(path: string, mode?: number): any;
    function mkdev(path: string, mode?: number, dev?: number): any;
    function symlink(oldpath: string, newpath: string): any;
    function rename(old_path: string, new_path: string): void;
    function rmdir(path: string): void;
    function readdir(path: string): any;
    function unlink(path: string): void;
    function readlink(path: string): string;
    function stat(path: string, dontFollow?: boolean): any;
    function lstat(path: string): any;
    function chmod(path: string, mode: number, dontFollow?: boolean): void;
    function lchmod(path: string, mode: number): void;
    function fchmod(fd: number, mode: number): void;
    function chown(path: string, uid: number, gid: number, dontFollow?: boolean): void;
    function lchown(path: string, uid: number, gid: number): void;
    function fchown(fd: number, uid: number, gid: number): void;
    function truncate(path: string, len: number): void;
    function ftruncate(fd: number, len: number): void;
    function utime(path: string, atime: number, mtime: number): void;
    function open(path: string, flags: string, mode?: number, fd_start?: number, fd_end?: number): FSStream;
    function close(stream: FSStream): void;
    function llseek(stream: FSStream, offset: number, whence: number): any;
    function read(stream: FSStream, buffer: ArrayBufferView, offset: number, length: number, position?: number): number;
    function write(
        stream: FSStream,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position?: number,
        canOwn?: boolean,
    ): number;
    function allocate(stream: FSStream, offset: number, length: number): void;
    function mmap(
        stream: FSStream,
        buffer: ArrayBufferView,
        offset: number,
        length: number,
        position: number,
        prot: number,
        flags: number,
    ): any;
    function ioctl(stream: FSStream, cmd: any, arg: any): any;
    function readFile(path: string, opts: { encoding: 'binary'; flags?: string | undefined }): Uint8Array;
    function readFile(path: string, opts: { encoding: 'utf8'; flags?: string | undefined }): string;
    function readFile(path: string, opts?: { flags?: string | undefined }): Uint8Array;
    function writeFile(path: string, data: string | ArrayBufferView, opts?: { flags?: string | undefined }): void;

    //
    // module-level FS code
    //
    function cwd(): string;
    function chdir(path: string): void;
    function init(
        input: null | (() => number | null),
        output: null | ((c: number) => any),
        error: null | ((c: number) => any),
    ): void;

    function createLazyFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
    ): FSNode;
    function createPreloadedFile(
        parent: string | FSNode,
        name: string,
        url: string,
        canRead: boolean,
        canWrite: boolean,
        onload?: () => void,
        onerror?: () => void,
        dontCreateFile?: boolean,
        canOwn?: boolean,
    ): void;
    function createDataFile(
        parent: string | FSNode,
        name: string,
        data: ArrayBufferView,
        canRead: boolean,
        canWrite: boolean,
        canOwn: boolean,
    ): FSNode;
}

declare var MEMFS: Emscripten.FileSystemType;
declare var NODEFS: Emscripten.FileSystemType;
declare var WORKERFS: Emscripten.FileSystemType;
declare var IDBFS: Emscripten.FileSystemType;