#include "jimsabz.hpp"
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <sys/socket.h>
#include <arpa/inet.h>
#include <fcntl.h>
#include <unistd.h>
#endif

namespace jim {
struct Network {
#ifdef _WIN32
    SOCKET socket = INVALID_SOCKET;
    Network() {
        WSADATA data;
        if (WSAStartup(MAKEWORD(2, 2), &data) != 0)
            throw std::runtime_error("Cannot start Winsock.");
    }
    ~Network() {
        if (socket != INVALID_SOCKET)
            closesocket(socket);
        WSACleanup();
    }
#else
    int socket = -1;
    ~Network() {
        if (socket >= 0)
            ::close(socket);
    }
#endif
    sockaddr_in peer{};
    bool connected = false;
};
Value networkCall(VM &vm, const std::string &method, const std::vector<Value> &args) {
    if (method == "close") {
        vm.network.reset();
        return {};
    }
    auto port = [&](size_t i) {
        if (i >= args.size() || args[i].kind != Value::Integer || args[i].integer < 1024 ||
            args[i].integer > 65535)
            throw std::runtime_error("LAN port must be an adad from 1024 to 65535.");
        return uint16_t(args[i].integer);
    };
    if (method == "host" || method == "connect") {
        auto n = std::make_shared<Network>();
        n->socket = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
#ifdef _WIN32
        if (n->socket == INVALID_SOCKET)
            throw std::runtime_error("Cannot create LAN socket.");
        u_long enabled = 1;
        if (ioctlsocket(n->socket, FIONBIO, &enabled) != 0)
            throw std::runtime_error("Cannot configure non-blocking LAN socket.");
#else
        if (n->socket < 0 || fcntl(n->socket, F_SETFL, O_NONBLOCK) < 0)
            throw std::runtime_error("Cannot create non-blocking LAN socket.");
#endif
        if (method == "host") {
            sockaddr_in address{};
            address.sin_family = AF_INET;
            address.sin_addr.s_addr = htonl(INADDR_ANY);
            address.sin_port = htons(port(0));
            if (bind(n->socket, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0)
                throw std::runtime_error("Cannot bind LAN port; it may already be in use.");
        } else {
            n->peer.sin_family = AF_INET;
            n->peer.sin_port = htons(port(1));
            if (args.empty() || inet_pton(AF_INET, args[0].str().c_str(), &n->peer.sin_addr) != 1)
                throw std::runtime_error("connect expects an IPv4 address, for example 127.0.0.1.");
            n->connected = true;
        }
        vm.network = std::move(n);
        return {};
    }
    auto n = vm.network;
    if (!n)
        throw std::runtime_error("Call shabak.host(port) or shabak.connect(ip, port) first.");
    if (method == "send") {
        if (args.size() != 1 || !n->connected)
            throw std::runtime_error("A LAN peer must connect and send a packet before the host can reply.");
        auto data = args[0].str();
        if (data.size() > 60000)
            throw std::runtime_error("LAN packets must be at most 60000 bytes.");
        auto result = sendto(n->socket, data.data(), int(data.size()), 0,
                             reinterpret_cast<sockaddr *>(&n->peer), sizeof(n->peer));
        if (result < 0)
            throw std::runtime_error("LAN packet could not be sent.");
        return {};
    }
    if (method == "receive") {
        char bytes[60001];
        sockaddr_in sender{};
#ifdef _WIN32
        int size = sizeof(sender);
#else
        socklen_t size = sizeof(sender);
#endif
        auto count = recvfrom(n->socket, bytes, 60000, 0, reinterpret_cast<sockaddr *>(&sender), &size);
        if (count < 0)
            return Value::s("");
        if (n->connected &&
            (sender.sin_addr.s_addr != n->peer.sin_addr.s_addr || sender.sin_port != n->peer.sin_port))
            return Value::s("");
        n->peer = sender;
        n->connected = true;
        return Value::s(std::string(bytes, size_t(count)));
    }
    throw std::runtime_error("Unknown LAN operation.");
}
} // namespace jim
