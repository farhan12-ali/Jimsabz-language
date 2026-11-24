#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "jimsabz.hpp"
int WINAPI wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
    try {
        return jim::launchStudio();
    } catch (const std::exception &e) {
        MessageBoxA(nullptr, e.what(), "Jimsabz Studio", MB_ICONERROR);
        return 1;
    }
}
#endif
