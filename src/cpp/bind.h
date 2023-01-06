#ifndef BIND_H
#define BIND_H

#include <emscripten/bind.h>
#include "demuxer.h"
#include "decode.h"
#include "stream.h"
#include "filter.h"
#include "muxer.h"
#include "utils.h"
using namespace emscripten;


EMSCRIPTEN_BINDINGS(demuxer) {
    class_<FormatInfo>("FormatInfo")
        .property("formatName", &FormatInfo::format_name)
        .property("bitRate", &FormatInfo::bit_rate)
        .property("duration", &FormatInfo::duration)
        .property("streamInfos", &FormatInfo::streamInfos)
    ;

    class_<DeMuxer>("DeMuxer")
        .constructor<std::string>()
        .property("streams", &DeMuxer::getStreams)
        .function("seek", &DeMuxer::seek)
        .function("read", &DeMuxer::read)
        .function("getMetadata", &DeMuxer::getMetadata)
    ;
}

EMSCRIPTEN_BINDINGS(decode) {
    class_<Decoder>("Decoder")
        .constructor<std::string>()
        .constructor<DeMuxer&, int>()
        .function("decode", &Decoder::decode)
        .function("flush", &Decoder::flush)
        ;

}

EMSCRIPTEN_BINDINGS(stream) {
    class_<StreamInfo>("StreamInfo")
        .property("index", &StreamInfo::index)
        .property("timeBase", &StreamInfo::time_base)
        .property("bitRate", &StreamInfo::bit_rate)
        .property("startTime", &StreamInfo::start_time)
        .property("duration", &StreamInfo::duration)
        .property("mediaType", &StreamInfo::codec_type)
        .property("codecName", &StreamInfo::codec_name)
        .property("format", &StreamInfo::format)
        .property("width", &StreamInfo::width)
        .property("height", &StreamInfo::height)
        .property("frameRate", &StreamInfo::frame_rate)
        .property("sampleAspectRatio", &StreamInfo::sample_aspect_ratio)
        .property("sampleRate", &StreamInfo::sample_rate)
        .property("channelLayout", &StreamInfo::channel_layout)
        .property("channels", &StreamInfo::channels)
    ;
}

EMSCRIPTEN_BINDINGS(packet) {
    class_<Packet>("Packet")
        .constructor<int, int64_t>()
        .property("isEmpty", &Packet::isEmpty)
        .property("streamIndex", &Packet::stream_index)
        .function("getData", &Packet::getData)
    ;
}

EMSCRIPTEN_BINDINGS(frame) {
    class_<Frame>("Frame")
        // .constructor<FrameParams>()
        // .function("imageData", &Frame::getImageData)
    ;
}

EMSCRIPTEN_BINDINGS(filter) {
    class_<Filterer>("Filterer")
        .constructor<std::map<std::string, std::string>, std::map<std::string, std::string>, std::map<std::string, std::string>, std::string>()
        .function("filter", &Filterer::filter)
    ;
    
}

EMSCRIPTEN_BINDINGS(encode) {
    value_object<AVRational>("AVRational")
        .field("num", &AVRational::num)
        .field("den", &AVRational::den)
    ;
    
    class_<Encoder>("Encoder")
        .constructor<std::string, std::string>()
        .function("encode", &Encoder::encode)
        .function("flush", &Encoder::flush)
    ;
}

EMSCRIPTEN_BINDINGS(muxer) {
    class_<Muxer>("Muxer")
        .constructor<std::string, emscripten::val>()
        .class_function("inferFormatInfo", &Muxer::inferFormatInfo)
        .function("openIO", &Muxer::openIO)
        .function("newStream", &Muxer::newStream)
        .function("writeHeader", &Muxer::writeHeader)
        .function("writeTrailer", &Muxer::writeTrailer)
        .function("writeFrame", &Muxer::writeFrame)
    ;

    value_object<InferredFormatInfo>("InferredFormatInfo")
        .field("format", &InferredFormatInfo::format)
        .field("videoCodec", &InferredFormatInfo::videoCodec)
        .field("audioCodec", &InferredFormatInfo::audioCodec)
    ;
}

EMSCRIPTEN_BINDINGS(utils) {
    emscripten::function("createFrameMap", &createMap<std::string, Frame>);
    emscripten::function("createStringStringMap", &createMap<std::string, std::string>);

	register_vector<Frame>("vector<Frame>");
	register_vector<Packet>("vector<Packet>");
	register_vector<StreamInfo>("vector<StreamInfo>");
    register_map<std::string, std::string>("MapStringString");
}

#endif