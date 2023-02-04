---
slug: why-frameflow
title: Why FrameFlow
authors: [carson]
---

FFmpeg is a both powerful and intuitive media processing library. We can use it in two ways.
- Command-line: most commonly used way.
- Libav* C API: these low-level api mainly for advanced users, who are not satified with Command-line.

## Problems: FFmpeg + Web development


## Problems of FrameFlow

### Packet size
FrameFlow heavily relies on FFmpeg as basic part.
However, FFmpeg library itself is huge size, from the perspective of web developers.
Why? Because, during web developing, codes are downloaded and run when need. But FFmpeg download all before running, which is dozens of MB size. If you build the library without any components,
like encoder/decoder, demuxer/muxer and filters. Size of the library reduces to 1~2 MB, even can <1 MB.
So do we really need all those components? No, most of time, we only need one or several components,
to do something. So why not download as needed?


#### Web style solution: download and run when needed
Webassembly comes to act as JavaScript partner, who is good at speed performance.

### Speed

#### Solutions
- Optimize interaction between JS and Wasm.
- Enable multi-threads.
- Use WebCodecs API when browsers support specific codec.
- Write WebAssembly SIMD codes.


## Conclusion

