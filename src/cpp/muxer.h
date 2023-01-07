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
using namespace std;


struct InferredFormatInfo {
    string format;
    string videoCodec;
    string audioCodec;
};


// Custom reading avio https://www.codeproject.com/Tips/489450/Creating-Custom-FFmpeg-IO-Context
// Custom writing avio https://ffmpeg.org/pipermail/ffmpeg-devel/2014-November/165014.html
int writeFn(void* opaque, uint8_t* buf, int buf_size) {
    auto onWrite = (emscripten::val*)opaque;
    auto data = emscripten::val(typed_memory_view(buf_size, buf));
    (*onWrite)(data);
    return buf_size;
    
}


class Muxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    std::vector<Stream> streams;
    uint8_t* buffer;
    int buf_size = 32*1024;

public:
    Muxer(string format, emscripten::val onWrite) {
        // create buffer for writing
        buffer = (uint8_t*)av_malloc(buf_size);
        io_ctx = avio_alloc_context(buffer, buf_size, 1, &onWrite, NULL, writeFn, NULL);
        avformat_alloc_output_context2(&format_ctx, NULL, format.c_str(), NULL);
        CHECK(format_ctx, "Could not create output format context");
        format_ctx->pb = io_ctx;
        format_ctx->flags = AVFMT_FLAG_CUSTOM_IO;
    };
    ~Muxer() {
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
        avformat_free_context(format_ctx);
        format_ctx->pb != NULL && avio_closep(&format_ctx->pb);
    }

    static InferredFormatInfo inferFormatInfo(string format_name, string filename) {
        auto format = av_guess_format(format_name.c_str(), filename.c_str(), NULL);
        return { 
            format->name, 
            avcodec_find_encoder(format->video_codec)->name, 
            avcodec_find_encoder(format->audio_codec)->name };
    }
    
    void newStream(Encoder& encoder) {
        /* Some formats want stream headers to be separate. */
        if (format_ctx->oformat->flags & AVFMT_GLOBALHEADER)
            encoder.setFlags(AV_CODEC_FLAG_GLOBAL_HEADER);

        streams.push_back(Stream(format_ctx, encoder));
    }

    // void addStream(Stream& stream) {
    //     streams.push_back(Stream(format_ctx, stream)); 
    // }

    void openIO() { avio_open(&format_ctx->pb, NULL, AVIO_FLAG_WRITE); }
    void writeHeader() { avformat_write_header(format_ctx, NULL); }
    void writeTrailer() { av_write_trailer(format_ctx); }
    void writeFrame(Packet& packet) {
        auto av_pkt = packet.av_packet();
        /* rescale output packet timestamp values from codec to stream timebase */
        // av_packet_rescale_ts(av_pkt, c->time_base, st->time_base);
        // av_pkt->stream_index = st->index;
        // todo...
        int ret = av_interleaved_write_frame(format_ctx, av_pkt);
        CHECK(ret >= 0, "interleave write frame error");

    }
};


#endif