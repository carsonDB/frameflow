#include "encode.h"


Encoder::Encoder(StreamInfo info) {
    auto codec = avcodec_find_encoder_by_name(info.codec_name.c_str());
    CHECK(codec, "Could not allocate video codec context");
    codec_ctx = avcodec_alloc_context3(codec);
    CHECK(codec_ctx, "Could not allocate video codec context");
    set_avcodec_context_from_streamInfo(info, codec_ctx);
    // todo... remove
    // if (codec->id == AV_CODEC_ID_H264)
    //     av_opt_set(codec_ctx->priv_data, "preset", "slow", 0);
    auto ret = avcodec_open2(codec_ctx, codec, NULL);
    CHECK(ret == 0, "could not open codec");
}


/**
 * refer: doc/examples/encode_video.c
 */
vector<Packet*> Encoder::encode(Frame* frame) {
    auto avframe = frame == NULL ? NULL : frame->av_ptr();
    auto ret = avcodec_send_frame(codec_ctx, avframe);
    CHECK(ret >= 0, "Error sending a frame for encoding");
    vector<Packet*> packets;
    while (1) {
        auto pkt = new Packet();
        ret = avcodec_receive_packet(codec_ctx, pkt->av_packet());
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            delete pkt;
            break;
        }
        CHECK(ret >= 0, "Error during encoding");
        packets.push_back(pkt);
    }
    return packets;
}

