#include "jimsabz.hpp"
#include <fstream>
#include <cstring>
#include <cstdlib>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#else
#include <unistd.h>
#endif

namespace jim {
namespace {
constexpr size_t limit = 64 * 1024 * 1024;
uint32_t checksum(const std::string &bytes) {
    uint32_t crc = 0xffffffff;
    for (unsigned char b : bytes) {
        crc ^= b;
        for (int i = 0; i < 8; i++)
            crc = (crc >> 1) ^ (0xedb88320u & uint32_t(-int(crc & 1)));
    }
    return ~crc;
}
struct Writer {
    std::string bytes;
    void u32(uint32_t x) {
        for (int i = 0; i < 4; i++)
            bytes += char((x >> (i * 8)) & 255);
    }
    void u64(uint64_t x) {
        for (int i = 0; i < 8; i++)
            bytes += char((x >> (i * 8)) & 255);
    }
    void str(const std::string &s) {
        if (s.size() > limit)
            throw std::runtime_error("Bytecode string too large.");
        u32(uint32_t(s.size()));
        bytes += s;
    }
    void params(const std::vector<std::pair<std::string, std::string>> &v) {
        u32(uint32_t(v.size()));
        for (auto &p : v) {
            str(p.first);
            str(p.second);
        }
    }
    void code(const std::vector<Ins> &v) {
        u32(uint32_t(v.size()));
        for (auto &i : v) {
            u32(static_cast<uint32_t>(i.op));
            u32(uint32_t(i.a));
            str(i.text);
            str(i.at.file);
            u32(i.at.line);
            u32(i.at.col);
        }
    }
};
struct Reader {
    const std::string &bytes;
    size_t pos = 0;
    int format = 2;
    uint32_t u32() {
        if (pos + 4 > bytes.size())
            throw std::runtime_error("Truncated bytecode.");
        uint32_t n = 0;
        for (int i = 0; i < 4; i++)
            n |= uint32_t(static_cast<unsigned char>(bytes[pos++])) << (i * 8);
        return n;
    }
    uint64_t u64() {
        auto lo = u32();
        return uint64_t(lo) | (uint64_t(u32()) << 32);
    }
    uint32_t count(uint32_t max = 1000000) {
        auto n = u32();
        if (n > max)
            throw std::runtime_error("Bytecode count exceeds the format limit.");
        return n;
    }
    std::string str() {
        auto n = count(uint32_t(limit));
        if (pos + n > bytes.size())
            throw std::runtime_error("Truncated bytecode string.");
        auto s = bytes.substr(pos, n);
        pos += n;
        return s;
    }
    std::vector<std::pair<std::string, std::string>> params() {
        std::vector<std::pair<std::string, std::string>> v;
        auto n = count(4096);
        for (uint32_t i = 0; i < n; i++) {
            auto t = str();
            auto name = str();
            v.push_back({t, name});
        }
        return v;
    }
    std::vector<Ins> code() {
        std::vector<Ins> v;
        auto n = count();
        v.reserve(n);
        for (uint32_t j = 0; j < n; j++) {
            Ins i;
            auto op = u32();
            if (op > static_cast<uint32_t>(format>=3?Op::Await:Op::Read))
                throw std::runtime_error("Unknown bytecode opcode.");
            i.op = static_cast<Op>(op);
            i.a = int32_t(u32());
            i.text = str();
            i.at.file = str();
            i.at.line = int(count(10000000));
            i.at.col = int(count(10000000));
            if ((i.op == Op::Jump || i.op == Op::JumpFalse || i.op == Op::JumpTrue || i.op == Op::Try) &&
                (i.a < 0 || uint32_t(i.a) > n))
                throw std::runtime_error("Invalid bytecode jump target.");
            if ((i.op == Op::Call || i.op == Op::Method || i.op == Op::New || i.op == Op::Array ||
                 i.op == Op::Vector || i.op == Op::Entity || i.op == Op::Bind || i.op == Op::Unwind) &&
                (i.a < 0 || i.a > 1000000))
                throw std::runtime_error("Invalid bytecode argument count.");
            v.push_back(std::move(i));
        }
        return v;
    }
};
std::string readFile(const fs::path &path) {
    std::ifstream f(path, std::ios::binary);
    if (!f)
        throw std::runtime_error("Cannot open " + path.string());
    auto size = fs::file_size(path);
    if (size > 512 * 1024 * 1024)
        throw std::runtime_error("File is too large.");
    return {std::istreambuf_iterator<char>(f), {}};
}
void writeFile(const fs::path &path, const std::string &bytes) {
    if (!path.parent_path().empty())
        fs::create_directories(path.parent_path());
    std::ofstream f(path, std::ios::binary);
    if (!f || !f.write(bytes.data(), std::streamsize(bytes.size())))
        throw std::runtime_error("Cannot write " + path.string());
}
} // namespace
std::string encodeBytecode(const Program &p) {
    Writer w;
    w.str(p.title);
    w.str(p.root);
    w.code(p.code);
    w.u32(uint32_t(p.functions.size()));
    for (auto &kv : p.functions) {
        auto &f = kv.second;
        w.str(kv.first);
        w.str(f.result);
        w.str(f.owner);
        w.params(f.params);
        w.code(f.code);
        if(p.format>=3) {
            w.u32((f.variadic?1:0)|(f.asynchronous?2:0));w.str(f.signature);
            w.u32(uint32_t(f.defaults.size()));for(auto &code:f.defaults)w.code(code);
        }
    }
    w.u32(uint32_t(p.classes.size()));
    for (auto &kv : p.classes) {
        w.str(kv.first);
        w.params(kv.second);
    }
    w.u32(uint32_t(p.assets.size()));
    for (auto &asset : p.assets)
        w.str(asset);
    if(p.format>=3) {
        w.u32(uint32_t(p.classes.size()));
        for(auto &cls:p.classes) {
            w.str(cls.first);auto flags=p.typeFlags.find(cls.first);w.u32(flags==p.typeFlags.end()?0:flags->second);
            auto found=p.parents.find(cls.first);w.u32(found==p.parents.end()?0:uint32_t(found->second.size()));
            if(found!=p.parents.end())for(auto &parent:found->second)w.str(parent);
        }
    }
    if (w.bytes.size() > limit)
        throw std::runtime_error("Bytecode exceeds 64 MiB.");
    Writer out;
    out.bytes = p.format>=3?"JIMJBC3\n":"JIMJBC2\n";
    out.u32(uint32_t(w.bytes.size()));
    out.u32(checksum(w.bytes));
    out.bytes += w.bytes;
    return out.bytes;
}
Program decodeBytecode(const std::string &bytes) {
    bool version3=bytes.size()>=8&&bytes.substr(0,8)=="JIMJBC3\n";
    if (bytes.size() < 16 || bytes.size() > limit + 16 || (!version3&&bytes.substr(0, 8) != "JIMJBC2\n"))
        throw std::runtime_error("Unsupported Jimsabz bytecode format (expected JBC2 or JBC3).");
    Reader h{bytes, 8};
    auto size = h.u32(), crc = h.u32();
    if (size != bytes.size() - 16)
        throw std::runtime_error("Bytecode length mismatch.");
    auto payload = bytes.substr(16);
    if (checksum(payload) != crc)
        throw std::runtime_error("Bytecode checksum mismatch; rebuild this file.");
    Reader r{payload,0,version3?3:2};
    Program p;p.format=version3?3:2;
    p.title = r.str();
    p.root = r.str();
    p.code = r.code();
    auto n = r.count(65536);
    for (uint32_t i = 0; i < n; i++) {
        Function f;
        f.name = r.str();
        f.result = r.str();
        f.owner = r.str();
        f.params = r.params();
        f.code = r.code();
        if(version3) {
            auto flags=r.u32();if(flags>3)throw std::runtime_error("Unknown function flags.");
            f.variadic=flags&1;f.asynchronous=flags&2;f.signature=r.str();
            auto count=r.count(4096);if(count>f.params.size())throw std::runtime_error("Too many default parameters.");
            for(uint32_t j=0;j<count;++j)f.defaults.push_back(r.code());
        }
        if (!p.functions.emplace(f.name, f).second)
            throw std::runtime_error("Duplicate bytecode function.");
    }
    n = r.count(4096);
    for (uint32_t i = 0; i < n; i++) {
        auto name = r.str();
        auto params = r.params();
        if(!p.classes.emplace(name,std::move(params)).second)throw std::runtime_error("Duplicate bytecode class.");
    }
    n = r.count(10000);
    for (uint32_t i = 0; i < n; i++)
        p.assets.push_back(r.str());
    if(version3) {
        n=r.count(4096);std::set<std::string> seen;
        for(uint32_t i=0;i<n;++i) {
            auto name=r.str();if(!p.classes.count(name)||!seen.insert(name).second)throw std::runtime_error("Invalid class metadata.");
            auto flags=r.u32();if(flags>3)throw std::runtime_error("Unknown class flags.");p.typeFlags[name]=flags;
            auto count=r.count(4096);for(uint32_t j=0;j<count;++j)p.parents[name].push_back(r.str());
        }
    }
    if (r.pos != payload.size())
        throw std::runtime_error("Unexpected bytecode trailing data.");
    verifyBytecode(p);return p;
}
void writeBytecode(const Program &p, const fs::path &path) { writeFile(path, encodeBytecode(p)); }
Program readBytecode(const fs::path &path) {
    auto p = decodeBytecode(readFile(path));
    auto directory = fs::absolute(path).parent_path(), candidate = directory;
    bool located = false;
    while (!candidate.empty()) {
        if (fs::is_regular_file(candidate / "jimsabz.json")) {
            p.root = candidate.string();
            located = true;
            break;
        }
        auto next = candidate.parent_path();
        if (next == candidate)
            break;
        candidate = next;
    }
    if (!located && !fs::is_directory(p.root))
        p.root = directory.string();
    return p;
}
fs::path executablePath() {
#ifdef _WIN32
    std::wstring result(32768, L'\0');
    auto size = GetModuleFileNameW(nullptr, result.data(), DWORD(result.size()));
    result.resize(size);
    return fs::path(result);
#else
    std::string path(32768, '\0');
    auto len = readlink("/proc/self/exe", path.data(), path.size());
    if (len <= 0)
        throw std::runtime_error("Cannot locate executable.");
    path.resize(size_t(len));
    return fs::path(path);
#endif
}
void buildExecutable(const Program &p, const fs::path &host, const fs::path &output) {
    if (fs::weakly_canonical(host) == fs::weakly_canonical(output))
        throw std::runtime_error("Choose an output filename different from the compiler executable.");
    Writer bundle;
    bundle.str(encodeBytecode(p));
    bundle.u32(uint32_t(p.assets.size()));
    auto root = fs::weakly_canonical(p.root);
    for (auto &name : p.assets) {
        auto path = fs::weakly_canonical(root / fs::u8path(name));
        auto rel = path.lexically_relative(root);
        if (rel.empty() || *rel.begin() == "..")
            throw std::runtime_error("Asset leaves project folder.");
        bundle.str(rel.generic_string());
        bundle.str(readFile(path));
    }
    auto bytes = readFile(host);
    bytes += bundle.bytes;
    bytes += "JIMEXE2!";
    Writer length;
    length.u64(bundle.bytes.size());
    bytes += length.bytes;
    writeFile(output, bytes);
#ifndef _WIN32
    fs::permissions(output, fs::perms::owner_exec | fs::perms::group_exec | fs::perms::others_exec,
                    fs::perm_options::add);
#endif
}
bool readEmbedded(const fs::path &path, Program &p) {
    std::ifstream f(path, std::ios::binary);
    if (!f)
        return false;
    f.seekg(0, std::ios::end);
    auto len = f.tellg();
    if (len < 16)
        return false;
    f.seekg(len - std::streamoff(16));
    std::string trailer(16, '\0');
    f.read(trailer.data(), 16);
    if (trailer.substr(0, 8) != "JIMEXE2!")
        return false;
    Reader tail{trailer, 8};
    auto size = tail.u64();
    if (size > 256 * 1024 * 1024 || size > uint64_t(len) - 16)
        throw std::runtime_error("Invalid executable payload.");
    f.seekg(len - std::streamoff(16 + size));
    std::string payload(size, '\0');
    f.read(payload.data(), std::streamsize(size));
    Reader r{payload};
    p = decodeBytecode(r.str());
    auto root = fs::temp_directory_path() / ("jimsabz-" + std::to_string(checksum(payload)));
    // Use a fresh per-run directory; existing entries or symlinks are never trusted.
    auto stamp = std::chrono::steady_clock::now().time_since_epoch().count();
    root += "-" + std::to_string(stamp);
    fs::create_directory(root);
    auto count = r.count(10000);
    for (uint32_t i = 0; i < count; i++) {
        auto name = r.str(), data = r.str();
        fs::path rel = fs::u8path(name);
        if (rel.empty() || rel.is_absolute())
            throw std::runtime_error("Invalid embedded asset path.");
        for (const auto &part : rel)
            if (part == "..")
                throw std::runtime_error("Invalid embedded asset path.");
        writeFile(root / rel, data);
    }
    if (r.pos != payload.size())
        throw std::runtime_error("Invalid executable trailer.");
    p.root = root.string();
    auto identity =
        std::to_string(checksum(p.title + ":" + (p.code.empty() ? "main" : p.code.front().at.file)));
#ifdef _WIN32
    std::wstring appData(32768, L'\0');
    auto envSize = GetEnvironmentVariableW(L"LOCALAPPDATA", appData.data(), DWORD(appData.size()));
    if (envSize > 0 && envSize < appData.size()) {
        appData.resize(envSize);
        p.dataRoot = (fs::path(appData) / "Jimsabz" / "Games" / identity).string();
    }
#else
    auto data = std::getenv("XDG_DATA_HOME"), home = std::getenv("HOME");
    auto base = data   ? fs::path(data)
                : home ? fs::path(home) / ".local" / "share"
                       : fs::temp_directory_path();
    p.dataRoot = (base / "Jimsabz" / "Games" / identity).string();
#endif
    if (p.dataRoot.empty())
        p.dataRoot = (fs::temp_directory_path() / "Jimsabz-Saves" / identity).string();
    return true;
}
} // namespace jim
