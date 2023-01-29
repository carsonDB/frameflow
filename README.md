# FrameFlow
An audio/video stream processing library for **JavaScript** world, based on WebAssembly and FFmpeg (libav*).

It has three major advantages 👌:
- Stream in/out, plug in as a pipeline. Thus, no video size limiation. 
For example, we can download, process and upload at the same time.
- Processing speed can be controlled either automatically or manually.
For example, export video to a canvas like playing the video.
- Use JavaScript chainable style to build filter graphs, which is both easy and flexible.

⚠️ Note: current verison is at **prototype** stage. Only web browser examples are tested.
Nodejs hasn't tested yet.
And almost everything is under optimization. You words will shape the future of FrameFlow.

## Simple demo
Demos are in the `./examples/...`

One media source in, and one out (another encoding), with a simple filter.
### Nodejs (only)
```JavaScript
import fflow from 'frameflow'
let source = await fflow.source('./test.avi')
await source.trim(1, 10).exportTo('./out.webm')
```

### Browser/Nodejs
```JavaScript
import fflow from 'frameflow'
// use web File api to get File handler.
let source = await fflow.source(fileBlob)
let stream = await source.trim(1, 10).export()
for await (let chunk of stream) {
    /* do something */
}
```

## Complex demo
Multiple sources in, and multiple outputs. Inputs and outputs can be streaming images.

```JavaScript
let video1 = await fflow.source('./test.avi') // node.js
let video2 = await fflow.source(blobFile) // browser
console.log(video2.duration) // show metadata of the source

// streaming processing (filtering)
video1 = video1.trim(startTime, endTime).loop(1.5)
let audio2 = video2.filter('audio').setVolume(0.5)
video2 = fflow.merge([video2.filter('video'), audio2])
let output = fflow.concat([video1, video2])

// output all at once
await output.exportTo('./out.webm')
// output frame by frame
let stream = await output.export({image: 'bmp'})
setInterval(() => {
    let image = await stream.next()
}, 1000/30) // render at 30 fps.
stream.close()

```

## Install
todo...

## Get started

### Create source
Accept multiple type of sources, e.g. url / path / Blob / ArrayBuffer / ReadableStream.
TypeScript will give hints.
```JavaScript
let video = await fflow.source('./test.avi')
```

### Tracks
Usually, we can directly operate on multiple tracks as a group.
And one track is seen as a group in which only one element.
Thus, created source is also a group.
And it is also convenient to apply filters to a group of tracks at a time.
```JavaScript
let video = await fflow.source('./test.avi') // return a TrackGroup
let tracks = video.tracks() // return an array of Tracks. (audio / video)
let audioTracks = video.filter('audio') // return a new TrackGroup (contain only audio tracks)
let newGroup = fflow.group([audioTracks[0], video.tracks()[1]]) // group multiple tracks into one
```

### Get metadata
Metadata can provide you some information, which can be used for filters' arguments.
And internally, they are also used for checking your created filter graph, which will explain in [filters](#filters).
```JavaScript
let video = await fflow.source('./test.avi')
console.log(video.duration) // get one item in metadata
console.log(video.metadata) // get all metadata information (container + tracks)
```

### Transcode
One of core features is to convert audio/video files into another with different parameters, e.g. format, codec. Here you just need to focus on source and target, using `Export` function.
It will build a graph internally to execute.
There are three ways to `export`, fitting in your various use cases.

#### `exportTo`: fastest way
This api can export to multiple types of outputs, e.g. url / path / Blob / ArrayBuffer.
```JavaScript
let video = await fflow.source('./test.avi')
await video.exportTo('./out_test.mp4') // no return
let blob = await video.exportTo(Blob) // return a new blob
```
#### `export`: flexible way with automatic pace
```JavaScript
let target = await video.export()
for await (let chunk of target) {
    /* post-processing chunk */
    chunk.data // Uint8Array (browser) / Buffer (node)
    chunk.offset // chunk offset position (bytes) in the output file
}
```
#### `export`: most flexible way with manual control (export)
Actually this way is the basic method for above two ways.
```JavaScript
let target = await video.export()
let chunk = await target.next()
while (chunk.data) {
    /* post-processing chunk */
    chunk = target.next()
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
await video.trim(1, video.duration).setVolume(0.5).exportTo('./out_test.mp4')
```
This example apply `trim` and `setVolume` filter operations which support chainable operation.
Each filter operation returns a new TrackGroup.

⚠️ Note that there are some difference between these filter operations and FFmpeg filters.
They are not one-to-one correspondence.
For example, in FFmpeg, we apply `trim` to video track (stream) and `atrim` to audio track (stream).
But here, `TrackGroup.trim()` apply either `trim` or `atrim` to each internal track (stream).
They are smart enough to build and process.

#### Filters API
- trim(startTime: number, endTime: number). In seconds.
- setVolume(volume: number). Times of volume

## Problems
### Packet size
### Speed
### Limitation


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
```
[Install Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html#installation-instructions-using-the-emsdk-recommended)

### FFmpeg version (n5.0 release)
```
git clone  https://github.com/FFmpeg/FFmpeg --depth 1 --branch n5.0
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

