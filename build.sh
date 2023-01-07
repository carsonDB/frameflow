#!/bin/bash

ROOT=$PWD
EMSDK_ROOT=$ROOT/emsdk
FFMPEG=$ROOT/FFmpeg

# activate emcc
source $EMSDK_ROOT/emsdk_env.sh

# verify Emscripten version
emcc -v


# build ffmpeg.wasm (FFmpeg library + src/cpp/*)
mkdir -p wasm/dist
ARGS=(
  # -I.
  -Isrc/cpp src/cpp/*.cpp
  -I$FFMPEG
  -L$FFMPEG/libavcodec -L$FFMPEG/libavfilter -L$FFMPEG/libavformat -L$FFMPEG/libavutil
  -lavfilter -lavformat -lavcodec -lavutil
  -Qunused-arguments
  -lembind
  -o wasm/dist/ffmpeg.js
  -s INITIAL_MEMORY=33554432      # 33554432 bytes = 32 MB
  # -O3
)
em++ "${ARGS[@]}"
