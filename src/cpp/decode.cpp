#include "decode.h"


Decoder::Decoder(Demuxer& demuxer, int stream_index) {
    auto stream = demuxer.av_stream(stream_index);
    auto codecpar = stream->codecpar;
    auto codec = avcodec_find_decoder(codecpar->codec_id);
    CHECK(codec != NULL, "Could not find input codec");
    codec_ctx = avcodec_alloc_context3(codec);
    avcodec_parameters_to_context(codec_ctx, codecpar);
    avcodec_open2(codec_ctx, codec, NULL);
}

Decoder::Decoder(string params) {
    AVDictionary* dict;
    av_dict_parse_string(&dict, params.c_str(), "=", ":", 0);
    auto codec = avcodec_find_decoder_by_name(av_dict_get(dict, "codec_name", NULL, 0)->value);
    CHECK(codec != NULL, "Could not find input codec");
    codec_ctx = avcodec_alloc_context3(codec);
    avcodec_open2(codec_ctx, codec, &dict);
    av_dict_free(&dict);
}

std::vector<Frame> Decoder::decode(Packet& pkt) {
    int ret = avcodec_send_packet(codec_ctx, pkt.av_packet());
    // get all the available frames from the decoder
    AVFrame* frame = NULL;
    std::vector<Frame> frames = *(new std::vector<Frame>);

    while (ret >= 0) {
        ret = avcodec_receive_frame(codec_ctx, frame);
        if (ret < 0) {
            // those two return values are special and mean there is no output
            // frame available, but there were no errors during decoding
            if (ret == AVERROR_EOF || ret == AVERROR(EAGAIN))
                continue;
        }
        frames.push_back(*(new Frame(frame)));
    }
    // delete packet
    delete &pkt;
    return frames;
}

