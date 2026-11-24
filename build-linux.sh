#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
mkdir -p build
g++ -std=c++17 -O2 -Wall -Wextra -Wpedantic -Wno-misleading-indentation -Wno-missing-field-initializers \
    -Iinclude src/gc.cpp src/types.cpp src/elaborate.cpp src/standard.cpp src/verify.cpp src/frontend.cpp src/semantic.cpp src/compiler.cpp src/bytecode.cpp \
    src/vm.cpp src/graphics.cpp src/network.cpp src/platform.cpp src/studio_win32.cpp \
    src/main.cpp -pthread -o build/jimsabz
echo "Built build/jimsabz"
