@echo off
cd /d "%~dp0"
if not exist build\Jimsabz-Studio.exe (
    echo Run build-windows.cmd first to compile Jimsabz.
    pause
    exit /b 1
)
start "Jimsabz Studio" build\Jimsabz-Studio.exe
