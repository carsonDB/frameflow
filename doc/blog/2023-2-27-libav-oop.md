---
slug: libav-oop
title: Libav (FFmpeg) C API understanding from Object-Oriented view
authors: [carson]
---

Recently, I was developing WebAssembly based FFmpeg library, [FrameFlow](https://github.com/carsonDB/frameflow). It directly uses low-level C API of libav* folders from FFmpeg, to give more power to web browser. I want to share some development experience of using those C APIs.

FFmpeg mainly has two ways to use it. Command-line way or C API. Actually Command-line program is also based on C API. Now when your first time to learn those APIs, it would be confused why there are multiple steps to create one thing. Because C language only has functions to do something. Why not use just one function to init something?
Here is an example (C++), from [encode.cpp](https://github.com/carsonDB/frameflow/blob/6681b44073a65e5ab612e0bf6f24f71742095d5d/src/cpp/encode.cpp#L14).
```cpp
auto codec = avcodec_find_encoder_by_name(info.codec_name.c_str());
auto codec_ctx = avcodec_alloc_context3(codec);
set_avcodec_context_from_streamInfo(info, codec_ctx);
auto ret = avcodec_open2(codec_ctx, codec, NULL);
```
This is minimum requirements to create an encoder. Let me explain one by one.
First `avcodec_find_encoder_by_name` find the `Codec` by its name. This `Codec` is just like a class. You cannot change any value in it. It gives you some meta information about the codec (like `libx264` codec), and also has pointers to functions to encode for example. Its type is `AVCodec`.
Second line `avcodec_alloc_context3`, is just `malloc` a memory block, with every value in the struct set to default value. It is called `codec_ctx` (codec context). The name is a convention in FFmpeg. Because its type is `AVCodecContext`. This is just like using `new` to create a new object (instance).
The third line is to set all values from `info` which I defined before. And this function is my defined function. Don't care about it. This step is just like giving parameters to `constructor` of the class.
The last line `avcodec_open2` is to initiate the object (instance). Just like calling constructor of the class.

So although, FFmpeg is written in pure C language. But it actually uses some Object-oriented style to organize the codebase. You can also see other similar examples about `demuxer`, `muxer`, `decoder` in my project.

## Changes after init

### Decoder: Time_base
In my experience of developing, there are some annoying bugs that seem weird, at first glance. Then after understanding the init process as I explained above, there is a key step that we should care about, last step `avcodec_open2`. Because it starts a contructor function, and init. It may change some fields that you set at the previous step.
For example, here when you call `avcodec_open2`. It will use specifed codec algorithm to init. And often, `time_base` will be changed to another value. That may let us surprised. So any output frames' `time_base` is according to the new one, not the one you set. So after calling `avcodec_open2`, you may need to retrieve current `time_base` value from `codec_ctx`, to do further stuff.
By the way, you may wonder what is `time_base` ? It might be worth to write another blog to explain. And now, simply explained, it is just a time unit, like second, microsecond, etc.

### Encoder: format (pixel format / sample format)...
There is another example. For encoder, pixel format (video) or sample format (audio) may be changed, by specified codec algorithm, which the decoder uses. So after init, the encoder may only accept another pixel format frame. So before encoding, you need to `rescale` video frames to the specified pixel format, or `resample` audio frames to the specified sample format.

## Conclusion
Overall, having an Object-oriented view would better understand those C APIs. And You can see all cpp codes in [FrameFlow-0.1.1 release](https://github.com/carsonDB/frameflow/blob/6681b44073a65e5ab612e0bf6f24f71742095d5d/src/cpp/).
