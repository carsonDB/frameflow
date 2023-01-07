#ifndef FRAME_H
#define FRAME_H

#include <emscripten/val.h>
extern "C" {
    #include <libavutil/frame.h>
    #include <libavutil/imgutils.h>
}

using namespace emscripten;


class Frame {
    AVFrame* av_frame;
    int align = 32;
public:
    // Frame(FrameParams params) {
    //     av_frame = av_frame_alloc();
    //     params.fill_context(av_frame);
    //     av_frame_get_buffer(av_frame, 0);
    // }
    // create empty frame
    Frame() { av_frame = NULL; }
    ~Frame() { av_frame_free(&av_frame); }
    // val getImageData(int plane_index) {
    //     // todo... size of memory: consider `av_image_fill_plane_sizes`
    //     auto size = av_image_get_buffer_size(
    //         (AVPixelFormat)av_frame->format, av_frame->width, av_frame->height, align);
    //     return val(typed_memory_view(size, av_frame->data[plane_index]));
    // }
// only for c++
    Frame(AVFrame* frame) { av_frame = frame; };
    AVFrame* av_ptr() { return av_frame; };
};


#endif
