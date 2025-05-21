#ifndef FILTER_H
#define FILTER_H

#include <string>
#include <vector>
extern "C" {
    #include <libavfilter/avfilter.h>
    #include <libavfilter/buffersrc.h>
    #include <libavfilter/buffersink.h>
    #include <libavcodec/bsf.h>
}

#include "frame.h"
#include "stream.h"
#include "demuxer.h"
#include "muxer.h"
using namespace std;


class FilterGraph {
    AVFilterGraph* graph;

public:
    FilterGraph() { graph = avfilter_graph_alloc(); }
    ~FilterGraph() { avfilter_graph_free(&graph); }

    AVFilterGraph* av_FilterGraph() { return graph; }
};


class InOut {
    AVFilterInOut *entries = NULL;
public:
    AVFilterInOut *av_filterInOut() { return entries; }
    void addEntry(string name, AVFilterContext* filter_ctx, int pad_idx);
};


class Filterer {
    FilterGraph filterGraph;
    InOut inputs;
    InOut outputs;
    map<string, AVFilterContext*> buffersrc_ctx_map;
    map<string, AVFilterContext*> buffersink_ctx_map;

public:
    /**
     * @brief Build a filter graph, either video or audio.
     * 
     * @param type `video` or `audio`
     * @param inParams map <id (stream), buffersrc argments>
     * @param outParams map <id (stream), buffersink argments>
     * @param filterSpec 
     */
    Filterer(map<string, string> inParams, map<string, string> outParams, map<string, string> mediaTypes, string filterSpec);
    vector<Frame*> filter(vector<Frame*>);
    vector<Frame*> flush();
};


class BitstreamFilterer {
    AVBSFContext* bsf_ctx;

public:
    BitstreamFilterer(string filter_name, Demuxer* demuxer, int in_stream_index, Muxer* muxer, int out_stream_index) {
        const AVBitStreamFilter* bsf = av_bsf_get_by_name(filter_name.c_str());
        CHECK(bsf != NULL, "Could not find bitstream filter");
        av_bsf_alloc(bsf, &bsf_ctx);

        // copy codec parameters
        auto istream = demuxer->av_stream(in_stream_index);
        auto ostream = muxer->av_stream(out_stream_index);
        auto ret = avcodec_parameters_copy(bsf_ctx->par_in, istream->codecpar);
        CHECK(ret >= 0, "Failed to copy codec parameters to bitstream filter");
        ret = avcodec_parameters_copy(bsf_ctx->par_out, ostream->codecpar);
        CHECK(ret >= 0, "Failed to copy codec parameters to bitstream filter");

        ret = av_bsf_init(bsf_ctx);
        CHECK(ret >= 0, "Failed to initialize bitstream filter");
    }
    ~BitstreamFilterer() { av_bsf_free(&bsf_ctx); }

    AVBSFContext* av_bsfContext() { return bsf_ctx; }
    void filter(Packet* packet);
};


#endif