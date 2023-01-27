#ifndef ENCODE_H
#define ENCODE_H

#include <string>
#include <vector>

#include "metadata.h"
#include "packet.h"
#include "frame.h"
#include "utils.h"


class Encoder {
    /**
     * @brief encoder for a video/audio stream.
     * 
     */
    AVCodecContext* codec_ctx;
    Packet packet;
public:
    Encoder(StreamInfo info);
    ~Encoder() { avcodec_free_context(&codec_ctx); };
    void setTimeBase(AVRational time_base) { codec_ctx->time_base = time_base; }
    vector<Packet*> encode(Frame* frame);
    vector<Packet*> flush() { return encode(NULL); }
// c++ only
    void setFlags(int flag) { codec_ctx->flags |= flag; }
    const AVCodecContext* av_codecContext_ptr() { return codec_ctx; }
};


#endif