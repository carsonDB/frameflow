#ifndef ENCODE_H
#define ENCODE_H

#include <string>
#include <vector>

extern "C" {
    #include <libavcodec/avcodec.h>
}


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
    AudioFrameFIFO* fifo = NULL;

public:
    Encoder(StreamInfo info);
    ~Encoder() { 
        if (fifo != NULL)
            delete fifo;
        avcodec_free_context(&codec_ctx); 
    };
    AVRational timeBase() const { return codec_ctx->time_base; }
    DataFormat dataFormat() const { return createDataFormat(codec_ctx); }
    vector<Packet*> encodeFrame(Frame* frame);
    vector<Packet*> encode(Frame* frame);
    vector<Packet*> flush() { return encode(NULL); }
// c++ only
    void setFlags(int flag) { codec_ctx->flags |= flag; }
    const AVCodecContext* av_codecContext_ptr() { return codec_ctx; }
};


#endif