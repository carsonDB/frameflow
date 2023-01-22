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


// Custom writing avio https://ffmpeg.org/pipermail/ffmpeg-devel/2014-November/165014.html
static int write_packet(void* opaque, uint8_t* buf, int buf_size) {
    auto writer = *reinterpret_cast<val*>(opaque);
    auto data = val(typed_memory_view(buf_size, buf));
    writer.call<void>("write", data);
    return buf_size;
    
}

static int64_t seek_func_tmp(void* opaque, int64_t pos, int whence) {
    CHECK(false, "seek when writting: not implemeneted");
    return 0;
}


class Muxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    std::vector<Stream*> streams;
    int buf_size = 32*1024;
    val writer;

public:
    Muxer(string format, val _writer) {
        writer = std::move(_writer); // writer will be destroyed at end of this function 
        auto writerPtr = reinterpret_cast<void*>(&writer);
        // create buffer for writing
        auto buffer = (uint8_t*)av_malloc(buf_size);
        io_ctx = avio_alloc_context(buffer, buf_size, 1, writerPtr, NULL, write_packet, seek_func_tmp);
        avformat_alloc_output_context2(&format_ctx, NULL, format.c_str(), NULL);
        CHECK(format_ctx != NULL, "Could not create output format context");
        format_ctx->pb = io_ctx;
        format_ctx->flags |= AVFMT_FLAG_CUSTOM_IO;
    };
    ~Muxer() {
        for (const auto& s : streams)
            delete s;
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
        avformat_free_context(format_ctx);
        format_ctx->pb != NULL && avio_closep(&format_ctx->pb);
    }

    static InferredFormatInfo inferFormatInfo(string format_name, string filename) {
        auto format = av_guess_format(format_name.c_str(), filename.c_str(), NULL);
        auto video_codec = avcodec_find_encoder(format->video_codec);
        auto audio_codec = avcodec_find_encoder(format->audio_codec);
        InferredStreamInfo videoInfo = {
            .codec_name = video_codec->name,
            .format = av_get_pix_fmt_name(*video_codec->pix_fmts),
        };
        InferredStreamInfo audioInfo = {
            .codec_name = audio_codec->name,
            .format = av_get_sample_fmt_name(*audio_codec->sample_fmts)
        };

        return { 
            .format = format->name, 
            .video = videoInfo,
            .audio = audioInfo };
    }

    void dump() {
        av_dump_format(format_ctx, 0, "", 1);
    }
    
    void newStream(Encoder* encoder) {
        /* Some formats want stream headers to be separate. */
        if (format_ctx->oformat->flags & AVFMT_GLOBALHEADER)
            encoder->setFlags(AV_CODEC_FLAG_GLOBAL_HEADER);

        streams.push_back(new Stream(format_ctx, encoder));
    }

    void writeHeader() {        
        auto ret = avformat_write_header(format_ctx, NULL);
        CHECK(ret >= 0, "Error occurred when opening output file");
    }
    void writeTrailer() { av_write_trailer(format_ctx); }
    void writeFrame(Packet* packet) {
        auto av_pkt = packet->av_packet();
        auto out_av_stream = streams[av_pkt->stream_index]->av_stream_ptr();
        /* rescale output packet timestamp values from codec to stream timebase */
        // av_packet_rescale_ts(av_pkt, av_pkt->time_base, out_av_stream->time_base);
        // todo...
        int ret = av_interleaved_write_frame(format_ctx, av_pkt);
        CHECK(ret >= 0, "interleave write frame error");

    }
};


#endif