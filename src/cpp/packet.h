#ifndef PACKET_H
#define PACKET_H

#include <emscripten/val.h>
extern "C" {
    #include <libavcodec/avcodec.h>
}


class Packet {
    AVPacket* packet;
public:
    Packet() { packet = av_packet_alloc(); }
    Packet(AVPacket* pkt) { packet = pkt; }
    Packet(int bufSize, int64_t pts) {
        packet = av_packet_alloc();
        av_new_packet(packet, bufSize);
        packet->pts = pts;
    }
    ~Packet() { av_packet_free(&packet); };
    int size() const { return packet->size; }
    int stream_index() const { return packet->stream_index; }
    void set_stream_index(int index) { packet->stream_index = index; }
    emscripten::val getData() { 
        return emscripten::val(emscripten::typed_memory_view(packet->size, packet->data)); // check length of data
    }
    AVPacket* av_packet() { return packet; }
};

#endif