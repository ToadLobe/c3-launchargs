#!/bin/sh
# Builds a universal (arm64 + x86_64) macOS wrapper extension without Xcode's IDE.
# Output: construct-plugin/launchargs.ext.dylib
set -e
cd "$(dirname "$0")/../extension"
clang++ -std=c++17 -O2 -Wno-switch -fobjc-arc -dynamiclib -arch arm64 -arch x86_64 \
	-framework Foundation \
	-x objective-c++ WrapperExtension.cpp \
	-x c++ Utils.cpp \
	-o ../construct-plugin/launchargs.ext.dylib
echo "Built construct-plugin/launchargs.ext.dylib"
