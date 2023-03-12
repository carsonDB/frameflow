#ifndef UTILS_H
#define UTILS_H

#define CHECK(cond, msg) assert(cond && msg)

#include <vector>
#include <emscripten/val.h>
#include <map>
extern "C" {
    #include <libavutil/log.h>
    #include <libavutil/channel_layout.h>
}
using namespace std;


template<typename T>
vector<T> createVector() {
    return vector<T>();
}


template<typename T1, typename T2>
map<T1, T2> createMap() {
    return map<T1, T2>();
}

/* set custom (console) Logger */
void setConsoleLogger(bool verbose);


/* get description of channel_layout */
string get_channel_layout_name(int channels, uint64_t channel_layout);

#endif