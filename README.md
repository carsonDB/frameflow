# [FrameFlow](https://frameflow.netlify.app/)

A both speedy and compatible video processing library for Web Browser, based on WebCodecs and FFmpeg (WebAssembly). 

For encoding/decoding, it is hardware accelerated by WebCodecs as default, which works in Chromium-based clients (Chrome, Edge, Electron...). And also provides fallback solutions by FFmpeg (WebAssembly).

For muxing/demuxing (without loss), it uses FFmpeg to do it on the fly efficiently. For example, convert HLS stream to mp4.

It also provides some usual filters (trim, loop, concat...), based on FFmpeg Filters. These are useful for lightweight tasks, like audio processing.

## Features
- Process videos in stream way, without video size limitation.
- Accept stream input `MediaStream` (from canvas, Camera, ...), and output stream of frames (to canvas...) as well.
- Use `WebCodecs` to have hardware acceleration for Chromium-based client (Chrome (>=106), Edge, Opera, Electron...).
- Get detailed metadata of video file by reading only several chunks, either from local disk or remote url.
- Processing speed can be controlled either automatically or manually.

## Install

### NPM
```bash
npm i frameflow
```

### HTML script
```html
<script src='https://unpkg.com/frameflow/dist/frameflow.min.js' ></script>
```

## Basic example

```JavaScript
import fflow from 'frameflow'

let video = await fflow.source(videoBlob) // use web File api to get File handler.
let audio = await fflow.source(audioURL) // remote media file (no need to download entirely beforehand)
let audioTrim = audio.trim({start: 10, duration: video.duration}) // use metadata of video
let blob = await fflow.group([video, audioTrim]).exportTo(Blob, {format: 'mp4'}) // group and trancode to 
videoDom.src = URL.createObjectURL(blob)
// now can play in the browser
```
Although this example writes to blob entirely, then play.
But underhood, it streams out chunks and then put togather.
So you can customize to write to any other targets in stream way.

```JavaScript
// `exportTo` actually use `export` underhood
const target = await this.export(Blob, {format: 'mp4'})
for await (const chunk of target) {
    if (!chunk.data) continue
    // write to any target with chunk.data and chunk.offset (since not always in sequence)
}
```

## Transmux without re-encoding
When you want to change only file format without loss, it will automatically copy packets without re-encoding.

### HLS to mp4
Currently mainly support static `m3u8` file url as input.

```JavaScript
const hlsSource = await fflow.source(`http://hls-example.m3u8`)
const blob = await hlsSource.exportTo(Blob, { format: 'mp4' })
```

## Transcoding
When you set export video/audio configuration (like codec, bitrate, etc), it will decode and encode.

```JavaScript
const source = await fflow.source(`http://video.webm`)
const out_1 = await source.exportTo(Blob, { format: 'mp4' })
const out_2 = await source.exportTo(Blob, { format: 'webm', bitrate: 10000000 })
```
For `out_1`, if `webm` and `mp4` have different codecs (usually), so it will transcode.
For `out2`, setting different output bitrate from input's, will also transcode.


### More examples
More detailed browser examples are in the `./examples/browser/`.

If you want to run them, please use latest release version. And then, at the root directory of the project.
```
npm install
npm start
```
In dev mode, it will serve `./examples` as root directory.

## Worker setting
Underhood, each export task uses an unique worker for each time.
But this will cause too long to load (~1 second), and also cost too much memory 
if processing many videos at the same time.
- use `fflow.load()` to load the default worker with loaded ffmpeg module, shared by all use cases.
- use `fflow.load({newWorker: true})` to create an new worker with loaded ffmpeg module, and assign to `export` as a parameter. This multi-thread case will accelerate if having many `export` tasks.
And sometimes, as a more complex case, if two `export` have dependencies, there may be a dead lock 
if they share the same worker (thread).

```JavaScript
let worker = fflow.load({newWorker: true})
let blob = await video.exportTo(Blob, {format: 'mp4', worker }) // group and trancode to 
```

## Difference with FFmpeg library
This library consists of two parts:
- JavaScript(TypeScript) as a wrapper orchestrates entire workflow, and also handles all input/output logic.
- WASM migrated from core library (`libav`) of FFmpeg. Not include FFmpeg tools like Commandline. So cannot use commandline in FFmpeg to process.


## Document
All tutorials and documents are in [FrameFlow Doc](https://frameflow.netlify.app/docs/intro/getStarted).

## [Problems](https://frameflow.netlify.app/blog/why-frameflow/#problems-of-frameflow)


## How to build
*Warning: [webpack dev mode cannot hot reload in WSL2 (windows).](https://mbuotidem.github.io/blog/2021/01/09/how-to-hot-reload-auto-refresh-react-app-on-WSL.html)*

### Dependencies (Ubuntu)
Tools dependencies install
```
sudo apt-get update -y
sudo apt-get install -y pkg-config
```

### Emscripten
```
git clone https://github.com/emscripten-core/emsdk.git --branch 3.1.52
rm -r emsdk/.git
```
[Install Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html#installation-instructions-using-the-emsdk-recommended)

### FFmpeg version (n5.0 release)
```
git clone  https://github.com/FFmpeg/FFmpeg --depth 1 --branch n5.0
rm -r FFmpeg/.git
```

### External FFmpeg Libraries
All external libraries sources are under `./ffmpeg_libraries`
```
cd ffmpeg_libraries
```

x264
```
git clone https://github.com/mirror/x264.git --depth 1 --branch stable 
```
Libvpx
```
git clone https://github.com/webmproject/libvpx.git --depth 1 --branch v1.12.0
```

### Compilation 
```
./build_ffmpeg.sh
./build_wasm.sh
```

