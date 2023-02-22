#include "encode.h"


Encoder::Encoder(StreamInfo info) {
    /* codec_ctx.time_base should smaller than 1/sample_rate (maybe change when open...??)
     * Because we need high resolution if using audio fifo to encode smaller sample size frame.
     */ 
    if (info.codec_type == "audio") {
        AVRational max_time_base = {1, info.sample_rate};
        info.time_base = av_cmp_q(max_time_base, info.time_base) < 0 ? max_time_base : info.time_base;
    }

    // use codec id to specified codec name (h264 -> libx264)
    auto codec = avcodec_find_encoder(avcodec_descriptor_get_by_name(info.codec_name.c_str())->id);
    // auto codec = avcodec_find_encoder_by_name(info.codec_name.c_str());
    
    CHECK(codec, "Could not allocate video codec context");
    codec_ctx = avcodec_alloc_context3(codec);
    CHECK(codec_ctx, "Could not allocate video codec context");
    set_avcodec_context_from_streamInfo(info, codec_ctx);
    /* Allow the use of the experimental encoder. */
    codec_ctx->strict_std_compliance = FF_COMPLIANCE_EXPERIMENTAL;
    // todo... remove
    // if (codec->id == AV_CODEC_ID_H264)
    //     av_opt_set(codec_ctx->priv_data, "preset", "slow", 0);
    auto ret = avcodec_open2(codec_ctx, codec, NULL);
    CHECK(ret == 0, "could not open codec");
    // create fifo for audio (after codec_ctx init)
    if (codec_ctx->codec_type == AVMEDIA_TYPE_AUDIO)
        this->fifo = new AudioFrameFIFO(codec_ctx);
}


/**
 * refer: FFmpeg/doc/examples/encode_video.c
 */
vector<Packet*> Encoder::encodeFrame(Frame* frame) {
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

/**
 * Audio frame buffer push to fifo first.
 * refer: FFmpeg/doc/examples/transcode_aac.c
 */
vector<Packet*> Encoder::encode(Frame* frame) {
    // rescale pts
    frame->set_pts(av_rescale_q(frame->pts(), AV_TIME_BASE_Q, codec_ctx->time_base));

    vector<Packet*> outVec;
    /* Make sure that there is one frame worth of samples in the FIFO
     * buffer so that the encoder can do its work.
     * Since the decoder's and the encoder's frame size may differ, we
     * need to FIFO buffer to store as many frames worth of input samples
     * that they make up at least one frame worth of output samples. 
     * */
    // auto skipFIFO = codec_ctx->frame_size == frame->av_ptr()->nb_samples && fifo->size() == 0;
    if (codec_ctx->codec_type == AVMEDIA_TYPE_AUDIO) {
        if (frame != NULL)
            fifo->push(frame);
        /* Read as many samples from the FIFO buffer as required to fill the frame.*/
        while (fifo->size() >= codec_ctx->frame_size || (frame == NULL && fifo->size() > 0)) {
            auto out_frame = fifo->pop(codec_ctx, codec_ctx->frame_size);
            const auto& pkt_vec = this->encodeFrame(frame != NULL ? out_frame : NULL);
            outVec.insert(std::end(outVec), std::begin(pkt_vec), std::end(pkt_vec)); 
        }
    }
    else {
        const auto& pkt_vec = this->encodeFrame(frame);
        outVec.insert(std::end(outVec), std::begin(pkt_vec), std::end(pkt_vec)); 
    }
    // rescale back to base time_base
    for (auto p : outVec)
        av_packet_rescale_ts(p->av_packet(), codec_ctx->time_base, AV_TIME_BASE_Q);

    return outVec;
}

