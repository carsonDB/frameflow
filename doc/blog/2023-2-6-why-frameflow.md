---
slug: why-frameflow
title: Why FrameFlow
authors: [carson]
---

### Background

Several years ago, I was developing a video editor. As a fan of front-end development,
my primary choice is to make it on web page. However, several components that I need drop the idea.
One of them is video processing tool. I needed FFmpeg, which cannot run in browser directly.
So I had to use Electron.

Then it seems feasible. But it made me exhausted, since I heavily relied on FFmpeg.
First, to use FFmpeg in Electron, actually Nodejs. We need to use it through Node provided api to
start a child process and send commands to it. It looks like we remote control something.
Although with the help of [node-fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg),
everything became easier. But underhood, it still uses command-line interface.

Command-line interface of FFmpeg is very easy to use at first glance.
However, in my use case, I needed several recorded audio files, trimmed, concat togather and merge with video. Then as for CMD, I needed to learn how to use `filter_complex` to build a complex graph, which costs a lot of time.

After these finished, exporting video worked. Since my editor generated video frames from canvas-like place.
I used ReadableStream to feed images into FFmpeg process. Because the process looked like a black box.
I cannot optimized the speed further.

Through the development, I also found that there is another way to use FFmpeg. To call low-level C API from `FFmpeg/libav*` folders. Actually FFmpeg is a collection of several tools, FFmpeg command-line program, FFprobe, FFplay. They are all based on `libav*` libraries. These APIs are flexible enough when we are not satisfied by CMD way. But learning curve is too high, we need to learn fundamentally [how video processing works](https://github.com/leandromoreira/ffmpeg-libav-tutorial).

### Inspiration from [FFmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm)
Someday, I accidently got that FFmpeg had been ported to WebAssembly. And it worked.
I was excited about the open source project. Hoped it can evetually allow my project move to web page.
However, I found that it only allows processing after an entire video file loaded into memory.
So my stream of input images is not applicable. 

### Solution: Custom I/O
After a while, a [discussion](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/58#issuecomment-879278640) of FFmpeg.wasm issue gave me a better solution. We can use WebAssembly to directly use libav APIs. In other words, reimplement input and output. Thus wasm-based FFmpeg can interact with any JavaScript data. This will give us enough flexiblity, and can real fit into browser environment.

There is another project [BeamCoder](https://github.com/Streampunk/beamcoder) gave me guides about how to wrap those low-level api and expose to JS. So in my case, I use C++ to wrap C api and use [Emscripten embind](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html) to expose self defined FFmpeg classes to JS world. So I can build video processing workflow in a JS worker.

### Inspired from TensorFlow / Pytorch
Initially, I just wanted to build something similar to BeamCoder. But maybe we can do it further. Since I know the experience of learning FFmpeg basic concepts and API is painful. Like, `container` / `codec`, `demux` / `decode`, `encode` / `mux`, and `pts`, `dts`, `time_base`, etc. So if this project abstracts those concepts while also keeps the same flexibility, others can avoid same headache experience. 

Then, I figured out that we can build a library like machine learning frameworks (`Tensorflow`, `Pytorch`).
Each frame of a video, no matter whether it is compressed (`packet`), or not (`frame`). They can all be viewed as `Tensor`. And entire process is through a tensors' graph. First build a graph. And when processing video, for each iteration, feed data (images/file/stream), execute the graph, and get the output (images/chunks). 

### Additional gain
So it is just a `for...loop`. We can keep it loop until ends. Also we can `break` in the middle, or skip by `continue`. Here is an example using FrameFlow api.
```js
for await (let chunk of target) {
    if (/* cond */) 
        continue
    else if (/*  cond */)
        break

    // do something regularly ...
}
```

### API design logic
The goal of FrameFlow is to keep flexible and simple. It is designed to support all JavaScript data, all will be processed in stream way. So video, audio or sequence of images can be viewed as an array. Each element in the array is an image (frame). Sometimes it is in compressed format, sometimes in uncompressed, and sometimes multiple arrays (video track/audio track) zip togather, like using python `zip` function.

Also, building a filter graph should also go in JS way.
Here is an example of comparing FFmpeg command-line style and FrameFlow JS style.

[CMD style](https://stackoverflow.com/a/56109487/6690269)
```bash
ffmpeg -i test.mp4 -filter_complex \
'[0:v] trim=start=5:end=10, setpts=PTS-STARTPTS [v0]; \
 [0:a]atrim=start=5:end=10,asetpts=PTS-STARTPTS [a0]'\
 -map [v0] -map [a0]  output.mp4
```

FrameFlow style
```js
let video = await fflow.source('./test.mp4')
await video.trim({start: 5, duration: 5}).exportTo('./output.mp4')
```

You don't need to understand why we need `trim` and `atrim`, what is `setpts`, what is `-map`...
Internally, frameflow actually converts JS style to FFmpeg style to build a filter graph.

### Problems of FrameFlow
After talking about advantages of frameflow, let's talk about some critic problems that still exist in the project.

### Speed
It is the top issue that decides how impactful it will be. Is it just a toy, a demo or a killer app ? Although WebAssembly is designed to have near-native speed performance. But in reality, things are not that simple. In my current version, since it hasn't done any optimization. The speed is roughly 10x slower than native FFmpeg one. Why, let me explain.

After doing some initial speed tests, I found out the bottlenecks are encode and decode phases.
Especially the encode phase. The gap between frameflow and FFmpeg is from three aspects.

- WebAssembly speed is a little bit slower than native one. Especially when there are many interactions between JS and WASM. The speed will slow down to half speed of the native one.
- FFmpeg have multi-threads enabled, frameflow currently haven't enabled.
- FFmpeg has SIMD optimization for various CPU architectures. FrameFlow hasn't.

#### Solutions
So here are some solutions for above each problem.

- Since frameflow directly manipulates FFmpeg low-level api. There is no need to mount any `Emscripten FS`. 
Every interaction between JS and Wasm is under control, even `log` to `stderr`. We can optimize if needed.

- Enable multi-threads, if enable `SharedArrayBuffer` and [cross-origin isolation](https://web.dev/i18n/en/cross-origin-isolation-guide/). Most cases are ok with that, except [some few use cases](https://blog.logrocket.com/understanding-sharedarraybuffer-and-cross-origin-isolation/#:~:text=The%20COEP%20header%20breaks%20every%20integration%20that%20requires%20communication%20with%20cross%2Dorigin%20windows%20in%20the%20browser%2C%20such%20as%20authentications%20from%20third%2Dparty%20servers%20and%20payments%20(checkouts).).

- Write WebAssembly SIMD codes. Since FFmpeg uses assembly SIMD code, which cannot port to wasm, because Emscripten only allow [`C intrinsics` codes](https://emscripten.org/docs/porting/simd.html#:~:text=Emscripten%20does%20not%20support%20x86%20or%20any%20other%20native%20inline%20SIMD%20assembly%20or%20building%20.s%20assembly%20files%2C%20so%20all%20code%20should%20be%20written%20to%20use%20SIMD%20intrinsic%20functions%20or%20compiler%20vector%20extensions.). So rewrite all the optimization codes would need a lot of time.
And Safari currently hasn't fully supported it. Check the [browser compatibility](https://webassembly.org/roadmap/#:~:text=0.1-,Fixed%2Dwidth%20SIMD,-91).

- Additional, use WebCodecs API when browsers support specific codec. This will directly have native encode and decode power. That is estimated to be have near-native speed, without any limitation. But not all browser support it. check the [compatibility](https://caniuse.com/webcodecs).

Altogather, not each one solution can solve the issue perfectly, but they togather will accelerate a lot.
That will be estimated to satisfied most of our daily use cases.

### Packet size
FrameFlow heavily relies on FFmpeg as basic component. 
However, FFmpeg library itself is huge size, from the perspective of web developers. So frameflow current wasm version is about 22 MB size.
Why? Because, during web developing, codes are downloaded and run when need. But FFmpeg downloads all before running, which is dozens of MB size. If you build the library without any components,
like encoder/decoder, demuxer/muxer and filters. Size of the library reduces to 1~2 MB, even <1 MB.

#### Solutions

- So do we really need all those components? No, most of time, we only need very small fraction of it. 
So why not download on demand? Like streaming media. In the future, we can attempt to use [Emscripten split feature](https://emscripten.org/docs/optimizing/Module-Splitting.html) to lazily load each fragment on demand.

- Current version has `loadWASM` api, which can preload the wasm binary.


## Conclusion

FrameFlow is designed to support any JavaScript data in stream way. And will do most of things FFmpeg can do.
And also gives more friendly API than either FFmpeg command-line way or low-level C API.
Your words will shape the future of FrameFlow.
