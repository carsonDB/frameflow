/**
 * template file, ${...} will be replaced.
 */
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

#include "utils.h"
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


${params_struct_define}


${params_getter_macro}

${params_setter_macro}



EMSCRIPTEN_BINDINGS(FFMPEG_WASM) {
    ${params_embind}
}


#endif