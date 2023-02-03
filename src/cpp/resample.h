
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libswresample/swresample.h>
}

#include "frame.h"
#include "utils.h"


class Resampler {
    SwrContext* resample_ctx;
    Frame out_frame;

public:
    Resampler(AVCodecContext* from_codec_ctx, AVCodecContext* to_codec_ctx) {

        resample_ctx = swr_alloc_set_opts(NULL,
            av_get_default_channel_layout(to_codec_ctx->channels),
            to_codec_ctx->sample_fmt,
            to_codec_ctx->sample_rate,
            av_get_default_channel_layout(from_codec_ctx->channels),
            from_codec_ctx->sample_fmt,
            from_codec_ctx->sample_rate,
            0, NULL);

        CHECK(resample_ctx != NULL, "Could not allocate resample context");
         
        /*
        * Perform a sanity check so that the number of converted samples is
        * not greater than the number of samples to be converted.
        * If the sample rates differ, this case has to be handled differently
        */
        CHECK(to_codec_ctx->sample_rate == from_codec_ctx->sample_rate, "sample rate differ");

        /* Open the resampler with the specified parameters. */
        auto ret = swr_init(resample_ctx);
        CHECK(ret >= 0, "Could not open resample context");
    }

    ~Resampler() { swr_free(&resample_ctx); }

    /* Convert the samples using the resampler. */
    Frame* convert(Frame* frame) {
        auto av_frame = frame->av_ptr();
        // out_frame.audio_reinit();
        // auto ret = swr_convert(
        //     resample_ctx, out_frame->data, out_frame->nb_samples, av_frame->extended_data, av_frame->nb_samples);
        // CHECK(ret >= 0, "Could not convert input samples");

        return &out_frame;
    }
};