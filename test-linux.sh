#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
python3 tests/regression.py
g++ -std=c++17 -O2 -Iinclude src/gc.cpp src/types.cpp src/elaborate.cpp src/standard.cpp src/verify.cpp src/frontend.cpp src/semantic.cpp src/compiler.cpp src/bytecode.cpp \
    src/vm.cpp src/graphics.cpp src/network.cpp src/platform.cpp tests/runtime.cpp -pthread -o build/runtime-tests
build/runtime-tests
build/runtime-tests --benchmark 2d > build/benchmark-2d.json
build/runtime-tests --benchmark 3d > build/benchmark-3d.json
build/runtime-tests --compile-benchmark > build/benchmark-compiler.json
