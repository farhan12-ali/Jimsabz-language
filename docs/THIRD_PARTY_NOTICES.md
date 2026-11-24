# Build runtime notices

The Windows x64 executables in this distribution were built with Zig 0.13.0. They use standard C++ support libraries and the MinGW Windows CRT support shipped with that toolchain. These libraries are linked into the executables; the project does not require separately installed third-party runtime DLLs.

The applicable toolchain/library notices are reproduced in `docs/licenses/`:

- `zig.txt`
- `libcxx.txt`
- `libcxxabi.txt`
- `libunwind.txt`
- `mingw.txt`

The project sources, sample artwork, and sample OBJ model were created for this implementation. The Windows image, multimedia, speech, socket and desktop APIs are operating-system facilities.

