#ifndef STREAM_H
#define STREAM_H

extern "C" {
    #include <libavformat/avformat.h>
    #include <libavutil/pixdesc.h>
    #include <libavutil/channel_layout.h>
}

#include "encode.h"
#include "utils.h"
using namespace std;


struct StreamInfo {
    int index;
    AVRational time_base;
    int64_t bit_rate;
    int64_t start_time;
    int64_t duration;
    string codec_type;
    string codec_name;
    string format;
    // video
    int width;
    int height;
    AVRational frame_rate;
    AVRational sample_aspect_ratio;
    // audio
    int channels;
    int sample_rate;
    string channel_layout;
    
    StreamInfo(AVStream* s) {
        index = s->index;
        auto par = s->codecpar;
        time_base = s->time_base;
        bit_rate = par->bit_rate;
        start_time = s->start_time;
        duration = s->duration;
        codec_name = avcodec_descriptor_get(par->codec_id)->name;
        if (par->codec_type == AVMEDIA_TYPE_VIDEO) {
            codec_type = "video";
            width = par->width;
            height = par->height;
            frame_rate = s->avg_frame_rate;
            sample_aspect_ratio = s->sample_aspect_ratio;
            format = av_get_pix_fmt_name((AVPixelFormat)par->format);
        }
        else if (par->codec_type == AVMEDIA_TYPE_AUDIO) {
            codec_type = "audio";
            sample_rate = par->sample_rate;
            channels = par->channels;
            format = av_get_sample_fmt_name((AVSampleFormat)par->format);
            // get description of channel_layout
            int buf_size = 256;
            char buf[buf_size];
            av_get_channel_layout_string(buf, buf_size, par->channels, par->channel_layout);
            channel_layout = buf;
        }
    }

    void set_avcodec_context_options(AVCodecContext* ctx) {
        ctx->bit_rate = bit_rate;
        ctx->time_base = time_base;
        if (codec_type == "video") {
            ctx->codec_type = AVMEDIA_TYPE_VIDEO;
            ctx->width = width;
            ctx->height = height;
            ctx->framerate = frame_rate;
            ctx->sample_aspect_ratio = sample_aspect_ratio;
            ctx->pix_fmt = av_get_pix_fmt(format.c_str());
        }
        else if (codec_type == "audio") {
            ctx->codec_type = AVMEDIA_TYPE_AUDIO;
            ctx->sample_rate = sample_rate;
            ctx->channels = channels;
            ctx->sample_fmt = av_get_sample_fmt(format.c_str());
            ctx->channel_layout = av_get_channel_layout(channel_layout.c_str());
        }
    }
};


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

    Stream(AVFormatContext* format_ctx, Encoder& encoder) {
        av_stream = avformat_new_stream(format_ctx, NULL);
        auto ret = avcodec_parameters_from_context(av_stream->codecpar, encoder.av_codecContext_ptr());
        CHECK(ret >= 0, "Failed to copy encoder parameters to output stream.");
        av_stream->time_base = encoder.av_codecContext_ptr()->time_base;
        // av_stream->id = format_ctx->nb_streams - 1;
    }
    ~Stream() { av_free(av_stream); }
    AVStream* av_stream_ptr() { return av_stream; }

};


#endif