#include "metadata.h"



StreamInfo createStreamInfo(AVStream* s) {
    StreamInfo info;
    info.index = s->index;
    auto par = s->codecpar;
    info.time_base = s->time_base;
    info.bit_rate = par->bit_rate;
    info.start_time = s->start_time * (double)s->time_base.num / s->time_base.den;
    info.duration = s->duration * (double)s->time_base.num / s->time_base.den;
    info.codec_name = avcodec_find_decoder(par->codec_id)->name;
    if (par->codec_type == AVMEDIA_TYPE_VIDEO) {
        info.codec_type = "video";
        info.width = par->width;
        info.height = par->height;
        info.frame_rate = s->avg_frame_rate;
        info.sample_aspect_ratio = s->sample_aspect_ratio;
        info.format = av_get_pix_fmt_name((AVPixelFormat)par->format);
    }
    else if (par->codec_type == AVMEDIA_TYPE_AUDIO) {
        info.codec_type = "audio";
        info.sample_rate = par->sample_rate;
        info.channels = par->channels;
        info.format = av_get_sample_fmt_name((AVSampleFormat)par->format);
        // get description of channel_layout
        int buf_size = 256;
        char buf[buf_size];
        av_get_channel_layout_string(buf, buf_size, par->channels, par->channel_layout);
        info.channel_layout = buf;
    }

    return info;
}

void set_avcodec_context_from_streamInfo(StreamInfo& info, AVCodecContext* ctx) {
    ctx->bit_rate = info.bit_rate;
    ctx->time_base = info.time_base;
    if (info.codec_type == "video") {
        ctx->codec_type = AVMEDIA_TYPE_VIDEO;
        ctx->width = info.width;
        ctx->height = info.height;
        ctx->framerate = info.frame_rate;
        ctx->sample_aspect_ratio = info.sample_aspect_ratio;
        ctx->pix_fmt = av_get_pix_fmt(info.format.c_str());
    }
    else if (info.codec_type == "audio") {
        ctx->codec_type = AVMEDIA_TYPE_AUDIO;
        ctx->sample_rate = info.sample_rate;
        ctx->channels = info.channels;
        ctx->sample_fmt = av_get_sample_fmt(info.format.c_str());
        ctx->channel_layout = av_get_channel_layout(info.channel_layout.c_str());
    }
}


FormatInfo createFormatInfo(AVFormatContext* p) {
    FormatInfo info;
    info.format_name = p->iformat->name;
    info.bit_rate = p->bit_rate;
    info.duration = p->duration / (double)AV_TIME_BASE;
    for (int i = 0; i < p->nb_streams; i++) {
        auto codec_type = p->streams[i]->codecpar->codec_type;
        if (codec_type == AVMEDIA_TYPE_VIDEO || codec_type == AVMEDIA_TYPE_AUDIO)
            info.streamInfos.push_back(createStreamInfo(p->streams[i]));
    }

    return info;
}
