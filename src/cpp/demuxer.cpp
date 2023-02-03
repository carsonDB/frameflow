#include "demuxer.h"


// Custom reading avio https://www.codeproject.com/Tips/489450/Creating-Custom-FFmpeg-IO-Context
static int read_packet(void *opaque, uint8_t *buf, int buf_size)
{
    auto& reader = *reinterpret_cast<val*>(opaque);
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
static int64_t seek_for_read(void* opaque, int64_t pos, int whence) {
    auto& reader = *reinterpret_cast<val*>(opaque);
    auto size = (int64_t)reader["size"].as<double>();
    
    switch (whence) {
        case AVSEEK_SIZE:
            return size;
        case SEEK_SET:
            if (pos >= size) return AVERROR_EOF;
            reader.call<val>("seek", (double)pos).await(); break;
        case SEEK_CUR:
            pos += (int64_t)reader["offset"].as<double>();
            if (pos >= size) return AVERROR_EOF;
            reader.call<val>("seek", (double)pos).await(); break;
        case SEEK_END:
            if (pos >= size) return AVERROR_EOF;
            pos = size - pos;
            reader.call<val>("seek", (double)pos).await(); break;
        default:
            CHECK(false, "cannot process seek_for_read");
    }
    
    return pos;
}


void Demuxer::build(val _reader) {
    reader = std::move(_reader); // reader will be destroyed at end of this function 
    _url = reader["url"].as<std::string>();
    auto buffer = (uint8_t*)av_malloc(buf_size);
    auto readerPtr = reinterpret_cast<void*>(&reader);
    if ((int64_t)reader["size"].as<double>() <= 0)
        io_ctx = avio_alloc_context(buffer, buf_size, 0, readerPtr, &read_packet, NULL, NULL);
    else
        io_ctx = avio_alloc_context(buffer, buf_size, 0, readerPtr, &read_packet, NULL, &seek_for_read);
    format_ctx->pb = io_ctx;
    // open and get metadata
    auto ret = avformat_open_input(&format_ctx, _url.c_str(), NULL, NULL);
    CHECK(ret == 0, "Could not open input file.");
    ret = avformat_find_stream_info(format_ctx, NULL);
    CHECK(ret >= 0, "Could not open find stream info.");
    // init currentStreamsPTS
    for (int i = 0; i < format_ctx->nb_streams; i++)
        currentStreamsPTS[format_ctx->streams[i]->index] = 0;
}


Packet* Demuxer::read() {
    auto pkt = new Packet();
    auto ret = av_read_frame(format_ctx, pkt->av_packet());
    // update current stream pts (avoid end of file where pkt is empty with uninit values)
    if (pkt->size() > 0) {
        auto av_pkt = pkt->av_packet();
        const auto& time_base = format_ctx->streams[pkt->stream_index()]->time_base;
        auto next_pts = av_pkt->pts + av_pkt->duration;
        // printf("next_pts %lld, pts %lld, duration %lld\n", next_pts, av_pkt->pts, av_pkt->duration);
        currentStreamsPTS[pkt->stream_index()] = next_pts * (double)time_base.num / time_base.den;
    }
    return pkt;
}