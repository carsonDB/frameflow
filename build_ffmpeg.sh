#!/bin/bash

ROOT=$PWD
EMSDK_ROOT=$ROOT/emsdk
FFMPEG=$ROOT/FFmpeg
LLVM_RANLIB=$EMSDK_ROOT/upstream/bin/llvm-ranlib
LLVM_NM=$EMSDK_ROOT/upstream/bin/llvm-nm
EXT_LIB=$ROOT/ffmpeg_libraries

# activate emcc
source $EMSDK_ROOT/emsdk_env.sh

# external libraries

# x264 (configure + make)
# cd $EXT_LIB/x264 && emconfigure ./configure \
#   # --prefix=${PREFIX} \
#   --host=i686-gnu \
#   --enable-static \
#   --disable-cli \
#   --disable-asm \
#   --extra-cflags="-s USE_PTHREADS=1"
# cd $EXT_LIB/x264 && emmake make && emmake make install 

# # libvpx
# cd $EXT_LIB/libvpx && emconfigure 



# configure FFmpeg with Emscripten
CFLAGS="-s USE_PTHREADS=1 -O3"
LDFLAGS="$CFLAGS -s INITIAL_MEMORY=33554432" # 33554432 bytes = 32 MB
CONFIG_ARGS=(
  --target-os=none        # use none to prevent any os specific configurations
  --arch=x86_32           # use x86_32 to achieve minimal architectural optimization
  --enable-cross-compile  # enable cross compile
  --disable-asm           # disable asm optimization
  --disable-stripping     # disable stripping
  --enable-gpl
  
  # demuxer / muxer
  --disable-muxers
  --enable-muxer=mp4,mov,matroska,webm,avi
  # decoder / encoder
  --disable-encoders
  --enable-encoder=aac,pcm_s16le,mpeg4
  # external library
  ## --enable-libx264
  # --enable-libvpx
  # filter
  --disable-filters
  --enable-filter=concat,amerge,atrim,trim,aloop,loop,volume,aformat,format,scale
  # protocal
  --disable-protocols
  --enable-protocol=file

  --disable-programs
  --disable-avdevice
  --disable-bsfs
  --disable-network
  --disable-debug
  
  # selected protocols
  --disable-protocols
  --enable-protocol=file
  
  --disable-sdl2
  --disable-hwaccels
  --disable-doc
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
cd $FFMPEG && emconfigure ./configure "${CONFIG_ARGS[@]}"
cd $FFMPEG && emmake make -j4
