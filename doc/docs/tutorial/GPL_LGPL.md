---
id: "GPL_LGPL"
title: "GPL or LGPL"
sidebar_position: 0
---

# FrameFlow license

This open source project is `LGPL` license. But it actually doesn't matter.
Because it is based on FFmpeg, which has two license, `GPL` or `LGPL`. 
Roughly speaking, `GPL` is stricter than `LGPL`. So if only you comply with these licenses.
You also comply with FrameFlow license.

# FFmpeg licenses
Now lets' talk about FFmpeg licenses. It may be confusing to you if you are not familiar with these licenses.
I'll explain them in plain English. 

## GPL
If you use FFmpeg GPL license, you need to either open source your project or purchase a GPL commercial license for your proprietary software. And the most important point is, it is **contiguous**. 
That means, any project contains GPL FFmpeg, also need to comply with this rule.
So be careful about your usage.

## LGPL
`LGPL = Lesser GPL`. So it only requires that, any modifications in FFmpeg library must be open source.
But has no requirement of any codes **outside** its library, even for commecial use cases, for free.

## How to avoid GPL
By default, this project releases GPL FFmpeg compiled wasm file. Because it contains most components and chooses best.

However, if you want to only use `LGPL`, then at current time, you need to build wasm file by yourself.
Just remove `--enable-gpl` option in `./build_ffmpeg.sh`. Create an issue if you have any questions.

Preparing multiple versions of wasm file would be the future work of this project.

By the way, these are my understanding of licenses. Please correct me if there are some mistakes.