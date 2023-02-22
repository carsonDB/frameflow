#include "muxer.h"



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
            writer.call<val>("seek", (double)pos); break;
        case SEEK_CUR:
            pos += (int64_t)writer["offset"].as<double>();
            writer.call<val>("seek", (double)pos); break;
        default:
            CHECK(false, "cannot process seek_for_read");
    }

    return pos;
}


Muxer::Muxer(string format, val _writer) {
    writer = std::move(_writer); // writer will be destroyed at end of this function 
    auto writerPtr = reinterpret_cast<void*>(&writer);
    // create buffer for writing
    auto buffer = (uint8_t*)av_malloc(buf_size);
    io_ctx = avio_alloc_context(buffer, buf_size, 1, writerPtr, NULL, write_packet, seek_for_write);
    avformat_alloc_output_context2(&format_ctx, NULL, format.c_str(), NULL);
    CHECK(format_ctx != NULL, "Could not create output format context");
    format_ctx->pb = io_ctx;
    format_ctx->flags |= AVFMT_FLAG_CUSTOM_IO;
}


InferredFormatInfo Muxer::inferFormatInfo(string format_name, string filename) {
    auto format = av_guess_format(format_name.c_str(), filename.c_str(), NULL);
    if (format == NULL)
        // maybe format_name is extension of the filename
        format = av_guess_format("", (filename + "." + format_name).c_str(), NULL);
    auto video_codec = avcodec_find_encoder(format->video_codec);
    auto audio_codec = avcodec_find_encoder(format->audio_codec);
    
    InferredStreamInfo videoInfo = {
        .codec_name = avcodec_descriptor_get(video_codec->id)->name,
        .format = av_get_pix_fmt_name(*video_codec->pix_fmts),
    };
    InferredStreamInfo audioInfo = {
        .codec_name = avcodec_descriptor_get(audio_codec->id)->name,
        .format = av_get_sample_fmt_name(*audio_codec->sample_fmts)
    };

    return { 
        .format = format->name, 
        .video = videoInfo,
        .audio = audioInfo };
}


void Muxer::writeFrame(Packet* packet, int stream_i) {
    auto av_pkt = packet->av_packet();
    CHECK(stream_i >= 0 && stream_i < streams.size(), "stream_index of packet not in valid streams");
    auto av_stream = streams[stream_i]->av_stream_ptr();
    // rescale packet to muxer stream
    av_packet_rescale_ts(av_pkt, AV_TIME_BASE_Q, av_stream->time_base);
    av_pkt->stream_index = stream_i;
    
    int ret = av_interleaved_write_frame(format_ctx, av_pkt);
    CHECK(ret >= 0, "interleave write frame error");
}