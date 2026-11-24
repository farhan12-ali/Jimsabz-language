// Native dependency-free host for the Jimsabz Studio interface.
// The compiler, VM and exported game renderer remain native C++.
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#else
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <unistd.h>
#endif
#include "jimsabz.hpp"
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <cctype>

namespace jim {
namespace {
#ifdef _WIN32
using Socket = SOCKET;
constexpr Socket noSocket = INVALID_SOCKET;
void closeSocket(Socket s) { closesocket(s); }
#else
using Socket = int;
constexpr Socket noSocket = -1;
void closeSocket(Socket s) { close(s); }
#endif
struct SocketOwner {
    Socket value = noSocket;
    ~SocketOwner() {
        if (value != noSocket)
            closeSocket(value);
    }
};
std::string readFile(const fs::path &path) {
    std::ifstream input(path, std::ios::binary);
    if (!input)
        throw std::runtime_error("Cannot read " + path.u8string());
    return std::string(std::istreambuf_iterator<char>(input), {});
}
std::string jsonString(const std::string &text) {
    std::string out = "\"";
    const char *hex = "0123456789abcdef";
    for (unsigned char ch : text) {
        if (ch == '\\' || ch == '"') {
            out += '\\';
            out += char(ch);
        } else if (ch < 32) {
            out += "\\u00";
            out += hex[ch >> 4];
            out += hex[ch & 15];
        } else
            out += char(ch);
    }
    return out + "\"";
}
std::string decodePath(const std::string &path) {
    std::string out;
    for (size_t i = 0; i < path.size(); i++) {
        char ch = path[i];
        if (ch == '%') {
            if (i + 2 >= path.size())
                throw std::runtime_error("Bad URL");
            auto digit = [](char c) -> int {
                if (c >= '0' && c <= '9')
                    return c - '0';
                if (c >= 'a' && c <= 'f')
                    return c - 'a' + 10;
                if (c >= 'A' && c <= 'F')
                    return c - 'A' + 10;
                return -1;
            };
            int a = digit(path[i + 1]), b = digit(path[i + 2]);
            if (a < 0 || b < 0)
                throw std::runtime_error("Bad URL");
            ch = char(a * 16 + b);
            i += 2;
        }
        if (ch == 0 || ch == '\\')
            throw std::runtime_error("Bad path");
        out += ch;
    }
    return out;
}
std::string mime(const fs::path &file) {
    auto ext = file.extension().string();
    if (ext == ".html")
        return "text/html; charset=utf-8";
    if (ext == ".mjs" || ext == ".js")
        return "text/javascript; charset=utf-8";
    if (ext == ".css")
        return "text/css; charset=utf-8";
    if (ext == ".json")
        return "application/json; charset=utf-8";
    if (ext == ".svg")
        return "image/svg+xml";
    if (ext == ".png")
        return "image/png";
    if (ext == ".jpg" || ext == ".jpeg")
        return "image/jpeg";
    if (ext == ".zip")
        return "application/zip";
    return "application/octet-stream";
}
bool sendAll(Socket socket, const std::string &text) {
    size_t offset = 0;
    while (offset < text.size()) {
        int count = send(socket, text.data() + offset, int(std::min<size_t>(65536, text.size() - offset)),
#ifdef _WIN32
                         0
#else
                         MSG_NOSIGNAL
#endif
        );
        if (count <= 0)
            return false;
        offset += size_t(count);
    }
    return true;
}
void response(Socket socket, const std::string &body, const std::string &type = "text/plain",
              int code = 200) {
    std::string head = "HTTP/1.1 " + std::to_string(code) + (code == 200 ? " OK" : " Error") +
                       "\r\nContent-Type: " + type + "\r\nContent-Length: " + std::to_string(body.size()) +
                       "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: "
                       "nosniff\r\nReferrer-Policy: no-referrer\r\n\r\n";
    if (sendAll(socket, head))
        sendAll(socket, body);
}
std::map<std::string, std::string> headers(const std::string &request) {
    std::map<std::string, std::string> out;
    std::istringstream input(request.substr(0, request.find("\r\n\r\n")));
    std::string line;
    std::getline(input, line);
    while (std::getline(input, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        auto colon = line.find(':');
        if (colon == std::string::npos) continue;
        auto name = line.substr(0, colon), value = line.substr(colon + 1);
        std::transform(name.begin(), name.end(), name.begin(), [](unsigned char c) { return char(std::tolower(c)); });
        while (!value.empty() && value.front() == ' ') value.erase(value.begin());
        while (!value.empty() && value.back() == ' ') value.pop_back();
        if (!out.emplace(name, value).second) throw std::runtime_error("Duplicate header");
    }
    return out;
}
} // namespace
int launchStudio(const std::string &sourceFile) {
#ifdef _WIN32
    struct Winsock {
        Winsock() {
            WSADATA data;
            if (WSAStartup(MAKEWORD(2, 2), &data))
                throw std::runtime_error("Cannot start local Studio networking.");
        }
        ~Winsock() { WSACleanup(); }
    } winsock;
#endif
    fs::path app = executablePath().parent_path(), root;
    for (const auto &candidate :
         {app / "studio", app.parent_path() / "studio", fs::current_path() / "studio"})
        if (fs::is_regular_file(candidate / "index.html")) {
            root = fs::canonical(candidate);
            break;
        }
    if (root.empty())
        throw std::runtime_error(
            "The studio folder is missing. Extract the complete Jimsabz Studio ZIP before starting.");
    std::string startup = "{}";
    if (!sourceFile.empty()) {
        auto file = fs::absolute(fs::u8path(sourceFile));
        if (file.extension() != ".jimsabz")
            throw std::runtime_error("Open a .jimsabz source file in Studio.");
        startup = "{\"name\":" + jsonString(file.filename().u8string()) +
                  ",\"text\":" + jsonString(readFile(file)) + "}";
    }
    SocketOwner server;
    server.value = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (server.value == noSocket)
        throw std::runtime_error("Cannot open the local Studio service.");
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = htons(45425);
    if (bind(server.value, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0) {
        address.sin_port = 0;
        if (bind(server.value, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0)
            throw std::runtime_error("Cannot bind the local Studio service.");
    }
#ifdef _WIN32
    int length = sizeof(address);
#else
    socklen_t length = sizeof(address);
#endif
    getsockname(server.value, reinterpret_cast<sockaddr *>(&address), &length);
    const std::string host = "127.0.0.1:" + std::to_string(ntohs(address.sin_port));
    const std::string url = "http://" + host + "/?desktop=1";
    if (listen(server.value, 12) != 0)
        throw std::runtime_error("Cannot listen for the local Studio window.");
    std::cout << "Jimsabz Studio: " << url << "\nKeep this launcher open while using Studio.\n" << std::flush;
#ifdef _WIN32
    auto wide = std::wstring(url.begin(), url.end());
    if (reinterpret_cast<intptr_t>(
            ShellExecuteW(nullptr, L"open", wide.c_str(), nullptr, nullptr, SW_SHOWNORMAL)) <= 32)
        MessageBoxW(nullptr, wide.c_str(), L"Open this address in your browser", MB_OK | MB_ICONINFORMATION);
#else
    if (!std::getenv("JIMSABZ_NO_BROWSER")) {
        auto child = fork();
        if (child == 0) {
            execlp("xdg-open", "xdg-open", url.c_str(), nullptr);
            _exit(0);
        }
    }
#endif
    using Clock = std::chrono::steady_clock;
    auto heartbeat = Clock::now();
    bool connected = false;
    while (std::chrono::duration_cast<std::chrono::seconds>(Clock::now() - heartbeat).count() <
           (connected ? 90 : 180)) {

        fd_set ready;
        FD_ZERO(&ready);
        FD_SET(server.value, &ready);
        timeval wait{1, 0};
        if (select(int(server.value) + 1, &ready, nullptr, nullptr, &wait) <= 0)
            continue;
        SocketOwner client;
        client.value = accept(server.value, nullptr, nullptr);
        if (client.value == noSocket)
            continue;
#ifdef _WIN32
        DWORD timeout = 2000;
        setsockopt(client.value, SOL_SOCKET, SO_RCVTIMEO, reinterpret_cast<const char *>(&timeout),
                   sizeof(timeout));
#else
        timeval timeout{2, 0};
        setsockopt(client.value, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
#endif
        std::string request;
        char buffer[4096];
        while (request.find("\r\n\r\n") == std::string::npos && request.size() < 65536) {
            int count = recv(client.value, buffer, sizeof(buffer), 0);
            if (count <= 0)
                break;
            request.append(buffer, size_t(count));
        }
        try {
            std::istringstream line(request);
            std::string method, path, protocol;
            line >> method >> path >> protocol;
            // Bind to loopback and reject cross-host requests (including DNS rebinding).
            auto metadata = headers(request);
            if (metadata["host"] != host) {
                response(client.value, "Invalid local host.", "text/plain", 403);
                continue;
            }
            path = decodePath(path.substr(0, path.find('?')));
            if (method != "GET") {
                response(client.value, "Only GET is supported for project assets.", "text/plain", 405); continue;
            }
            if (path == "/__heartbeat") {
                heartbeat = Clock::now();
                connected = true;
                response(client.value, "ok");
                continue;
            }
            if (path == "/__startup") {
                response(client.value, startup, "application/json; charset=utf-8");
                continue;
            }
            if (path == "/")
                path = "/index.html";
            auto candidate = fs::weakly_canonical(root / fs::u8path(path.substr(1)));
            auto relative = fs::relative(candidate, root);
            if (relative.empty() || *relative.begin() == ".." || !fs::is_regular_file(candidate) ||
                fs::file_size(candidate) > 256 * 1024 * 1024) {
                response(client.value, "Not found.", "text/plain", 404);
                continue;
            }
            response(client.value, readFile(candidate), mime(candidate));
        } catch (const std::exception &) {
            response(client.value, "Invalid request.", "text/plain", 400);
        }
    }
    return 0;
}
} // namespace jim
