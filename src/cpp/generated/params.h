#ifndef PARAMS_TEMPLATE
#define PARAMS_TEMPLATE

#include <string>
#include <emscripten/bind.h>
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libavutil/frame.h>
    #include <libavformat/avformat.h>
    #include <libavutil/pixdesc.h>
}

#include "cpp/utils.h"
using namespace emscripten;


template<typename T>
inline std::string get_pix_fmt_template(T* ctx) {
    return av_get_pix_fmt_name(ctx->pix_fmt);
}

template<typename T>
inline void set_pix_fmt_template(T* ctx, std::string& format) {
    auto fmt = av_get_pix_fmt(format.c_str());
    CHECK(fmt != AV_PIX_FMT_NONE, "pix_fmt is not valid.");
	ctx->pix_fmt = fmt;
}

template<typename T>
inline std::string get_sample_fmt_template(T* ctx) {
    return av_get_sample_fmt_name(ctx->sample_fmt);
}

template<typename T>
inline void set_sample_fmt_template(T* ctx, std::string& format) {
    auto fmt = av_get_sample_fmt(format.c_str());
    CHECK(fmt != AV_SAMPLE_FMT_NONE, "sample_fmt is not valid.");
	ctx->sample_fmt = fmt;
}

inline std::string get_AVFrameFormat(AVFrame* ctx) {
    return std::to_string(ctx->format);
}

inline void set_AVFrameFormat(AVFrame *ctx, std::string &format) {
        auto pix_fmt = av_get_pix_fmt(format.c_str());
        if (pix_fmt != AV_PIX_FMT_NONE) {
            ctx->format = pix_fmt;
            return;
        }
        auto sample_fmt = av_get_sample_fmt(format.c_str());
        if (sample_fmt != AV_SAMPLE_FMT_NONE) {
            ctx->format = sample_fmt;
            return;
        }
        CHECK(false, "format is not match either video (pix_fmt) or autio (sample_fmt).");
}

template<typename T>
inline int32_t get_codec_id_template(T* codecpar) {
    return codecpar->codec_id;
}

template<typename T>
inline void set_codec_id_template(T* codecpar, int32_t codec_id) {
    codecpar->codec_id = (AVCodecID)codec_id;
}


struct EncodeParams { 
    int64_t bit_rate;
std::string pix_fmt;
std::string sample_fmt;
int channels;
int sample_rate;
int width;
int height;
AVRational framerate;
AVRational time_base;
int keyint_min;
int gop_size;
int max_b_frames;

    void fill_context(AVCodecContext* ctx) {
        ctx->bit_rate = bit_rate;
set_pix_fmt_template(ctx, pix_fmt);
set_sample_fmt_template(ctx, sample_fmt);
ctx->channels = channels;
ctx->sample_rate = sample_rate;
ctx->width = width;
ctx->height = height;
ctx->framerate = framerate;
ctx->time_base = time_base;
ctx->keyint_min = keyint_min;
ctx->gop_size = gop_size;
ctx->max_b_frames = max_b_frames;

    };
};
struct FrameParams { 
    int64_t pts;
std::string format;
int width;
int height;

    void fill_context(AVFrame* ctx) {
        ctx->pts = pts;
set_AVFrameFormat(ctx, format);
ctx->width = width;
ctx->height = height;

    };
};
struct StreamParams { 
    AVRational time_base;

    void fill_context(AVStream* ctx) {
        ctx->time_base = time_base;

    };
};
struct CodecParams { 
    int32_t codec_id;
int64_t bit_rate;
int sample_rate;
int channels;

    void fill_context(AVCodecParameters* ctx) {
        set_codec_id_template(ctx, codec_id);
ctx->bit_rate = bit_rate;
ctx->sample_rate = sample_rate;
ctx->channels = channels;

    };
};
struct PacketParams { 
    int stream_index;

    void fill_context(AVPacket* ctx) {
        ctx->stream_index = stream_index;

    };
};




#define EncodeParams_GETTER(contextName)  \
	 int64_t get_bit_rate() { return contextName->bit_rate; } \
	 std::string get_pix_fmt() { return get_pix_fmt_template(contextName); } \
	 std::string get_sample_fmt() { return get_sample_fmt_template(contextName); } \
	 int get_channels() { return contextName->channels; } \
	 int get_sample_rate() { return contextName->sample_rate; } \
	 int get_width() { return contextName->width; } \
	 int get_height() { return contextName->height; } \
	 AVRational get_framerate() { return contextName->framerate; } \
	 AVRational get_time_base() { return contextName->time_base; } \
	 int get_keyint_min() { return contextName->keyint_min; } \
	 int get_gop_size() { return contextName->gop_size; } \
	 int get_max_b_frames() { return contextName->max_b_frames; }

