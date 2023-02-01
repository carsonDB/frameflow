#ifndef DEMUXER_H
#define DEMUXER_H

#include <cstdio>
#include <string>
#include <vector>
#include <emscripten/val.h>
extern "C" {
    #include <libavformat/avformat.h>
}

#include "metadata.h"
#include "utils.h"
#include "stream.h"
#include "packet.h"
using namespace emscripten;


class Demuxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    std::vector<double> currentStreamsPTS; 
    int buf_size = 32*1024;
    std::string _url;
    val reader;
public:
    Demuxer() {
        format_ctx = avformat_alloc_context();
    }
    /* async */
    void build(val _reader);

    ~Demuxer() { 
        avformat_close_input(&format_ctx);
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
    }
    
    /* async */
    void seek(int64_t timestamp, int stream_index) {
        av_seek_frame(format_ctx, stream_index, timestamp, AVSEEK_FLAG_BACKWARD);
    }
    
    /* async */
    Packet* read();

    void dump() {
        av_dump_format(format_ctx, 0, _url.c_str(), 0);
    }

    AVRational getTimeBase(int stream_index) {
        return format_ctx->streams[stream_index]->time_base;
    }

    FormatInfo getMetadata() { 
        return createFormatInfo(format_ctx); 
    }

    /* timestamp of current first packet of the stream, which will be parsed next */
    double currentTime(int stream_index) {
        CHECK(stream_index >= 0 && stream_index < currentStreamsPTS.size(), "stream_index not in valid currentStreamsPTS");
        return currentStreamsPTS[stream_index];
    }

// only for c++    
    AVFormatContext* av_format_context() { return format_ctx; }
    AVStream* av_stream(int i) { 
        CHECK(i >= 0 && i < format_ctx->nb_streams, "get av stream i error");
        return format_ctx->streams[i]; 
    }
};


#endif