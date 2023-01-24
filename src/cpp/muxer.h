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

static int64_t seek_for_write(void* opaque, int64_t pos, int whence) {
    auto writer = *reinterpret_cast<val*>(opaque);

    switch (whence) {
        case SEEK_SET:
            writer.call<val>("seek", (int)pos); break;
        case SEEK_CUR:
            pos += writer["offset"].as<int>();
            writer.call<val>("seek", (int)pos); break;
        default:
            CHECK(false, "cannot process seek_for_read");
    }

    return pos;
}


class Muxer {
    AVFormatContext* format_ctx;
    AVIOContext* io_ctx;
    std::vector<Stream*> streams;
    std::vector<AVRational> encoder_time_bases;
    int buf_size = 32*1024;
    val writer;

public:
    Muxer(string format, val _writer) {
        writer = std::move(_writer); // writer will be destroyed at end of this function 
        auto writerPtr = reinterpret_cast<void*>(&writer);
        // create buffer for writing
        auto buffer = (uint8_t*)av_malloc(buf_size);
        io_ctx = avio_alloc_context(buffer, buf_size, 1, writerPtr, NULL, write_packet, seek_for_write);
        avformat_alloc_output_context2(&format_ctx, NULL, format.c_str(), NULL);
        CHECK(format_ctx != NULL, "Could not create output format context");
        format_ctx->pb = io_ctx;
        format_ctx->flags |= AVFMT_FLAG_CUSTOM_IO;
    };
    ~Muxer() {
        for (const auto& s : streams)
            delete s;
        avformat_free_context(format_ctx);
        if (io_ctx)
            av_freep(&io_ctx->buffer);
        avio_context_free(&io_ctx);
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
        encoder_time_bases.push_back(encoder->av_codecContext_ptr()->time_base);     
    }

    void writeHeader() {
        auto ret = avformat_write_header(format_ctx, NULL);
        CHECK(ret >= 0, "Error occurred when opening output file");
    }
    void writeTrailer() { 
        auto ret = av_write_trailer(format_ctx); 
        CHECK(ret == 0, "Error when writing trailer");
    }
    void writeFrame(Packet* packet) {
        auto av_pkt = packet->av_packet();
        auto stream_i = av_pkt->stream_index;
        CHECK(stream_i >= 0 && stream_i < streams.size(), "stream_index of packet not in valid streams");
        auto av_stream = streams[stream_i]->av_stream_ptr();
        // rescale packet from encoder to muxer stream
        CHECK(stream_i >= 0 && stream_i < encoder_time_bases.size(), "stream_index of packet not in valid encoder_time_bases");
        av_packet_rescale_ts(av_pkt, encoder_time_bases[stream_i], av_stream->time_base);
        int ret = av_interleaved_write_frame(format_ctx, av_pkt);
        CHECK(ret >= 0, "interleave write frame error");
    }
};


#endif