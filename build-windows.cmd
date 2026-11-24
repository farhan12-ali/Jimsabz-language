@echo off
setlocal
cd /d "%~dp0"
if not exist build mkdir build
where cl >nul 2>nul
if not errorlevel 1 goto msvc
where g++ >nul 2>nul
if not errorlevel 1 goto mingw
echo A C++17 compiler is needed to rebuild the source.
echo Open the x64 Native Tools Command Prompt for Visual Studio, then run this file.
echo To use the included app, open Start-Studio.cmd instead.
exit /b 1
:msvc
cl /nologo /std:c++17 /O2 /EHsc /MT /utf-8 /DUNICODE /D_UNICODE /Iinclude ^
 src\gc.cpp src\types.cpp src\elaborate.cpp src\standard.cpp src\verify.cpp src\frontend.cpp src\semantic.cpp src\compiler.cpp src\bytecode.cpp ^
 src\vm.cpp src\graphics.cpp src\network.cpp src\platform.cpp src\studio_win32.cpp src\main.cpp ^
 /Fe:build\jimsabz.exe /Fo:build\ ^
 /link user32.lib gdi32.lib comdlg32.lib comctl32.lib ole32.lib uuid.lib windowscodecs.lib winmm.lib sapi.lib ws2_32.lib shell32.lib
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /O2 /EHsc /MT /utf-8 /DUNICODE /D_UNICODE /Iinclude /c src\studio_entry.cpp /Fo:build\studio_entry.obj
if errorlevel 1 exit /b 1
link /nologo /SUBSYSTEM:WINDOWS /OUT:build\Jimsabz-Studio.exe ^
 build\gc.obj build\types.obj build\elaborate.obj build\standard.obj build\verify.obj build\frontend.obj build\semantic.obj build\compiler.obj build\bytecode.obj build\vm.obj build\graphics.obj ^
 build\network.obj build\platform.obj build\studio_win32.obj build\studio_entry.obj ^
 user32.lib gdi32.lib comdlg32.lib comctl32.lib ole32.lib uuid.lib windowscodecs.lib winmm.lib sapi.lib ws2_32.lib shell32.lib
exit /b %errorlevel%
:mingw
g++ -std=c++17 -O2 -static -DUNICODE -D_UNICODE -Iinclude ^
 src\gc.cpp src\types.cpp src\elaborate.cpp src\standard.cpp src\verify.cpp src\frontend.cpp src\semantic.cpp src\compiler.cpp src\bytecode.cpp ^
 src\vm.cpp src\graphics.cpp src\network.cpp src\platform.cpp src\studio_win32.cpp src\main.cpp ^
 -o build\jimsabz.exe -luser32 -lgdi32 -lcomdlg32 -lcomctl32 -lole32 -luuid -lwindowscodecs -lwinmm -lsapi -lws2_32 -lshell32
if errorlevel 1 exit /b 1
g++ -std=c++17 -O2 -static -municode -mwindows -DUNICODE -D_UNICODE -Iinclude ^
 src\gc.cpp src\types.cpp src\elaborate.cpp src\standard.cpp src\verify.cpp src\frontend.cpp src\semantic.cpp src\compiler.cpp src\bytecode.cpp ^
 src\vm.cpp src\graphics.cpp src\network.cpp src\platform.cpp src\studio_win32.cpp src\studio_entry.cpp ^
 -o build\Jimsabz-Studio.exe -luser32 -lgdi32 -lcomdlg32 -lcomctl32 -lole32 -luuid -lwindowscodecs -lwinmm -lsapi -lws2_32 -lshell32
exit /b %errorlevel%
