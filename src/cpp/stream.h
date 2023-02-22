#ifndef STREAM_H
#define STREAM_H

// #include <cstdio>
#include "encode.h"
#include "utils.h"
#include "metadata.h"
using namespace std;



class Stream {
    AVStream* av_stream;

public:
    
    /**
     * refer: FFmpeg/doc/examples/remuxing.c
     */
    Stream(AVFormatContext* format_ctx, AVStream* avstream) {
        av_stream = avformat_new_stream(format_ctx, NULL);
        auto ret = avcodec_parameters_copy(av_stream->codecpar, avstream->codecpar);
        CHECK(ret >= 0, "Failed to copy stream parameters to output stream.");
        av_stream->codecpar->codec_tag = 0;
    }

    Stream(AVFormatContext* format_ctx, Encoder* encoder) {
        auto av_encoder = encoder->av_codecContext_ptr();
        av_stream = avformat_new_stream(format_ctx, NULL);
        auto ret = avcodec_parameters_from_context(av_stream->codecpar, av_encoder);
        CHECK(ret >= 0, "Failed to copy encoder parameters to output stream.");
        av_stream->time_base = av_encoder->time_base;
        // av_stream->id = format_ctx->nb_streams - 1;
    }

    Stream(AVFormatContext* format_ctx, StreamInfo& info) {
        av_stream = avformat_new_stream(format_ctx, NULL);
        set_avstream_from_streamInfo(av_stream, info);
        // av_stream->codecpar->codec_tag = avcodec_pix_fmt_to_codec_tag((AVPixelFormat)av_stream->codecpar->format);
    }

    ~Stream() { av_free(av_stream); }

    AVStream* av_stream_ptr() { return av_stream; }

};


#endif