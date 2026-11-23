cmake_minimum_required(VERSION 3.10)
project(LaunchArgsExtension CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
	set(CMAKE_BUILD_TYPE Release)
endif()

# Linux build. Produces build/lib/launchargs_x64.ext.so
# (no GTK dependency: the SDK sample only needed it for its messagebox demo).
add_library(launchargs SHARED WrapperExtension.cpp Utils.cpp)

set_target_properties(launchargs PROPERTIES
	PREFIX ""
	OUTPUT_NAME "launchargs_x64.ext"
	LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib
	LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)

# Export only WrapperExtInit. libstdc++ stays dynamic: a static libstdc++.a carries the build
# machine's glibc symbol versions (GLIBC_2.38 on a current distro), which is a worse floor than
# libstdc++.so itself. A Release (-O2) build needs only GLIBCXX_3.4.21 (GCC 5) and GLIBC_2.34
# (dlsym; the exported game executable already needs 2.34, so it doesn't raise the floor);
# an unoptimized build pulls in GLIBCXX_3.4.30 (GCC 12), so keep the default build type.
target_link_options(launchargs PRIVATE
	-Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map
	-Wl,--no-undefined
	-Wl,--as-needed
	-s)

# dlsym (for libcef.so's command line API) lives in libdl before glibc 2.34.
target_link_libraries(launchargs PRIVATE ${CMAKE_DL_LIBS})
