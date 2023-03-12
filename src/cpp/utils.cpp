#include "utils.h"


static void log_callback(void *ptr, int level, const char *fmt, va_list vl) {
    // skip when less important messages
    if (level > av_log_get_level()) return;

    va_list vl2;
    char line[1024];
    static int print_prefix = 1;
    va_copy(vl2, vl);
    av_log_format_line(ptr, level, fmt, vl2, line, sizeof(line), &print_prefix);
    va_end(vl2);
    string msg = line;
    auto console = emscripten::val::global("console");

    if (level <= AV_LOG_ERROR)
        console.call<void>("error", msg);
    else if (level <= AV_LOG_WARNING)
        console.call<void>("warn", msg);
    else
        console.call<void>("log", msg);
}

void setConsoleLogger(bool verbose) {
    av_log_set_level(verbose ? AV_LOG_VERBOSE : AV_LOG_INFO);
    av_log_set_callback(log_callback);
}



string get_channel_layout_name(int channels, uint64_t channel_layout) {
    if (!channel_layout)
        channel_layout = (uint64_t)av_get_default_channel_layout(channels);
    int buf_size = 256;
    char buf[buf_size];
    av_get_channel_layout_string(buf, buf_size, channels, channel_layout);
    return buf;
}