#define FrameParams_GETTER(contextName)  \
	 int64_t get_pts() { return contextName->pts; } \
	 std::string get_format() { return get_AVFrameFormat(contextName); } \
	 int get_width() { return contextName->width; } \
	 int get_height() { return contextName->height; }

#define StreamParams_GETTER(contextName)  \
	 AVRational get_time_base() { return contextName->time_base; }

#define CodecParams_GETTER(contextName)  \
	 int32_t get_codec_id() { return get_codec_id_template(contextName); } \
	 int64_t get_bit_rate() { return contextName->bit_rate; } \
	 int get_sample_rate() { return contextName->sample_rate; } \
	 int get_channels() { return contextName->channels; }

#define PacketParams_GETTER(contextName)  \
	 int get_stream_index() { return contextName->stream_index; }



#define EncodeParams_SETTER(contextName)  \
	 void set_bit_rate(int64_t& bit_rate) { contextName->bit_rate = bit_rate; } \
	 void set_pix_fmt(std::string& pix_fmt) { set_pix_fmt_template(contextName, pix_fmt); } \
	 void set_sample_fmt(std::string& sample_fmt) { set_sample_fmt_template(contextName, sample_fmt); } \
	 void set_channels(int& channels) { contextName->channels = channels; } \
	 void set_sample_rate(int& sample_rate) { contextName->sample_rate = sample_rate; } \
	 void set_width(int& width) { contextName->width = width; } \
	 void set_height(int& height) { contextName->height = height; } \
	 void set_framerate(AVRational& framerate) { contextName->framerate = framerate; } \
	 void set_time_base(AVRational& time_base) { contextName->time_base = time_base; } \
	 void set_keyint_min(int& keyint_min) { contextName->keyint_min = keyint_min; } \
	 void set_gop_size(int& gop_size) { contextName->gop_size = gop_size; } \
	 void set_max_b_frames(int& max_b_frames) { contextName->max_b_frames = max_b_frames; }

#define FrameParams_SETTER(contextName)  \
	 void set_pts(int64_t& pts) { contextName->pts = pts; } \
	 void set_format(std::string& format) { set_AVFrameFormat(contextName, format); } \
	 void set_width(int& width) { contextName->width = width; } \
	 void set_height(int& height) { contextName->height = height; }

#define StreamParams_SETTER(contextName)  \
	 void set_time_base(AVRational& time_base) { contextName->time_base = time_base; }

#define CodecParams_SETTER(contextName)  \
	 void set_codec_id(int32_t& codec_id) { set_codec_id_template(contextName, codec_id); } \
	 void set_bit_rate(int64_t& bit_rate) { contextName->bit_rate = bit_rate; } \
	 void set_sample_rate(int& sample_rate) { contextName->sample_rate = sample_rate; } \
	 void set_channels(int& channels) { contextName->channels = channels; }

#define PacketParams_SETTER(contextName)  \
	 void set_stream_index(int& stream_index) { contextName->stream_index = stream_index; }




EMSCRIPTEN_BINDINGS(FFMPEG_WASM) {
    value_object<EncodeParams>("EncodeParams")
	.field("bit_rate", &EncodeParams::bit_rate)
	.field("pix_fmt", &EncodeParams::pix_fmt)
	.field("sample_fmt", &EncodeParams::sample_fmt)
	.field("channels", &EncodeParams::channels)
	.field("sample_rate", &EncodeParams::sample_rate)
	.field("width", &EncodeParams::width)
	.field("height", &EncodeParams::height)
	.field("framerate", &EncodeParams::framerate)
	.field("time_base", &EncodeParams::time_base)
	.field("keyint_min", &EncodeParams::keyint_min)
	.field("gop_size", &EncodeParams::gop_size)
	.field("max_b_frames", &EncodeParams::max_b_frames)
;value_object<FrameParams>("FrameParams")
	.field("pts", &FrameParams::pts)
	.field("format", &FrameParams::format)
	.field("width", &FrameParams::width)
	.field("height", &FrameParams::height)
;value_object<StreamParams>("StreamParams")
	.field("time_base", &StreamParams::time_base)
;value_object<CodecParams>("CodecParams")
	.field("codec_id", &CodecParams::codec_id)
	.field("bit_rate", &CodecParams::bit_rate)
	.field("sample_rate", &CodecParams::sample_rate)
	.field("channels", &CodecParams::channels)
;value_object<PacketParams>("PacketParams")
	.field("stream_index", &PacketParams::stream_index)
;
}


#endif