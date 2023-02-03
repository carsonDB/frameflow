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
}

#include "utils.h"
using namespace emscripten;


class Frame {
    AVFrame* av_frame;
    int align = 32;
    std::string _name; // streamId
public:
    Frame() {
        av_frame = av_frame_alloc(); 
    }
    Frame(std::string name) { 
        this->_name = name;
        av_frame = av_frame_alloc(); 
    }
    ~Frame() { av_frame_free(&av_frame); }

    std::string name() const { return _name; }
    int64_t pts() const { return av_frame->pts; }
    void set_pts(int64_t pts) { av_frame->pts = pts; }

    void audio_reinit(AVSampleFormat sample_fmt, int sample_rate, uint64_t channel_layout, int nb_samples);
    
    emscripten::val getData(int i) {
        CHECK(i >= 0 && i < 8, "Frame::getData: plane_index not valid, [0, 8]");
        return emscripten::val(emscripten::typed_memory_view(
            av_frame->linesize[i] * av_frame->height, av_frame->data[i]));
        // todo...get whole buffer
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
