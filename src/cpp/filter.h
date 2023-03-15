
#ifndef FILTER_H
#define FILTER_H

#include <string>
#include <vector>
extern "C" {
    #include <libavfilter/avfilter.h>
    #include <libavfilter/buffersrc.h>
    #include <libavfilter/buffersink.h>
}

#include "frame.h"
#include "stream.h"
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


#endif