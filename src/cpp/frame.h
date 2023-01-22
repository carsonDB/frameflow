#ifndef FRAME_H
#define FRAME_H

#include <emscripten/val.h>
extern "C" {
    #include <libavutil/frame.h>
    #include <libavutil/imgutils.h>
}

#include "utils.h"
using namespace emscripten;


class Frame {
    AVFrame* av_frame;
    int align = 32;
    std::string _name; // streamId
public:
    std::string name() const { return _name; }
// only for c++
    Frame(std::string name) { 
        this->_name = name;
        av_frame = av_frame_alloc(); 
    }
    ~Frame() { av_frame_free(&av_frame); }
    
    emscripten::val getData(int i) {
        CHECK(i >= 0 && i < 8, "Frame::getData: plane_index not valid, [0, 8]");
        return emscripten::val(emscripten::typed_memory_view(
            av_frame->linesize[i] * av_frame->height, av_frame->data[i]));
        // todo...get whole buffer
    }

    AVFrame* av_ptr() { return av_frame; };
};


#endif
