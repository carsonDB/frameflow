#ifndef DEMUXER_H
#define DEMUXER_H

#include <cstdio>
#include <string>
#include <emscripten/val.h>
extern "C" {
    #include <libavformat/avformat.h>
}

#include "metadata.h"
#include "utils.h"
#include "stream.h"
#include "packet.h"
using namespace emscripten;


// Custom reading avio https://www.codeproject.com/Tips/489450/Creating-Custom-FFmpeg-IO-Context
static int read_packet(void *opaque, uint8_t *buf, int buf_size)
{
    auto reader = *reinterpret_cast<val*>(opaque);
    auto data = val(typed_memory_view(buf_size, buf));
    auto read_size = reader.call<val>("read", data).await().as<int>();

    if (!read_size)
        return AVERROR_EOF;

    return read_size;
}

/**
 * Warning: any function involve this call, will give promise (async).
 * Warning: enable asyncify will disable bigInt, so be careful that binding int64_t not allowed 
 */
static int64_t seek_func(void* opaque, int64_t pos, int whence) {
    auto reader = *reinterpret_cast<val*>(opaque);
    auto size = reader["size"].as<int>();
    switch (whence) {
        case AVSEEK_SIZE:
            return size;
        case SEEK_SET:
            if (pos >= size) return AVERROR_EOF;
            reader.call<val>("seek", (int)pos).await(); break;
        case SEEK_CUR:
            pos += reader["offset"].as<int>();
            if (pos >= size) return AVERROR_EOF;
            reader.call<val>("seek", (int)pos).await(); break;
        case SEEK_END:
            if (pos >= size) return AVERROR_EOF;
            pos = size - pos;
            reader.call<val>("seek", (int)pos).await(); break;
        default:
            CHECK(false, "cannot process seek_func");
    }
    
    return pos;
}


class Demuxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    int buf_size = 32*1024;
    std::string _url;
    val reader;
public:
    Demuxer() {
        format_ctx = avformat_alloc_context();
    }
    /* async */
    void build(val _reader) {
        reader = std::move(_reader); // reader will be destroyed at end of this function 
        _url = reader["url"].as<std::string>();
        auto buffer = (uint8_t*)av_malloc(buf_size);
        auto readerPtr = reinterpret_cast<void*>(&reader);
        if (reader["size"].as<int>() <= 0)
            io_ctx = avio_alloc_context(buffer, buf_size, 0, readerPtr, &read_packet, NULL, NULL);
        else
            io_ctx = avio_alloc_context(buffer, buf_size, 0, readerPtr, &read_packet, NULL, &seek_func);
        format_ctx->pb = io_ctx;
        // open and get metadata
        auto ret = avformat_open_input(&format_ctx, _url.c_str(), NULL, NULL);
        CHECK(ret == 0, "Could not open input file.");
        ret = avformat_find_stream_info(format_ctx, NULL);
        CHECK(ret >= 0, "Could not open find stream info.");
    }
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
    Packet* read() {
        auto pkt = new Packet();
        auto ret = av_read_frame(format_ctx, pkt->av_packet());
        return pkt;
    }

    void dump() {
        av_dump_format(format_ctx, 0, _url.c_str(), 0);
    }

    FormatInfo getMetadata() { 
        return createFormatInfo(format_ctx); 
    }

// only for c++    
    AVFormatContext* av_format_context() { return format_ctx; }
    AVStream* av_stream(int i) { 
        CHECK(i >= 0 && i < format_ctx->nb_streams, "get av stream i error");
        return format_ctx->streams[i]; 
    }
};


#endif