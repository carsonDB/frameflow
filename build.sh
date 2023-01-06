#!/bin/bash

ROOT=$PWD
EMSDK_ROOT=$ROOT/emsdk
LLVM_RANLIB=$EMSDK_ROOT/upstream/bin/llvm-ranlib
LLVM_NM=$EMSDK_ROOT/upstream/bin/llvm-nm

# activate emcc
source $EMSDK_ROOT/emsdk_env.sh

# verify Emscripten version
emcc -v


# configure FFmpeg with Emscripten
CFLAGS="" #"-s USE_PTHREADS"
LDFLAGS="$CFLAGS -s INITIAL_MEMORY=33554432" # 33554432 bytes = 32 MB
CONFIG_ARGS=(
  --target-os=none        # use none to prevent any os specific configurations
  --arch=x86_32           # use x86_32 to achieve minimal architectural optimization
  --enable-cross-compile  # enable cross compile
  --disable-x86asm        # disable x86 asm
  --disable-inline-asm    # disable inline asm
  --disable-stripping     # disable stripping
  --extra-cflags="$CFLAGS"
  --extra-cxxflags="$CFLAGS"
  --extra-ldflags="$LDFLAGS"
  --nm="$LLVM_NM -g"
  --ar=emar
  --as=llvm-as
  --ranlib=$LLVM_RANLIB
  --cc=emcc
  --cxx=em++
  --objcc=emcc
  --dep-cc=emcc
)
# build FFmpeg library
cd $ROOT/FFmpeg
emconfigure ./configure "${CONFIG_ARGS[@]}"
emmake make -j4
# build ffmpeg.wasm
mkdir -p wasm/dist
ARGS=(
  -I. #-I./fftools
  -Llibavcodec -Llibavdevice -Llibavfilter -Llibavformat -Llibavresample -Llibavutil -Llibpostproc -Llibswscale -Llibswresample
  -Qunused-arguments
  -o wasm/dist/ffmpeg.js fftools/ffmpeg_opt.c fftools/ffmpeg_filter.c fftools/ffmpeg_hw.c fftools/cmdutils.c fftools/ffmpeg.c
  -lavdevice -lavfilter -lavformat -lavcodec -lswresample -lswscale -lavutil -lm
  # -s USE_SDL=2                    # use SDL2
  # -s USE_PTHREADS=1               # enable pthreads support
  -s INITIAL_MEMORY=33554432      # 33554432 bytes = 32 MB
)
emcc "${ARGS[@]}"
# end of compiling FFmpeg, jump back to the root
cd $ROOT


# build src/cpp
emmake make

# link above object files
# emcc ./src/cpp/...main.o -lembind -o ./build/ffmpeg.js # -O3