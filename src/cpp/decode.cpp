#include "decode.h"


Decoder::Decoder(Demuxer& demuxer, int stream_index, string name) {
    this->_name = name;
    auto stream = demuxer.av_stream(stream_index);
    auto codecpar = stream->codecpar;
    auto codec = avcodec_find_decoder(codecpar->codec_id);
    CHECK(codec != NULL, "Could not find input codec");
    codec_ctx = avcodec_alloc_context3(codec);
    avcodec_parameters_to_context(codec_ctx, codecpar);
    avcodec_open2(codec_ctx, codec, NULL);
}

Decoder::Decoder(string params, string name) {
    _name = name;
    AVDictionary* dict;
    av_dict_parse_string(&dict, params.c_str(), "=", ":", 0);
    auto codec = avcodec_find_decoder_by_name(av_dict_get(dict, "codec_name", NULL, 0)->value);
    CHECK(codec != NULL, "Could not find input codec");
    codec_ctx = avcodec_alloc_context3(codec);
    avcodec_open2(codec_ctx, codec, &dict);
    av_dict_free(&dict);
}

std::vector<Frame*> Decoder::decode(Packet* pkt) {
    // rescale packet from demuxer stream to encoder
    av_packet_rescale_ts(pkt->av_packet(), this->stream_time_base, codec_ctx->time_base);
    int ret = avcodec_send_packet(codec_ctx, pkt->av_packet());
    // get all the available frames from the decoder
    std::vector<Frame*> frames;

    while (1) {
        auto frame = new Frame(this->name());
        ret = avcodec_receive_frame(codec_ctx, frame->av_ptr());
        if (ret < 0) {
            // those two return values are special and mean there is no output
            // frame available, but there were no errors during decoding
            delete frame;
            if (ret == AVERROR_EOF || ret == AVERROR(EAGAIN))
                break;
            CHECK(false, "decode frame failed");
        }
        frame->av_ptr()->pts = frame->av_ptr()->best_effort_timestamp;
        frames.push_back(frame);
    }
    return frames;
}

