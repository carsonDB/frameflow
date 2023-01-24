# FrameFlow.js
An audio/video stream processing library for JavaScript world, based on WebAssembly and FFmpeg.

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
let audio2 = video2.tracks('audio').setVolume(0.5)
video2 = fflow.merge([video2.tracks('video'), audio2])
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

## Get started
todo...

## How to build (linux)
*Warning: [webpack dev mode cannot hot reload in WSL2 (windows).](https://mbuotidem.github.io/blog/2021/01/09/how-to-hot-reload-auto-refresh-react-app-on-WSL.html)*

```
./build_ffmpeg.sh
./build_wasm.sh
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

### External Libraries
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
