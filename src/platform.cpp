#include "jimsabz.hpp"
#include <thread>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#include <mmsystem.h>
#include <sapi.h>
#endif

namespace jim {
#ifdef _WIN32
namespace {
std::wstring wide(const std::string &s) {
    int size = MultiByteToWideChar(CP_UTF8, 0, s.data(), int(s.size()), nullptr, 0);
    std::wstring out(size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), int(s.size()), out.data(), size);
    return out;
}
int virtualKey(std::string key) {
    if (key == "LEFT")
        return VK_LEFT;
    if (key == "RIGHT")
        return VK_RIGHT;
    if (key == "UP")
        return VK_UP;
    if (key == "DOWN")
        return VK_DOWN;
    if (key == "SPACE")
        return VK_SPACE;
    if (key == "ESC")
        return VK_ESCAPE;
    if (key == "F1")
        return VK_F1;
    if (key == "ENTER")
        return VK_RETURN;
    if (key == "MOUSE_LEFT")
        return VK_LBUTTON;
    if (key == "MOUSE_RIGHT")
        return VK_RBUTTON;
    if (key.size() == 1)
        return std::toupper(static_cast<unsigned char>(key[0]));
    return 0;
}
void paintFrame(HDC dc, const RECT &area, const World &world) {
    if (world.pixels.empty())
        return;
    BITMAPINFO info{};
    info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    info.bmiHeader.biWidth = world.width;
    info.bmiHeader.biHeight = -world.height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = BI_RGB;
    SetStretchBltMode(dc, COLORONCOLOR);
    StretchDIBits(dc, area.left, area.top, area.right - area.left, area.bottom - area.top, 0, 0, world.width,
                  world.height, world.pixels.data(), &info, DIB_RGB_COLORS, SRCCOPY);
}
struct GameWindow {
    VM *vm;
    std::chrono::steady_clock::time_point previous;
    double accumulator = 0;
    std::string failure;
};
LRESULT CALLBACK gameProc(HWND window, UINT message, WPARAM w, LPARAM l) {
    auto *state = reinterpret_cast<GameWindow *>(GetWindowLongPtrW(window, GWLP_USERDATA));
    if (message == WM_NCCREATE) {
        state = static_cast<GameWindow *>(reinterpret_cast<CREATESTRUCTW *>(l)->lpCreateParams);
        SetWindowLongPtrW(window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(state));
    }
    if (!state)
        return DefWindowProcW(window, message, w, l);
    if (message == WM_ERASEBKGND)
        return 1;
    if (message == WM_TIMER) {
        try {
            auto now = std::chrono::steady_clock::now();
            state->accumulator += std::min(.1, std::chrono::duration<double>(now - state->previous).count());
            state->previous = now;
            bool changed = false;
            while (state->accumulator >= 1.0 / 60) {
                state->vm->instructions = 0;
                state->vm->cancelled();
                state->vm->tick(1.0 / 60);
                state->accumulator -= 1.0 / 60;
                changed = true;
            }
            if (changed) {
                state->vm->render();
                InvalidateRect(window, nullptr, FALSE);
            }
        } catch (const std::exception &e) {
            state->failure = e.what();
            DestroyWindow(window);
        }
        return 0;
    }
    if (message == WM_PAINT) {
        PAINTSTRUCT paint;
        auto dc = BeginPaint(window, &paint);
        RECT rect;
        GetClientRect(window, &rect);
        paintFrame(dc, rect, state->vm->world);
        EndPaint(window, &paint);
        return 0;
    }
    if (message == WM_DESTROY) {
        KillTimer(window, 1);
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(window, message, w, l);
}
std::vector<unsigned char> tone;
unsigned int audioChannel = 0;
int audioVolume = 85;
void synth(const std::string &tag) {
    PlaySoundW(nullptr, nullptr, 0);
    constexpr int rate = 22050, frames = 4400;
    int bytes = frames * 2;
    tone.assign(44 + bytes, 0);
    auto put = [&](int at, uint32_t value, int count) {
        for (int i = 0; i < count; i++)
            tone[at + i] = static_cast<unsigned char>(value >> (i * 8));
    };
    const char *riff = "RIFF";
    std::copy(riff, riff + 4, tone.begin());
    put(4, 36 + bytes, 4);
    const char *fmt = "WAVEfmt ";
    std::copy(fmt, fmt + 8, tone.begin() + 8);
    put(16, 16, 4);
    put(20, 1, 2);
    put(22, 1, 2);
    put(24, rate, 4);
    put(28, rate * 2, 4);
    put(32, 2, 2);
    put(34, 16, 2);
    const char *data = "data";
    std::copy(data, data + 4, tone.begin() + 36);
    put(40, bytes, 4);
    double freq = tag.find("crash") != std::string::npos  ? 120
                  : tag.find("coin") != std::string::npos ? 1050
                                                          : 660;
    for (int i = 0; i < frames; i++) {
        double envelope = 1 - double(i) / frames;
        int16_t sample =
            int16_t(std::sin(6.283185307 * freq * i / rate) * envelope * 6500 * audioVolume / 100);
        put(44 + i * 2, uint16_t(sample), 2);
    }
    PlaySoundW(reinterpret_cast<LPCWSTR>(tone.data()), nullptr, SND_MEMORY | SND_ASYNC | SND_NODEFAULT);
}
} // namespace
void nativeGame(VM &vm) {
    auto module = GetModuleHandleW(nullptr);
    WNDCLASSW cls{};
    cls.lpfnWndProc = gameProc;
    cls.hInstance = module;
    cls.lpszClassName = L"JimsabzGame";
    cls.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    RegisterClassW(&cls);
    RECT rect{0, 0, vm.world.width, vm.world.height};
    AdjustWindowRect(&rect, WS_OVERLAPPEDWINDOW, FALSE);
    GameWindow state{&vm, std::chrono::steady_clock::now()};
    auto window = CreateWindowExW(
        0, cls.lpszClassName, wide(vm.world.title).c_str(), WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT,
        CW_USEDEFAULT, rect.right - rect.left, rect.bottom - rect.top, nullptr, nullptr, module, &state);
    if (!window)
        throw std::runtime_error("Cannot create the native game window.");
    vm.io.key = [window](const std::string &key) {
        int vk = virtualKey(key);
        return GetForegroundWindow() == window && vk && (GetAsyncKeyState(vk) & 0x8000) != 0;
    };
    vm.io.mouse = [window]() {
        POINT p;
        GetCursorPos(&p);
        ScreenToClient(window, &p);
        RECT r;
        GetClientRect(window, &r);
        return std::pair<int, int>{p.x, p.y};
    };
    vm.render();
    SetTimer(window, 1, 8, nullptr);
    MSG msg;
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    stopSound();
    if (!state.failure.empty())
        throw std::runtime_error(state.failure);
}
void nativeSound(const fs::path &path, const std::string &tag, bool loop) {
    if (fs::is_regular_file(path)) {
        std::wstring alias = loop ? L"jim_music" : L"jim_fx" + std::to_wstring(audioChannel++ % 4);
        mciSendStringW((L"close " + alias).c_str(), nullptr, 0, nullptr);
        auto open = L"open \"" + path.wstring() + L"\" alias " + alias;
        if (mciSendStringW(open.c_str(), nullptr, 0, nullptr) == 0) {
            mciSendStringW(
                (L"setaudio " + alias + L" volume to " + std::to_wstring(audioVolume * 10)).c_str(), nullptr,
                0, nullptr);
            mciSendStringW((L"play " + alias + (loop ? L" repeat" : L"")).c_str(), nullptr, 0, nullptr);
            return;
        }
    }
    synth(tag);
}
void stopSound() {
    PlaySoundW(nullptr, nullptr, 0);
    mciSendStringW(L"close jim_music", nullptr, 0, nullptr);
    for (int i = 0; i < 4; i++)
        mciSendStringW((L"close jim_fx" + std::to_wstring(i)).c_str(), nullptr, 0, nullptr);
}
void nativeVolume(int volume) {
    audioVolume = volume;
    mciSendStringW((L"setaudio jim_music volume to " + std::to_wstring(volume * 10)).c_str(), nullptr, 0,
                   nullptr);
}
void mentor(bool success, const fs::path &root) {
    auto filename = root / "assets" / "voice" / (success ? "haan_sahee_aa_na.wav" : "sahee_na_tu_kari.wav");
    if (fs::is_regular_file(filename)) {
        PlaySoundW(filename.c_str(), nullptr, SND_FILENAME | SND_ASYNC | SND_NODEFAULT);
        return;
    }
    // SAPI uses the installed Windows voice. Authentic Sindhi recordings can override it.
    static ISpVoice *voice = nullptr;
    static bool initialized = false;
    if (!initialized) {
        initialized = true;
        CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        CoCreateInstance(CLSID_SpVoice, nullptr, CLSCTX_ALL, IID_ISpVoice, reinterpret_cast<void **>(&voice));
    }
    if (voice)
        voice->Speak(success ? L"Haan, sahee aa na!" : L"Sahee na tu kari!", SPF_ASYNC | SPF_PURGEBEFORESPEAK,
                     nullptr);
}
#else
void nativeGame(VM &) {
    throw std::runtime_error(
        "Native windows are available in the Windows build. Use --headless N --frame path.ppm here.");
}
void nativeSound(const fs::path &, const std::string &, bool) {}
void stopSound() {}
void nativeVolume(int) {}
void mentor(bool, const fs::path &) {}

#endif
} // namespace jim
