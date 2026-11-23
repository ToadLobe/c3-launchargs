cmake_minimum_required(VERSION 3.10)
project(LaunchArgsExtension CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Linux build. Produces build/lib/launchargs_x64.ext.so
# (no GTK dependency: the SDK sample only needed it for its messagebox demo).
add_library(launchargs SHARED WrapperExtension.cpp Utils.cpp)

set_target_properties(launchargs PROPERTIES
	PREFIX ""
	OUTPUT_NAME "launchargs_x64.ext"
	CXX_VISIBILITY_PRESET default
	LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
