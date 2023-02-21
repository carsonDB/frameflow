#ifndef PACKET_H
#define PACKET_H

#include <cstdio>
#include <emscripten/val.h>
extern "C" {
    #include <libavcodec/avcodec.h>
    #include <libavutil/timestamp.h>
}


/**
 * all int64_t should be converted double (otherwise will become int32)
*/
struct TimeInfo {
    double pts;
    double dts;
    double duration;
};


class Packet {
    AVPacket* packet;
public:
    Packet() { packet = av_packet_alloc(); }
    Packet(int bufSize, int64_t pts) {
        packet = av_packet_alloc();
        av_new_packet(packet, bufSize);
        packet->pts = pts;
    }
    
    ~Packet() { av_packet_free(&packet); };
    
    bool key() const { return packet->flags | AV_PKT_FLAG_KEY; }

    int size() const { return packet->size; }
    
    int stream_index() const { return packet->stream_index; }
    
    // void set_stream_index(int index) { packet->stream_index = index; }
    
    emscripten::val getData() { 
        return emscripten::val(emscripten::typed_memory_view(packet->size, packet->data)); // check length of data
    }

    TimeInfo getTimeInfo() {
        return {.pts = (double)packet->pts, .dts = (double)packet->dts, .duration = (double)packet->duration};
    }

    void dump() {
        auto& time_base = packet->time_base;
        printf("Packet (pts:%s pts_time:%s dts:%s dts_time:%s duration:%s duration_time:%s stream_index:%d)\n",
            av_ts2str(packet->pts), av_ts2timestr(packet->pts, &time_base),
            av_ts2str(packet->dts), av_ts2timestr(packet->dts, &time_base),
            av_ts2str(packet->duration), av_ts2timestr(packet->duration, &time_base),
            packet->stream_index
        );
    }

    AVPacket* av_packet() { return packet; }
};

#endif