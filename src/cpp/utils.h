#ifndef UTILS_H
#define UTILS_H

#define CHECK(cond, msg) assert(cond && msg)

#include <vector>
#include <map>
#include "frame.h"
using namespace std;


template<typename T>
vector<T> createVector() {
    return vector<T>();
}


template<typename T1, typename T2>
map<T1, T2> createMap() {
    return map<T1, T2>();
}




#endif