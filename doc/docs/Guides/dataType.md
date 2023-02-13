---
id: "dataType"
title: "File/Stream"
sidebar_position: 0
---

# File / Stream

## Overview
FrameFlow supports a lot of data as input or output, if only they are supported by browsers natively.
For example, `string (url/path)`, `ReadableStream`, `ArrayBuffer/TypedArray`, etc.
But essentially, they can be divided into two groups, `file` or `stream`.

## File
As for FFmpeg users, file type is very common to understand. They are stored in local disks. We can get enough metadata information from them, before the running.

However, in web environment, things change a little differnt. 
File type becomes more general, if only meet the following criteria.
- Can get total length (byteLength) of the source, before running.
- Source can be seeked to any position, within the total length.

Given these two properties, we actually don't need to give the library additional information, except source itself. Provided the source, the library will seek to different positions and probe a little data.
Then get enough metadata information of the source, which will be necessary for running.

For example, if we give it a remote url. Then it will fetch with only `HEAD` required, to get totoal length of the source. If given `undefined` or `0`, this source will be seen as a `stream`. 
So you need to give it additional information to run.

## Stream (TODO)
⚠️Stream haven't been implemented yet.

Contrary to `File`, stream has no above two properties, which can be used for real-time processing.
But you need to give the source with additional information, like format of the source, etc.

