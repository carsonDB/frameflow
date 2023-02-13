---
id: 'filters'
title: 'Filters'
sidebar_position: 2
---

# Filters

In FFmpeg, filters is useful when we need to manipulate each frame of a video.
But using FFmpeg command-line to build a filter link or graph can be difficult sometimes.
Now here, we can use JavaScript way to build a graph, both flexible and easy to read.

## Example
```JavaScript
let video = await fflow.source('./test.avi')
await video.trim({start: 1, duration: video.duration})
           .setVolume(0.5)
           .exportTo('./out_test.mp4')
```

This example apply `trim` and `setVolume` filter operations which support chainable operation.
Each filter operation returns a new TrackGroup.

⚠️ Note that there are some difference between these filter operations and FFmpeg filters.
They are not one-to-one correspondence.
For example, in FFmpeg, we apply `trim` to video track (stream) and `atrim` to audio track (stream).
But here, `TrackGroup.trim()` apply either `trim` or `atrim` to each internal track (stream).
They are smart enough to build and process.

## Filter list

Here is list of current filters (functions) avaible:
- trim
- loop
- setVolume
- setDataFormat
- concat
- group
- merge

Each one can be check in [Filters API](/docs/API/modules)
