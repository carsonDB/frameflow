#ifndef ENCODE_H
#define ENCODE_H

#include <string>
#include <vector>
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libavformat/avformat.h>
    #include <libavutil/opt.h>
}

#include "packet.h"
#include "stream.h"
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
    vector<Packet> encode(Frame& frame);
    void flush() { 
        auto f = Frame(); 
        encode(f);
    }
// c++ only
    const AVCodecContext* av_codecContext_ptr() { return codec_ctx; }
};


#endif