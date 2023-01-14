#ifndef DECODE_H
#define DECODE_H

#include <vector>
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libavformat/avformat.h>
}

#include "utils.h"
#include "frame.h"
#include "packet.h"
#include "demuxer.h"
using namespace std;


class Decoder {
    AVCodecContext* codec_ctx;
public:
    Decoder(DeMuxer& demuxer, int stream_index);
    Decoder(string codec_name);
    ~Decoder() { avcodec_free_context(&codec_ctx); };
    std::vector<Frame> decode(Packet& pkt);
    void flush() {
        auto pkt = Packet();
        pkt.av_packet()->data = NULL;
        pkt.av_packet()->size = 0;
        decode(pkt);
    }
};


#endif