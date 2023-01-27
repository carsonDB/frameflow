#ifndef BIND_H
#define BIND_H

#include <emscripten/bind.h>
#include "metadata.h"
#include "stream.h"
#include "encode.h"
#include "demuxer.h"
#include "decode.h"
#include "filter.h"
#include "muxer.h"
#include "utils.h"
using namespace emscripten;


EMSCRIPTEN_BINDINGS(metadata) {
    value_object<StreamInfo>("StreamInfo")
        .field("index", &StreamInfo::index)
        .field("timeBase", &StreamInfo::time_base)
        .field("bitRate", &StreamInfo::bit_rate)
        .field("startTime", &StreamInfo::start_time)
        .field("duration", &StreamInfo::duration)
        .field("mediaType", &StreamInfo::codec_type)
        .field("codecName", &StreamInfo::codec_name)
        .field("format", &StreamInfo::format)
        .field("width", &StreamInfo::width)
        .field("height", &StreamInfo::height)
        .field("frameRate", &StreamInfo::frame_rate)
        .field("sampleAspectRatio", &StreamInfo::sample_aspect_ratio)
        .field("sampleRate", &StreamInfo::sample_rate)
        .field("channelLayout", &StreamInfo::channel_layout)
        .field("channels", &StreamInfo::channels)
    ;

    value_object<FormatInfo>("FormatInfo")
        .field("formatName", &FormatInfo::format_name)
        .field("bitRate", &FormatInfo::bit_rate)
        .field("duration", &FormatInfo::duration)
        .field("streamInfos", &FormatInfo::streamInfos)
    ;
}

EMSCRIPTEN_BINDINGS(demuxer) {

    class_<Demuxer>("Demuxer")
        // .constructor<emscripten::val>()
        .constructor<>()
        .function("build", &Demuxer::build)
        .function("seek", &Demuxer::seek)
        .function("read", &Demuxer::read, allow_raw_pointers())
        .function("dump", &Demuxer::dump)
        .function("getMetadata", &Demuxer::getMetadata)
        .function("currentTime", &Demuxer::currentTime)
    ;
}

EMSCRIPTEN_BINDINGS(decode) {
    class_<Decoder>("Decoder")
        .constructor<Demuxer&, int, std::string>()
        .constructor<std::string, std::string>()
        .property("name", &Decoder::name)
        .function("setTimeBase", &Decoder::setTimeBase)
        .function("decode", &Decoder::decode, allow_raw_pointers())
        .function("flush", &Decoder::flush, allow_raw_pointers())
    ;

}

EMSCRIPTEN_BINDINGS(packet) {
    class_<Packet>("Packet")
        .constructor<>()
        .constructor<int, int64_t>()
        .property("size", &Packet::size)
        .property("streamIndex", &Packet::stream_index)
        .function("getData", &Packet::getData)
        .function("dump", &Packet::dump)
    ;
}

EMSCRIPTEN_BINDINGS(frame) {
    class_<Frame>("Frame")
        // .constructor<FrameParams>()
        .property("name", &Frame::name)
        .function("getData", &Frame::getData)
        .function("dump", &Frame::dump)
    ;
}

EMSCRIPTEN_BINDINGS(filter) {
    class_<Filterer>("Filterer")
        .constructor<std::map<std::string, std::string>, std::map<std::string, std::string>, std::map<std::string, std::string>, std::string>()
        .function("filter", &Filterer::filter, allow_raw_pointers())
    ;
    
}

EMSCRIPTEN_BINDINGS(encode) {
    value_object<AVRational>("AVRational")
        .field("num", &AVRational::num)
        .field("den", &AVRational::den)
    ;
    
    class_<Encoder>("Encoder")
        .constructor<StreamInfo>()
        .function("setTimeBase", &Encoder::setTimeBase)
        .function("encode", &Encoder::encode, allow_raw_pointers())
        .function("flush", &Encoder::flush, allow_raw_pointers())
    ;
}

EMSCRIPTEN_BINDINGS(muxer) {
    class_<Muxer>("Muxer")
        .constructor<std::string, emscripten::val>()
        .class_function("inferFormatInfo", &Muxer::inferFormatInfo)
        .function("dump", &Muxer::dump)
        .function("newStream", &Muxer::newStream, allow_raw_pointers())
        .function("writeHeader", &Muxer::writeHeader)
        .function("writeTrailer", &Muxer::writeTrailer)
        .function("writeFrame", &Muxer::writeFrame, allow_raw_pointers())
    ;

    value_object<InferredFormatInfo>("InferredFormatInfo")
        .field("format", &InferredFormatInfo::format)
        .field("video", &InferredFormatInfo::video)
        .field("audio", &InferredFormatInfo::audio)
    ;

    value_object<InferredStreamInfo>("InferredStreamInfo")
        .field("codecName", &InferredStreamInfo::codec_name)
        .field("format", &InferredStreamInfo::format)
    ;
}

EMSCRIPTEN_BINDINGS(utils) {
    emscripten::function("createFrameVector", &createVector<Frame*>);
    emscripten::function("createStringStringMap", &createMap<std::string, std::string>);

	register_vector<Frame*>("vector<Frame>");
	register_vector<Packet*>("vector<Packet>");
	register_vector<StreamInfo>("vector<StreamInfo>");
    register_map<std::string, std::string>("MapStringString");
}

#endif