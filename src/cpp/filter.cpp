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


/**
 * inParams: map<id, buffersrc args>
 * outParams: map<id, buffersink args>
 * mediaTypes: map<id, buffersrc/buffersink type=audio/video>
 */
Filterer::Filterer(
    map<string, string> inParams, 
    map<string, string> outParams, 
    map<string, string> mediaTypes, 
    string filterSpec
) {
    AVFilterGraph* graph = filterGraph.av_FilterGraph();
    // create input nodes
    for (auto const& [id, params] : inParams) {
        CHECK(id.length() > 0, "Filterer: buffersrc id should not be empty");
        AVFilterContext *buffersrc_ctx;
        const AVFilter *buffersrc = avfilter_get_by_name(mediaTypes[id] == "video" ? "buffer" : "abuffer");
        avfilter_graph_create_filter(&buffersrc_ctx, buffersrc, id.c_str(), params.c_str(), NULL, graph);
        outputs.addEntry(id.c_str(), buffersrc_ctx, 0);
        buffersrc_ctx_map[id] = buffersrc_ctx;
    }
    // create end nodes
    for (auto const& [id, params] : outParams) {
        CHECK(id.length() > 0, "Filterer: buffersink id should not be empty");
        AVFilterContext *buffersink_ctx;
        const AVFilter *buffersink = avfilter_get_by_name(mediaTypes[id] == "video" ? "buffersink" : "abuffersink");
        avfilter_graph_create_filter(&buffersink_ctx, buffersink, id.c_str(), NULL, NULL, graph);
        // todo... may be set out args
        // ret = av_opt_set_int_list(buffersink_ctx, "sample_rates", out_sample_rates, -1, AV_OPT_SEARCH_CHILDREN);
        inputs.addEntry(id.c_str(), buffersink_ctx, 0);
        buffersink_ctx_map[id] = buffersink_ctx;
    }
    // create graph and valid
    auto ins = inputs.av_filterInOut();
    auto outs = outputs.av_filterInOut();
    auto ret = avfilter_graph_parse_ptr(graph, filterSpec.c_str(), &ins, &outs, NULL);
    CHECK(ret >= 0, "cannot parse filter graph");
    ret = avfilter_graph_config(graph, NULL);
    CHECK(ret >= 0, "cannot configure graph");
}


/** 
 * process once
 * In/Out frames should all have non-empty Frame::name.
 */
vector<Frame*> Filterer::filter(vector<Frame*> frames) {
    std::vector<Frame*> out_frames;
    
    // At each time, send a frame, and pull frames as much as possible.
    for (auto const& frame : frames) {
        // feed to graph
        const auto& id = frame->name();
        if (buffersrc_ctx_map.count(id) == 0) continue;
        auto ctx = buffersrc_ctx_map[id];
        auto ret = av_buffersrc_add_frame_flags(ctx, frame->av_ptr(), AV_BUFFERSRC_FLAG_KEEP_REF);
        CHECK(ret >= 0, "Error while feeding the filtergraph");
        // pull filtered frames from each entry of filtergraph outputs
        for (auto const& [id, ctx] : buffersink_ctx_map) {
            while (1) {
                auto out_frame = new Frame(id);
                auto ret = av_buffersink_get_frame(ctx, out_frame->av_ptr());
                if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
                    delete out_frame;
                    break;
                }
                CHECK(ret >= 0, "error get filtered frames from buffersink");
                out_frame->av_ptr()->pict_type = AV_PICTURE_TYPE_NONE;
                out_frames.push_back(out_frame);
            }
        }
    }

    return out_frames;
}
    

vector<Frame*> Filterer::flush() {
    std::vector<Frame*> out_frames;
    for (const auto& [id, ctx] : buffersrc_ctx_map) {
        auto ret = av_buffersrc_add_frame_flags(ctx, NULL, AV_BUFFERSRC_FLAG_KEEP_REF);
        CHECK(ret >= 0, "Error while flushing the filtergraph");
        // pull filtered frames from each entry of filtergraph outputs
        for (auto const& [id, ctx] : buffersink_ctx_map) {
            while (1) {
                auto out_frame = new Frame(id);
                auto ret = av_buffersink_get_frame(ctx, out_frame->av_ptr());
                if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
                    delete out_frame;
                    break;
                }
                CHECK(ret >= 0, "error get filtered frames from buffersink");
                out_frame->av_ptr()->pict_type = AV_PICTURE_TYPE_NONE;
                out_frames.push_back(out_frame);
            }
        }
    }

    return out_frames;
}
