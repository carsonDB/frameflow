#!/bin/bash

ROOT=$PWD
EMSDK_ROOT=$ROOT/emsdk
FFMPEG=$ROOT/FFmpeg

# activate emcc
source $EMSDK_ROOT/emsdk_env.sh

# verify Emscripten version
emcc -v


NAME="ffmpeg"
WASM_DIR="./src/wasm"

# build ffmpeg.wasm (FFmpeg library + src/cpp/*)
mkdir -p $WASM_DIR
ARGS=(
  -Isrc/cpp -I$FFMPEG src/cpp/*.cpp
  -L$FFMPEG/libavcodec -L$FFMPEG/libavfilter -L$FFMPEG/libavformat -L$FFMPEG/libavutil -L$FFMPEG/libswresample -L$FFMPEG/libswscale
  -lavfilter -lavformat -lavcodec -lavutil -lswresample -lswscale
  -Qunused-arguments
  -lembind
  -o $WASM_DIR/$NAME.js

  # all settings can be see at: https://github.com/emscripten-core/emscripten/blob/main/src/settings.js
  -s INITIAL_MEMORY=33554432      # 33554432 bytes = 32 MB
  -s FETCH # download wasm and cache
  -s MODULARIZE=1
  -s EXPORT_ES6=1
  -s ENVIRONMENT='web,worker,node'
  # -s EXPORTED_RUNTIME_METHODS=["FS"]

  # optimization for production phase
  # -O3
)

em++ "${ARGS[@]}"

# copy *.d.ts to enable typescript
cp src/ts/types/ffmpeg.d.ts $WASM_DIR/$NAME.d.ts