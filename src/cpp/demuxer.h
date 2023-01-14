#ifndef DEMUXER_H
#define DEMUXER_H

#include <emscripten/val.h>
#include <string>
#include <vector>
extern "C" {
    #include <libavformat/avformat.h>
}

#include "metadata.h"
#include "utils.h"
#include "stream.h"
#include "packet.h"
using namespace std;


// Custom reading avio https://www.codeproject.com/Tips/489450/Creating-Custom-FFmpeg-IO-Context
static int read_packet(void *opaque, uint8_t *buf, int buf_size)
{
    auto onRead = (emscripten::val *)opaque;
    auto data = emscripten::val(emscripten::typed_memory_view(buf_size, buf));
    buf_size = (*onRead)(data).as<int>();

    if (!buf_size)
        return AVERROR_EOF;

    return buf_size;
}


class DeMuxer {
    AVFormatContext* format_ctx;
    vector<Stream> streams;
    uint8_t* buffer;
    AVIOContext* io_ctx;
    int buf_size = 32*1024;
public:
    DeMuxer(emscripten::val onRead) {
        format_ctx = avformat_alloc_context();
        buffer = (uint8_t*)av_malloc(buf_size);
        io_ctx = avio_alloc_context(buffer, buf_size, 0, &onRead, &read_packet, NULL, NULL);
        format_ctx->pb = io_ctx;
        auto ret = avformat_open_input(&format_ctx, NULL, NULL, NULL);
        CHECK(ret == 0, "Could not open input file.");
        ret = avformat_find_stream_info(format_ctx, NULL);
        CHECK(ret >= 0, "Could not open find stream info.");
        for (int i = 0; i < format_ctx->nb_streams; i++) {
            streams.push_back(Stream(format_ctx, format_ctx->streams[i]));
        }
    }
    ~DeMuxer() { 
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
        avformat_free_context(format_ctx); 
        avformat_close_input(&format_ctx);
        format_ctx->pb != NULL && avio_closep(&format_ctx->pb);
        // if (ctx->out_ctx->av_format_ctx && !(ofmt_ctx->oformat->flags & AVFMT_NOFILE))
        //     avio_closep(&ofmt_ctx->pb);
    }
    const std::vector<Stream>& getStreams() const { return streams; }
    void seek(int64_t timestamp, int stream_index) {
        av_seek_frame(format_ctx, stream_index, timestamp, AVSEEK_FLAG_BACKWARD);
    }
    Packet read() {
        Packet* pkt = new Packet();
        auto ret = av_read_frame(format_ctx, pkt->av_packet());
        return *pkt;
    }
    FormatInfo getMetadata() { return createFormatInfo(format_ctx); }

// only for c++    
    AVFormatContext* av_format_context() { return format_ctx; }
};


#endif