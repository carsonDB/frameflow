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
    std::string _name;
    AVRational from_time_base;
public:
    Decoder(Demuxer& demuxer, int stream_index, std::string name);
    Decoder(string codec_name, std::string name);
    ~Decoder() { avcodec_free_context(&codec_ctx); };
    std::string name() const { return _name; }
    std::vector<Frame*> decode(Packet* pkt);
    std::vector<Frame*> flush() {
        auto pkt = new Packet();
        pkt->av_packet()->data = NULL;
        pkt->av_packet()->size = 0;
        auto frames = decode(pkt);
        delete pkt;
        
        return frames;
    }
};


#endif