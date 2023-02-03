#!/bin/bash

ROOT=$PWD
EMSDK_ROOT=$ROOT/emsdk
FFMPEG=$ROOT/FFmpeg
LLVM_RANLIB=$EMSDK_ROOT/upstream/bin/llvm-ranlib
LLVM_NM=$EMSDK_ROOT/upstream/bin/llvm-nm
EXT_LIB=$ROOT/ffmpeg_libraries
EXT_LIB_BUILD=$EXT_LIB/build
# pkgconfig path: https://emscripten.org/docs/compiling/Building-Projects.html#pkg-config
EXT_LIB_BUILD_PKG_CONFIG=$EXT_LIB_BUILD/lib/pkgconfig
# activate emcc
source $EMSDK_ROOT/emsdk_env.sh

CFLAGS="-s USE_PTHREADS=1 -O3"


###################
# External libraries build
###################

# external libraries
# x264
cd "$EXT_LIB"/x264 && emconfigure ./configure \
  --prefix="${EXT_LIB_BUILD}" \
  --host=i686-gnu \
  --enable-static \
  --disable-cli \
  --disable-asm \
  --extra-cflags="$CFLAGS"
cd "$EXT_LIB"/x264 && emmake make clean
cd "$EXT_LIB"/x264 && emmake make install-lib-static -j4

# libvpx
cd "$EXT_LIB"/libvpx && emconfigure ./configure \
  --prefix="${EXT_LIB_BUILD}" \
  --target=generic-gnu \
  --disable-install-bins \
  --disable-examples \
  --disable-tools \
  --disable-docs \
  --disable-unit-tests \
  --disable-dependency-tracking \
  --extra-cflags="$CFLAGS" \
  --extra-cxxflags="$CFLAGS"
cd "$EXT_LIB"/libvpx && emmake make install -j4

# export global env variable for FFmpeg to detect
export EM_PKG_CONFIG_PATH=$EXT_LIB_BUILD_PKG_CONFIG
# export STRIP="llvm-strip"

###################
# FFmpeg build
###################

# configure FFmpeg with Emscripten
CFLAGS="$CFLAGS -I$EXT_LIB_BUILD/include"
LDFLAGS="$CFLAGS -s INITIAL_MEMORY=33554432 -L$EXT_LIB_BUILD/lib" # 33554432 bytes = 32 MB
CONFIG_ARGS=(
  --disable-autodetect
  --disable-runtime-cpudetect
  --target-os=none        # use none to prevent any os specific configurations
  --arch=x86_32           # use x86_32 to achieve minimal architectural optimization
  --enable-cross-compile  # enable cross compile
  --disable-asm           # disable asm optimization
  --disable-stripping     # disable stripping
  --enable-gpl            # for x264
  
  # demuxer / muxer
  # --disable-muxers
  # --enable-muxer=mp4,mov,matroska,webm,avi,aac
  # decoder / encoder
  # --disable-encoders
  # --enable-encoder=aac,pcm_s16le
  # external library
  # filter
  # --disable-filters
  # --enable-filter=concat,amerge,atrim,trim,aloop,loop,volume,aformat,format,scale,aresample
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

  # external libraries
  --enable-libx264
  --enable-libvpx
  
  --disable-sdl2
  --disable-hwaccels
  --disable-doc
  --extra-cflags="$CFLAGS"
  --extra-cxxflags="$CFLAGS"
  --extra-ldflags="$LDFLAGS"
  --pkg-config-flags="--static"
  --nm="$LLVM_NM -g"
  --ar=emar
  --as=llvm-as
  --ranlib="$LLVM_RANLIB"
  --cc=emcc
  --cxx=em++
  --objcc=emcc
  --dep-cc=emcc
)
# build FFmpeg library
cd "$FFMPEG" && emconfigure ./configure "${CONFIG_ARGS[@]}"
read -r -p "Check the FFmpeg configure, and press key to continue..."
cd "$FFMPEG" && emmake make -j4