#ifndef METADATA_H
#define METADATA_H

#include <emscripten/val.h>
#include <cstdio>
#include <string>
#include <vector>
#include <cmath>
#include "utils.h"

extern "C" {
    #include <libavformat/avformat.h>
    #include <libavutil/pixdesc.h>
    #include <libavutil/channel_layout.h>
    #include <libavcodec/avcodec.h>
}
using namespace std;


struct StreamInfo {
    int index;
    AVRational time_base;
    
    // int64_t bit_rate;
    // int64_t start_time;
    int bit_rate;
    double start_time;
    double duration;
    
    string codec_type;
    string codec_name;
    string format;
    emscripten::val extraData;
    // video
    int width;
    int height;
    double frame_rate;
    AVRational sample_aspect_ratio;
    // audio
    int sample_rate;
    string channel_layout;
    int channels;

};


StreamInfo createStreamInfo(AVFormatContext* p, AVStream* s);
void set_avstream_from_streamInfo(AVStream* stream, StreamInfo& info);
void set_avcodec_context_from_streamInfo(StreamInfo& info, AVCodecContext* ctx);


struct DataFormat {
    string format; // AVSampleFormat / AVPixelFormat
    string channelLayout;
    int channels;
    int sampleRate; 
};

DataFormat createDataFormat(AVCodecContext* ctx);


struct FormatInfo {
    std::string format_name;
    // int64_t bit_rate;
    int bit_rate;
    double duration;
    vector<StreamInfo> streamInfos;
};

FormatInfo createFormatInfo(AVFormatContext* p);

#endif