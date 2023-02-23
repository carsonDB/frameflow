#ifndef FRAME_H
#define FRAME_H

#include <cstdio>
#include <emscripten/val.h>
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libavutil/frame.h>
    #include <libavutil/imgutils.h>
    #include <libavutil/timestamp.h>
    #include <libavutil/audio_fifo.h>
    #include <libavutil/channel_layout.h>
}

#include "utils.h"
using namespace emscripten;


struct FrameInfo {
    std::string format;
    int height;
    int width;
    int sample_rate;
    int channels;
    std::string channel_layout;
    int nb_samples;
};

class Frame {
    AVFrame* av_frame = NULL;
    int align = 32;
    std::string _name; // streamId
public:
    Frame() {} // todo... remove
    Frame(std::string name) {
        this->_name = name;
        av_frame = av_frame_alloc(); 
    }
    Frame(FrameInfo info, double pts, std::string name);
    ~Frame() { av_frame_free(&av_frame); }

    FrameInfo getFrameInfo();
    bool key() const { return av_frame->key_frame; }
    double doublePTS() const { return av_frame->pts; }
    std::string name() const { return this->_name; }
    int64_t pts() const { return av_frame->pts; }
    void set_pts(int64_t pts) { av_frame->pts = pts; }

    void audio_reinit(AVSampleFormat sample_fmt, int sample_rate, uint64_t channel_layout, int nb_samples);
    
    std::vector<emscripten::val> getPlanes() {
        std::vector<emscripten::val> data;
        auto isVideo = av_frame->height > 0 && av_frame->width > 0;

        if (isVideo) {
            size_t sizes[4] = {0};
            // video frame only has max 4 planes
            av_image_fill_plane_sizes(
                sizes, (AVPixelFormat)av_frame->format, av_frame->height, (ptrdiff_t*)av_frame->linesize);
            for (int i = 0; i < 4; i++) {
                if (sizes[i] <= 0) break;
                auto plane = val(typed_memory_view(sizes[i], av_frame->data[i]));
                data.push_back(plane);
            }
        }
        else {
            // audio frame may has >8 planes (extended_data)
            auto planar = av_sample_fmt_is_planar((AVSampleFormat)av_frame->format);
            auto planes = planar ? av_frame->channels : 1;
            for (int i = 0; i < planes; i++) {
                auto size = av_samples_get_buffer_size(
                    &av_frame->linesize[0], av_frame->channels, 
                    av_frame->nb_samples, (AVSampleFormat)av_frame->format, 0);
                auto plane = val(typed_memory_view((size_t)av_frame->linesize[0], av_frame->extended_data[i]));
                CHECK(size < 0, "failed on av_samples_get_buffer_size");
                data.push_back(plane);
            }
        }
        
        return data;
    }

    void dump() {
        auto& time_base = av_frame->time_base;
        printf("Frame (pts:%s pts_time:%s)\n",
            av_ts2str(av_frame->pts), av_ts2timestr(av_frame->pts, &time_base)
        );
    }

    AVFrame* av_ptr() { return av_frame; };
};


class AudioFrameFIFO {
    AVAudioFifo* fifo;
    Frame out_frame;
    int64_t acc_samples = 0;
    AVRational sample_duration; // number of unit per audio sample

public:
    AudioFrameFIFO(AVCodecContext* codec_ctx) {
        fifo = av_audio_fifo_alloc(codec_ctx->sample_fmt, codec_ctx->channels, 1);
        CHECK(fifo != NULL, "Could not allocate FIFO");
        this->sample_duration = {codec_ctx->time_base.den, codec_ctx->time_base.num * codec_ctx->sample_rate};
    }
    ~AudioFrameFIFO() { 
        av_audio_fifo_free(fifo);
    }
    
    int size() const { return av_audio_fifo_size(fifo); }
    
    void push(Frame* in_frame);
    Frame* pop(AVCodecContext* codec_ctx, int request_size);
};



#endif
