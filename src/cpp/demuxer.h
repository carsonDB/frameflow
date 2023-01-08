#ifndef DEMUXER_H
#define DEMUXER_H

#include <string>
#include <vector>
extern "C" {
    #include <libavformat/avformat.h>
}

#include "metadata.h"
#include "utils.h"
#include "stream.h"
#include "packet.h"



class DeMuxer {
    AVFormatContext* format_ctx;
    std::vector<Stream> streams;
public:
    DeMuxer(std::string filename) {
        auto ret = avformat_open_input(&format_ctx, filename.c_str(), NULL, NULL);
        CHECK(ret == 0, "Could not open input file.");
        ret = avformat_find_stream_info(format_ctx, NULL);
        CHECK(ret >= 0, "Could not open find stream info.");
        for (int i = 0; i < format_ctx->nb_streams; i++) {
            streams.push_back(Stream(format_ctx, format_ctx->streams[i]));
        }
    }
    ~DeMuxer() { 
        avformat_free_context(format_ctx); 
        avformat_close_input(&format_ctx);
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