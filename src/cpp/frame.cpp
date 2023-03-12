#include "frame.h"


 
Frame::Frame(FrameInfo info, double pts, std::string name) {
    this->_name = name; 
    av_frame = av_frame_alloc();
    auto isVideo = info.height > 0 && info.width > 0;
    if (isVideo) {
        av_frame->format = av_get_pix_fmt(info.format.c_str());
        av_frame->height = info.height;
        av_frame->width = info.width;
        auto ret = av_frame_get_buffer(av_frame, 0);
        CHECK(ret >= 0, "Could not allocate output frame samples (error '%s')");
    }
    else {
        // if channel_layout given, infer default channel_layout given channels.
        auto channel_layout = info.channel_layout != "" ?
            av_get_channel_layout(info.channel_layout.c_str()) :
            av_get_default_channel_layout(info.channels);

        this->audio_reinit(
            av_get_sample_fmt(info.format.c_str()), 
            info.sample_rate,
            channel_layout,
            info.nb_samples
        );
    }
    av_frame->pts = (int64_t)pts;
}


FrameInfo Frame::getFrameInfo() {
    auto isVideo = av_frame->height > 0 && av_frame->width > 0;
    auto format = isVideo ? 
        av_get_pix_fmt_name((AVPixelFormat)av_frame->format) : 
        av_get_sample_fmt_name((AVSampleFormat)av_frame->format);

    return {
        .format = format,
        .height = av_frame->height,
        .width = av_frame->width,
        .sample_rate = av_frame->sample_rate,
        .channels = av_frame->channels,
        .channel_layout = get_channel_layout_name(av_frame->channels, av_frame->channel_layout),
        .nb_samples = av_frame->nb_samples
    };
}

void Frame::audio_reinit(AVSampleFormat sample_fmt, int sample_rate, uint64_t channel_layout, int nb_samples) {
    av_frame_unref(av_frame);
    av_frame->channel_layout = channel_layout;
    
    av_frame->format         = sample_fmt;
    av_frame->sample_rate    = sample_rate;
    av_frame->nb_samples = nb_samples;
    auto ret = av_frame_get_buffer(av_frame, 0);
    CHECK(ret >= 0, "Could not allocate output frame samples");
}


void AudioFrameFIFO::push(Frame* in_frame) {
    auto num_sample = in_frame->av_ptr()->nb_samples;
    auto fifo_size = this->size() + num_sample;
    if (fifo_size <= 0) return;
    /* Make the FIFO as large as it needs to be to hold both, the old and the new samples. */
    auto ret = av_audio_fifo_realloc(fifo, fifo_size);
    CHECK(ret >= 0, "Could not reallocate FIFO");
    /* Store the new samples in the FIFO buffer. */
    auto num_writes = av_audio_fifo_write(fifo, (void **)in_frame->av_ptr()->data, num_sample);
    CHECK(num_writes == num_sample, "Could not write data to FIFO\n");
}

Frame* AudioFrameFIFO::pop(AVCodecContext* codec_ctx, int request_size) {
    const int frame_size = FFMIN(this->size(), request_size);
    // release previous buffer and create new buffer for current frame_size
    out_frame.audio_reinit(codec_ctx->sample_fmt, codec_ctx->sample_rate, codec_ctx->channel_layout, frame_size);

    auto write_size = av_audio_fifo_read(fifo, (void **)out_frame.av_ptr()->data, frame_size);
    CHECK(frame_size == write_size, "Could not read data from FIFO");
    
    auto pts = this->acc_samples * (double)this->sample_duration.num / this->sample_duration.den;
    out_frame.set_pts((int64_t)std::round(pts));
    this->acc_samples += out_frame.av_ptr()->nb_samples;

    return &out_frame;
}