---
id: 'getStarted'
title: 'Get Started'
sidebar_position: 1
---

# Get Started

## Install

### NPM
```bash
npm i frameflow
```
### HTML script
```html
<script src='https://unpkg.com/frameflow/dist/frameflow.min.js' ></script>
```

## Create source
Accept multiple type of sources, e.g. url / path / Blob / ArrayBuffer / ReadableStream.
TypeScript will give hints.
```js
let video = await fflow.source('./test.avi')
```

## Get metadata
Metadata can provide you some information, which can be used for filters' arguments.
And internally, they are also used for checking your created filter graph, which will explain in [filters](#filters).
```js
let video = await fflow.source('./test.avi')
console.log(video.duration) // get one item in metadata
console.log(video.metadata) // get all metadata information (container + tracks)
```

## Tracks selection
Usually, we can directly operate on multiple tracks as a group.
And one track is seen as a group in which only one element.
Thus, created source is also a group.
And it is also convenient to apply filters to a group of tracks at a time.
```js
let video = await fflow.source('./test.avi') // return a TrackGroup
let audioTrackGroup = video.filter('audio') // return a new TrackGroup (contain only audio tracks)
let audioTracks = audioTrackGroup.tracks() // return an array of Tracks. (audio)
let newGroup = fflow.group([audioTracks[0], audioTracks[1]]) // group multiple tracks into one group
```

## Transcode
One of core use cases is to convert audio/video files into another with different parameters, e.g. format, codec. Here you just need to focus on source and target, using `Export` function.
It will build a graph internally to execute.
There are three ways to `export`, meeting your various use cases.

### `exportTo`: fastest way
This api can export to multiple types of outputs, e.g. url / path / Blob / ArrayBuffer.
```js
let video = await fflow.source('./test.avi')
await video.exportTo('./out_test.mp4') // no return
let blob = await video.exportTo(Blob) // return a new blob
```
### `export + for...of`: flexible way with automatic pace
```js
let target = await video.export()
for await (let chunk of target) {
    /* post-processing chunk */
    chunk.data // Uint8Array (browser) / Buffer (node)
    chunk.offset // chunk offset position (bytes) in the output file
}
```
### `export + next`: most flexible way with manual control
Actually this way is the basic method for above two ways.
```js
let target = await video.export()
let chunk = await target.next()
while (chunk.data) {
    /* post-processing chunk */
    chunk = await target.next()
}
// execute this line if quitting halfway.
await target.close()
```
