# FrameFlow.js
An easy and flexible audio/video streaming processing tool, based on WebAssembly and FFmpeg.

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
let source = await fflow.source(blobIn)
let stream = await source.trim(1, 10).export()
stream.forEach(blob => {/* do something */})
```

## Complex demo
Multiple sources in, and multiple outputs. Inputs and outputs can be streaming frames.

```JavaScript
let video1 = await fflow.source('./test.avi') // node.js
let video2 = await fflow.source(blobFile) // browser
console.log(video2.duration) // show metadata of the source

// streaming processing (filtering)
video1 = video1.trim(startTime, endTime).loop(1.5)
let audio2 = video2.tracks('audio').setVolume(0.5)
video2 = fflow.merge([video2.tracks('video'), audio2])
let output = fflow.concat([video1, video2])

// output all at once
await output.exportTo('./out.webm')
// output frame by frame
let stream = await output.export('frame')
setInterval(() => {
    let blob = await stream.next()
}, 1000/30) // render at 30 fps.

```

## Get started
todo...

## How to build (linux)
```
./build.sh
```
Reference: [Build FFmpeg WebAssembly version (= ffmpeg.wasm): Part.2 Compile with Emscripten](https://jeromewu.github.io/build-ffmpeg-webassembly-version-part-2-compile-with-emscripten/)


### Emscripten
[Install Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html#installation-instructions-using-the-emsdk-recommended)

### FFmpeg version (n5.0 release)
```
git clone --depth 1 --branch n5.0 https://github.com/FFmpeg/FFmpeg
```
