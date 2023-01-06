#include "filter.h"


void InOut::addEntry(std::string name, AVFilterContext* filter_ctx, int pad_idx) {
    // create and init new entry
    auto entry = avfilter_inout_alloc();
    entry->name = strdup(name.c_str());
    entry->filter_ctx = filter_ctx;
    entry->pad_idx = 0;
    entry->next = NULL;
    // add to the tail of entries
    if (entries == NULL) entries = entry;
    else {
        auto e = entries;
        while (e->next != NULL) e = e->next;
        e->next = entry;
    }
}


Filterer::Filterer(
    map<string, string> inParams, 
    map<string, string> outParams, 
    map<string, string> mediaTypes, 
    string filterSpec
) {
    AVFilterGraph* graph = filterGraph.av_FilterGraph();
    // create input nodes
    for (auto const& [id, params] : inParams) {
        AVFilterContext *buffersrc_ctx;
        const AVFilter *buffersrc = avfilter_get_by_name(mediaTypes[id] == "video" ? "buffer" : "abuffer");
        avfilter_graph_create_filter(&buffersrc_ctx, buffersrc, id.c_str(), params.c_str(), NULL, graph);
        outputs.addEntry(id.c_str(), buffersrc_ctx, 0);
        buffersrc_ctx_map[id] = buffersrc_ctx;
    }
    // create end nodes
    for (auto const& [id, params] : outParams) {
        AVFilterContext *buffersink_ctx;
        const AVFilter *buffersink = avfilter_get_by_name(mediaTypes[id] == "video" ? "buffersink" : "abuffersink");
        avfilter_graph_create_filter(&buffersink_ctx, buffersink, id.c_str(), NULL, NULL, graph);
        // todo... may be set out args
        // ret = av_opt_set_int_list(buffersink_ctx, "sample_rates", out_sample_rates, -1, AV_OPT_SEARCH_CHILDREN);
        inputs.addEntry(id.c_str(), buffersink_ctx, 0);
        buffersrc_ctx_map[id] = buffersink_ctx;
    }
    // create graph and valid
    auto outs = outputs.av_filterInOut();
    auto ins = inputs.av_filterInOut();
    avfilter_graph_parse_ptr(graph, filterSpec.c_str(), &outs, &ins, NULL);
    avfilter_graph_config(graph, NULL);
}

/** 
 * process once
 */
map<string, Frame> Filterer::filter(map<string, Frame> frames) {
    /* push the frames into the filtergraph */
    for (auto const& [id, ctx] : buffersrc_ctx_map) {
        if (frames.count(id) == 0) continue;
        auto ret = av_buffersrc_add_frame_flags(ctx, frames[id].av_ptr(), AV_BUFFERSRC_FLAG_KEEP_REF);
        CHECK(ret >= 0, "Error while feeding the audio filtergraph");
    }
    /* pull filtered frames from the filtergraph */
    std::vector<Frame> out_frames;
    AVFrame* out_frame;
    while (1) {
        for (auto const& [id, ctx] : buffersink_ctx_map) {
            auto ret = av_buffersink_get_frame(ctx, out_frame);
            if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF)
                break;
            CHECK(ret >= 0, "error get filtered frames from buffersink");
            out_frames.push_back(Frame(out_frame));
        }
    }
    // delete input frames
    for (auto f : frames)
        delete &f;
}
    

