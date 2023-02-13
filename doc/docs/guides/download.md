---
id: "download"
title: "WASM Download"
sidebar_position: 0
---

# WASM Download

## WASM file size
The library includes binary wasm file, you can see from [`unpkg`](https://unpkg.com/browse/frameflow/dist/) or [`jsDelivr`](https://cdn.jsdelivr.net/npm/frameflow/dist/). 
And during downloading, it actually transfers ~8MB, instead of ~22MB. 
Because servers automatically compress to gzip format, and browsers uncompress it as well.
We can check in our `Chrome dev tool -> network`:

![download analysis](./assets/download%20analysis.png)

## Download strategy
By default, the library will download when it really needs. So don't need to download manually.
But if you care about the download latency (a few seconds in my network environment), you can preload it using `loadWASM` function. Like this:

```js
import fflow from 'frameflow'

fflow.loadWASM() // no need to use await
/**
 * do others
 **/

// start to use it
const src = await fflow.source('...')
```

`loadWASM` will return a `promise` from `fetch`, you can get wasm file in `ArrayBuffer`, which can be for your customized cache. But usually, there is no need to.
You can call `loadWASM` multiple times, and only the first `fetch` caches the `promise`.
All later calls will just `await` the first `promise`. So don't worry about multiple calls of it.

## Lazily download (TODO)
Actually, with the library including more codecs, container formats, the size of wasm file will increase as well. So ultimate solution to this, is to split the wasm module and lazily download on demand. 
Each part can be reduced to <1 MB. So we can ignore the downloading process.
However, it is the future work, which haven't done yet.