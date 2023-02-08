---
id: "index"
title: "frameflow"
sidebar_label: "Readme"
sidebar_position: 0
custom_edit_url: null
---

# [FrameFlow](https://frameflow.netlify.app/)
An audio/video **stream** processing library for **JavaScript** world, based on WebAssembly and FFmpeg (libav*).
It directly uses low-level C API from libav* folders in FFmepg, wrapped with C++ and compiled as WebAssembly module. In other words, reimplements the I/O and control logic, to really fit into JavaScript world.
Learn more about [why frameflow](https://frameflow.netlify.app/blog/why-frameflow).

👌Thus, it has three major advantages:
- Stream in/out, plug in as a pipeline. Thus, no video size limiation, and stream processing.
For example, we can download, process and upload at the same time.
- Processing speed can be controlled either automatically or manually.
For example, export a video to a canvas as playing a video.
- Use JavaScript chaining style to build filter graphs, which is both easy and flexible.

⚠️ Note: current verison is at **prototype** stage. Only **web browser** examples are tested.
Nodejs hasn't been tested yet.
And almost everything is under optimization. You words will shape the future of FrameFlow.

## Demo

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

More detailed browser demos are in the `./examples/browser/index.html`

## Install

### NPM
```bash
npm i frameflow
```

### HTML script
```html
<script src='https://unpkg.com/frameflow/dist/frameflow.min.js' ></script>
```

## Get started

### Create source
Accept multiple type of sources, e.g. url / path / Blob / ArrayBuffer / ReadableStream.
TypeScript will give hints.
```JavaScript
let video = await fflow.source('./test.avi')
```

### Get metadata
Metadata can provide you some information, which can be used for filters' arguments.
And internally, they are also used for checking your created filter graph, which will explain in [filters](#filters).
```JavaScript
let video = await fflow.source('./test.avi')
console.log(video.duration) // get one item in metadata
console.log(video.metadata) // get all metadata information (container + tracks)
```

### Tracks selection
Usually, we can directly operate on multiple tracks as a group.
And one track is seen as a group in which only one element.
Thus, created source is also a group.
And it is also convenient to apply filters to a group of tracks at a time.
```JavaScript
let video = await fflow.source('./test.avi') // return a TrackGroup
let audioTrackGroup = video.filter('audio') // return a new TrackGroup (contain only audio tracks)
let audioTracks = audioTrackGroup.tracks() // return an array of Tracks. (audio)
let newGroup = fflow.group([audioTracks[0], audioTracks[1]]) // group multiple tracks into one group
```

### Transcode
One of core use cases is to convert audio/video files into another with different parameters, e.g. format, codec. Here you just need to focus on source and target, using `Export` function.
It will build a graph internally to execute.
There are three ways to `export`, meeting your various use cases.

#### `exportTo`: fastest way
This api can export to multiple types of outputs, e.g. url / path / Blob / ArrayBuffer.
```JavaScript
let video = await fflow.source('./test.avi')
await video.exportTo('./out_test.mp4') // no return
let blob = await video.exportTo(Blob) // return a new blob
```
#### `export + for...of`: flexible way with automatic pace
```JavaScript
let target = await video.export()
for await (let chunk of target) {
    /* post-processing chunk */
    chunk.data // Uint8Array (browser) / Buffer (node)
    chunk.offset // chunk offset position (bytes) in the output file
}
```
#### `export + next`: most flexible way with manual control
Actually this way is the basic method for above two ways.
```JavaScript
let target = await video.export()
let chunk = await target.next()
while (chunk.data) {
    /* post-processing chunk */
    chunk = await target.next()
}
// execute this line if quitting halfway.
await target.close()
```

### Filters

Filters in FFmpeg is useful when we need to manipulate each frame of a video.
But using FFmpeg command-line to build a filter link or graph can be difficult sometimes.
Now here, we can use JavaScript way to build a graph, both flexible and easy to read.
#### Example
```JavaScript
let video = await fflow.source('./test.avi')
await video.trim({start: 1, duration: video.duration}).setVolume(0.5).exportTo('./out_test.mp4')
```
This example apply `trim` and `setVolume` filter operations which support chainable operation.
Each filter operation returns a new TrackGroup.

⚠️ Note that there are some difference between these filter operations and FFmpeg filters.
They are not one-to-one correspondence.
For example, in FFmpeg, we apply `trim` to video track (stream) and `atrim` to audio track (stream).
But here, `TrackGroup.trim()` apply either `trim` or `atrim` to each internal track (stream).
They are smart enough to build and process.

#### Filters API
- trim(args: {start: number, duration: number}). In seconds.
- setVolume(multiple: number). Multiple of input volume

## [Problems](https://frameflow.netlify.app/blog/why-frameflow/#problems-of-frameflow)

### Preload WASM binary
By default, it will load wasm module on demand.
However, since the wasm module size is ~22MB. You can preload it by calling `fflow.loadWASM()`.
No matter how many times you call this function. FrameFlow only downloads once.
So don't worry repetitively call this api.

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
git clone https://github.com/emscripten-core/emsdk.git --branch 3.1.30
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
