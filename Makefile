TARGET_EXEC := ffmpeg-wrapper.o
BUILD_DIR := ./build
SRC_DIRS := ./src/cpp
FFMPEG_DIRS := ./FFmpeg

# Find all the C and C++ files we want to compile
# Note the single quotes around the * expressions. Make will incorrectly expand these otherwise.
SRCS := $(shell find $(SRC_DIRS) -name '*.cpp')
# String substitution for every C/C++ file.
# As an example, hello.cpp turns into ./build/hello.cpp.o
OBJS := $(SRCS:$(SRC_DIRS)/%=$(BUILD_DIR)/%.o)

# Every folder in ./src will need to be passed to GCC so that it can find header files
INC_DIRS := $(FFMPEG_DIRS) $(SRC_DIRS)
# Add a prefix to INC_DIRS. So moduleA would become -ImoduleA. GCC understands this -I flag
INC_FLAGS := $(addprefix -I,$(INC_DIRS))

# The -MMD and -MP flags together generate Makefiles for us!
# These files will have .d instead of .o as the output.
CPPFLAGS := $(INC_FLAGS) -MMD -MP -Wall -lembind
LDFLAGS :=  -lembind

# # The final build (link) step.
# $(BUILD_DIR)/$(TARGET_EXEC): $(OBJS)
# 	$(CXX) $(OBJS) -o $@ $(LDFLAGS)

# Build step for C++ source (seperately)
$(BUILD_DIR)/%.cpp.o: $(SRC_DIRS)/%.cpp
	mkdir -p $(dir $@)
	$(CXX) $(CPPFLAGS) -c  $< -o $@


# .PHONY: clean
# clean:
# 	rm -r $(BUILD_DIR)