#ifndef BIND_H
#define BIND_H

#include <emscripten/bind.h>
#include "utils.h"
#include "metadata.h"
#include "stream.h"
#include "encode.h"
#include "demuxer.h"
#include "decode.h"
#include "filter.h"
#include "muxer.h"
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
        .field("extraData", &StreamInfo::extraData)
        .field("width", &StreamInfo::width)
        .field("height", &StreamInfo::height)
        .field("frameRate", &StreamInfo::frame_rate)
        .field("sampleAspectRatio", &StreamInfo::sample_aspect_ratio)
        .field("sampleRate", &StreamInfo::sample_rate)
        .field("channelLayout", &StreamInfo::channel_layout)
        .field("channels", &StreamInfo::channels)
    ;

    value_object<DataFormat>("DataFormat")
        .field("format", &DataFormat::format)
        .field("channelLayout", &DataFormat::channelLayout)
        .field("channels", &DataFormat::channels)
        .field("sampleRate", &DataFormat::sampleRate)
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
        .function("getTimeBase", &Demuxer::getTimeBase)
        .function("getMetadata", &Demuxer::getMetadata)
        .function("currentTime", &Demuxer::currentTime)
    ;
}

EMSCRIPTEN_BINDINGS(decode) {
    class_<Decoder>("Decoder")
        .constructor<Demuxer*, int, std::string>(allow_raw_pointers())
        .constructor<StreamInfo, std::string>()
        .property("name", &Decoder::name)
        .property("timeBase", &Decoder::timeBase)
        .property("dataFormat", &Decoder::dataFormat)
        .function("decode", &Decoder::decode, allow_raw_pointers())
        .function("flush", &Decoder::flush, allow_raw_pointers())
    ;

}

EMSCRIPTEN_BINDINGS(packet) {
    value_object<TimeInfo>("TimeInfo")
        .field("pts", &TimeInfo::pts)
        .field("dts", &TimeInfo::dts)
        .field("duration", &TimeInfo::duration)
    ;

    class_<Packet>("Packet")
        .constructor<int, TimeInfo>()
        .property("key", &Packet::key)
        .property("size", &Packet::size)
        .property("streamIndex", &Packet::stream_index)
        .function("getData", &Packet::getData)
        .function("getTimeInfo", &Packet::getTimeInfo)
        .function("dump", &Packet::dump)
    ;
}

EMSCRIPTEN_BINDINGS(frame) {
    value_object<FrameInfo>("FrameInfo")
        .field("format", &FrameInfo::format)
        .field("height", &FrameInfo::height)
        .field("width", &FrameInfo::width)
        .field("channels", &FrameInfo::channels)
        .field("sampleRate", &FrameInfo::sample_rate)
        .field("nbSamples", &FrameInfo::nb_samples)
        .field("channelLayout", &FrameInfo::channel_layout)
    ;

    class_<Frame>("Frame")
        .constructor<FrameInfo, double, std::string>()
        .function("getFrameInfo", &Frame::getFrameInfo)
        .class_function("inferChannelLayout", &Frame::inferChannelLayout)
        .property("key", &Frame::key)
        .property("pts", &Frame::doublePTS)
        .property("name", &Frame::name)
        .function("getPlanes", &Frame::getPlanes)
        .function("dump", &Frame::dump)
    ;
}

EMSCRIPTEN_BINDINGS(filter) {
    class_<Filterer>("Filterer")
        .constructor<std::map<std::string, std::string>, std::map<std::string, std::string>, std::map<std::string, std::string>, std::string>()
        .function("filter", &Filterer::filter, allow_raw_pointers())
        .function("flush", &Filterer::flush, allow_raw_pointers())
    ;
    
}

EMSCRIPTEN_BINDINGS(encode) {
    value_object<AVRational>("AVRational")
        .field("num", &AVRational::num)
        .field("den", &AVRational::den)
    ;
    
    class_<Encoder>("Encoder")
        .constructor<StreamInfo>()
        .property("timeBase", &Encoder::timeBase)
        .property("dataFormat", &Encoder::dataFormat)
        .function("encode", &Encoder::encode, allow_raw_pointers())
        .function("flush", &Encoder::flush, allow_raw_pointers())
    ;
}

EMSCRIPTEN_BINDINGS(muxer) {
    class_<Muxer>("Muxer")
        .constructor<std::string, emscripten::val>()
        .class_function("inferFormatInfo", &Muxer::inferFormatInfo)
        .function("dump", &Muxer::dump)
        .function("newStream", select_overload<void(Encoder*, AVRational)>(&Muxer::newStream), allow_raw_pointers())
        .function("newStream", select_overload<void(StreamInfo)>(&Muxer::newStream), allow_raw_pointers())
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
    register_vector<emscripten::val>("vector<val>");
	register_vector<StreamInfo>("vector<StreamInfo>");
    register_vector<std::string>("vector<string>"); // map.keys()
    register_map<std::string, std::string>("MapStringString");

    emscripten::function("setConsoleLogger", &setConsoleLogger);
}

#endif