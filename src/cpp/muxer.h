#ifndef MUXER_H
#define MUXER_H

#include <emscripten/val.h>
#include <string>
#include <vector>
#include "stream.h"
#include "packet.h"

extern "C" {
    #include <libavformat/avformat.h>
    #include <libavformat/avio.h>
}

#include "encode.h"
#include "utils.h"
using namespace emscripten;


struct InferredStreamInfo {
    string codec_name;
    // AVRational time_base;
    string format;
};

struct InferredFormatInfo {
    string format;
    InferredStreamInfo video;
    InferredStreamInfo audio;
};


class Muxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    std::vector<Stream*> streams;
    std::vector<AVRational> from_time_bases;
    int buf_size = 32*1024;
    val writer;

public:
    Muxer(string format, val _writer);
    ~Muxer() {
        for (const auto& s : streams)
            delete s;
        avformat_free_context(format_ctx);
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
    }

    static InferredFormatInfo inferFormatInfo(string format_name, string filename);

    void dump() {
        av_dump_format(format_ctx, 0, "", 1);
    }
    
    void newStream(Encoder* encoder) {
        /* Some formats want stream headers to be separate. */
        if (format_ctx->oformat->flags & AVFMT_GLOBALHEADER)
            encoder->setFlags(AV_CODEC_FLAG_GLOBAL_HEADER);

        streams.push_back(new Stream(format_ctx, encoder));
        from_time_bases.push_back(encoder->av_codecContext_ptr()->time_base);     
    }

    void writeHeader() {
        auto ret = avformat_write_header(format_ctx, NULL);
        CHECK(ret >= 0, "Error occurred when opening output file");
    }
    void writeTrailer() { 
        auto ret = av_write_trailer(format_ctx); 
        CHECK(ret == 0, "Error when writing trailer");
    }
    void writeFrame(Packet* packet, int stream_i);
};


#endif