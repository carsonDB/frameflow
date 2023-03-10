---
id: "index"
title: "frameflow"
sidebar_label: "Readme"
sidebar_position: 0
custom_edit_url: null
---

# [FrameFlow](https://frameflow.netlify.app/)

[![Join Discord group](https://img.shields.io/badge/Discord-Join-blue?logo=discord&logoColor=white)](https://discord.gg/H698RFd8we)

A both speedy and compatible video processing library for Web Browser, based on WebCodecs and FFmpeg (WebAssembly). It is hardware accelerated by WebCodecs as default, which works in Chromium-based clients (Chrome, Edge, Electron...). And also provides fallback solutions by FFmpeg (WebAssembly). It also provides some usual filters (trim, concat...).

## Features
- Process videos in stream way, without video size limitation.
- Accept stream input `MediaStream` (from canvas, Camera, ...), and output stream of frames (to canvas...) as well.
- Use `WebCodecs` to have hardware acceleration for Chromium-based client (Chrome (>=106), Edge, Opera, Electron...).
- Get detailed metadata of video file by reading only several chunks, either from local disk or remote url.
- Processing speed can be controlled either automatically or manually.

⚠️ Note: **web browser** examples are tested. Nodejs hasn't been tested yet.

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

### More examples
More detailed browser examples are in the `./examples/browser/`.
If you want to run them, please use latest release version. And then, at the root directory of the project,
```
npm install
npm start
```
In dev mode, it will serve `./examples` as root directory.

## Install

### NPM
```bash
npm i frameflow
```

### HTML script
```html
<script src='https://unpkg.com/frameflow/dist/frameflow.min.js' ></script>
```

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
