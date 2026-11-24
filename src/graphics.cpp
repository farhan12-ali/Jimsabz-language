#include "jimsabz.hpp"
#include <fstream>
#include <limits>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#include <wincodec.h>
#endif

namespace jim {
namespace {
double num(const Value &v, const std::string &n, double d = 0) { return field(v, n, Value::d(d)).numeric(); }
Value vector(double x, double y, double z = 0, bool three = false) {
    auto v = Value::obj(three ? "vec3" : "vec2");
    setField(v, "x", Value::d(x), "dec");
    setField(v, "y", Value::d(y), "dec");
    if (three)
        setField(v, "z", Value::d(z), "dec");
    return v;
}
void position(Value &actor, double x, double y, double z = 0, bool three = false) {
    setField(actor, three ? "jagah3d" : "jagah", vector(x, y, z, three));
}
bool visible(const Actor &a, const World &w) {
    auto scene = field(a.data, "__scene", Value::s("")).str();
    return field(a.data, "visible", Value::b(true)).truth() && (scene.empty() || scene == w.scene);
}
struct V3 {
    double x = 0, y = 0, z = 0;
    V3 operator+(V3 b) const { return {x + b.x, y + b.y, z + b.z}; }
    V3 operator-(V3 b) const { return {x - b.x, y - b.y, z - b.z}; }
    V3 operator*(double t) const { return {x * t, y * t, z * t}; }
};
V3 cross(V3 a, V3 b) { return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x}; }
double dot(V3 a, V3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
V3 normalize(V3 a) {
    auto length = std::sqrt(dot(a, a));
    return length < 1e-12 ? V3{0, 0, -1} : a * (1 / length);
}
V3 v3(const Value &v, V3 fallback = {}) {
    if (v.kind != Value::Record)
        return fallback;
    return {num(v, "x", fallback.x), num(v, "y", fallback.y), num(v, "z", fallback.z)};
}
void rectangle(World &w, int x, int y, int width, int height, uint32_t c) {
    int minx = std::max(0, x), miny = std::max(0, y), maxx = std::min(w.width, x + width),
        maxy = std::min(w.height, y + height);
    for (int yy = miny; yy < maxy; yy++)
        for (int xx = minx; xx < maxx; xx++)
            w.pixels[size_t(yy) * w.width + xx] = c;
}
const std::map<char, std::string> font = {
    {'A', "01110100011000111111100011000110001"}, {'B', "11110100011000111110100011000111110"},
    {'C', "01111100001000010000100001000001111"}, {'D', "11110100011000110001100011000111110"},
    {'E', "11111100001000011110100001000011111"}, {'F', "11111100001000011110100001000010000"},
    {'G', "01111100001000010111100011000101111"}, {'H', "10001100011000111111100011000110001"},
    {'I', "11111001000010000100001000010011111"}, {'J', "00111000100001000010100101001001100"},
    {'K', "10001100101010011000101001001010001"}, {'L', "10000100001000010000100001000011111"},
    {'M', "10001110111010110101100011000110001"}, {'N', "10001110011010110011100011000110001"},
    {'O', "01110100011000110001100011000101110"}, {'P', "11110100011000111110100001000010000"},
    {'Q', "01110100011000110001101011001001101"}, {'R', "11110100011000111110101001001010001"},
    {'S', "01111100001000001110000010000111110"}, {'T', "11111001000010000100001000010000100"},
    {'U', "10001100011000110001100011000101110"}, {'V', "10001100011000110001100010101000100"},
    {'W', "10001100011000110101101011101110001"}, {'X', "10001100010101000100010101000110001"},
    {'Y', "10001100010101000100001000010000100"}, {'Z', "11111000010001000100010001000011111"},
    {'0', "01110100011001110101110011000101110"}, {'1', "00100011000010000100001000010001110"},
    {'2', "01110100010000100010001000100011111"}, {'3', "11110000010000101110000010000111110"},
    {'4', "00010001100101010010111110001000010"}, {'5', "11111100001000011110000010000111110"},
    {'6', "01110100001000011110100011000101110"}, {'7', "11111000010001000100010000100001000"},
    {'8', "01110100011000101110100011000101110"}, {'9', "01110100011000101111000010000101110"},
    {':', "00000001000010000000001000010000000"}, {'-', "00000000000000011111000000000000000"},
    {'.', "00000000000000000000000000110001100"}, {'!', "00100001000010000100001000000000100"},
    {'/', "00001000100001000100010000100010000"}, {'+', "00000001000010011111001000010000000"},
    {'?', "01110100010000100010001000000000100"}};
void text(World &w, int x, int y, const std::string &s, uint32_t c, int scale = 2) {
    int start = x;
    for (unsigned char letter : s) {
        if (letter == '\n') {
            y += 9 * scale;
            x = start;
            continue;
        }
        char ch = char(std::toupper(letter));
        auto f = font.find(ch);
        if (f != font.end())
            for (int row = 0; row < 7; row++)
                for (int col = 0; col < 5; col++)
                    if (f->second[row * 5 + col] == '1')
                        rectangle(w, x + col * scale, y + row * scale, scale, scale, c);
        x += 6 * scale;
    }
}
uint32_t shade(uint32_t c, double light) {
    auto r = uint32_t(std::clamp(((c >> 16) & 255) * light, 0.0, 255.0)),
         g = uint32_t(std::clamp(((c >> 8) & 255) * light, 0.0, 255.0)),
         b = uint32_t(std::clamp((c & 255) * light, 0.0, 255.0));
    return 0xff000000 | (r << 16) | (g << 8) | b;
}
void sprite(World &w, const Image &image, int x, int y, int width, int height, int frame, int frames,
            bool flip) {
    if (width <= 0 || height <= 0 || image.width <= 0 || image.height <= 0)
        return;
    frames = std::max(1, frames);
    int sw = image.width / frames;
    if (sw < 1)
        return;
    frame = std::clamp(frame, 0, frames - 1);
    for (int yy = std::max(y, 0); yy < std::min(y + height, w.height); yy++)
        for (int xx = std::max(x, 0); xx < std::min(x + width, w.width); xx++) {
            int sx = (xx - x) * sw / width;
            if (flip)
                sx = sw - 1 - sx;
            int sy = (yy - y) * image.height / height;
            auto c = image.pixels[size_t(sy) * image.width + frame * sw + sx];
            auto alpha = (c >> 24) & 255;
            if (!alpha)
                continue;
            auto &dest = w.pixels[size_t(yy) * w.width + xx];
            if (alpha == 255) {
                dest = c;
                continue;
            }
            uint32_t red = (((c >> 16) & 255) * alpha + ((dest >> 16) & 255) * (255 - alpha)) / 255,
                     green = (((c >> 8) & 255) * alpha + ((dest >> 8) & 255) * (255 - alpha)) / 255,
                     blue = ((c & 255) * alpha + (dest & 255) * (255 - alpha)) / 255;
            dest = 0xff000000 | (red << 16) | (green << 8) | blue;
        }
}
std::vector<Face> primitive(const std::string &shape) {
    std::vector<Face> faces;
    auto triangle = [&](V3 a, V3 b, V3 c) {
        faces.push_back({{a.x, a.y, a.z, 0, 0}, {b.x, b.y, b.z, 1, 0}, {c.x, c.y, c.z, 0, 1}});
    };
    if (shape == "sphere") {
        const double pi = 3.141592653589793;
        auto sphere = [&](int lat, int lon) {
            double p = -pi / 2 + lat * pi / 8, t = lon * 2 * pi / 12;
            return V3{std::cos(p) * std::cos(t) * .5, std::sin(p) * .5, std::cos(p) * std::sin(t) * .5};
        };
        for (int lat = 0; lat < 8; lat++)
            for (int lon = 0; lon < 12; lon++) {
                auto a = sphere(lat, lon), b = sphere(lat + 1, lon), c = sphere(lat + 1, lon + 1),
                     d = sphere(lat, lon + 1);
                triangle(a, b, c);
                triangle(a, c, d);
            }
        return faces;
    }
    if (shape == "plane") {
        triangle({-.5, 0, -.5}, {.5, 0, -.5}, {.5, 0, .5});
        triangle({-.5, 0, -.5}, {.5, 0, .5}, {-.5, 0, .5});
        return faces;
    }
    if (shape == "pyramid") {
        V3 top{0, .7, 0}, a{-.5, -.3, -.5}, b{.5, -.3, -.5}, c{.5, -.3, .5}, d{-.5, -.3, .5};
        triangle(a, top, b);
        triangle(b, top, c);
        triangle(c, top, d);
        triangle(d, top, a);
        triangle(a, b, c);
        triangle(a, c, d);
        return faces;
    }
    V3 v[] = {{-.5, -.5, -.5}, {.5, -.5, -.5}, {.5, .5, -.5}, {-.5, .5, -.5},
              {-.5, -.5, .5},  {.5, -.5, .5},  {.5, .5, .5},  {-.5, .5, .5}};
    int quads[][4] = {{0, 3, 2, 1}, {4, 5, 6, 7}, {0, 1, 5, 4}, {3, 7, 6, 2}, {0, 4, 7, 3}, {1, 2, 6, 5}};
    for (auto &q : quads) {
        triangle(v[q[0]], v[q[1]], v[q[2]]);
        triangle(v[q[0]], v[q[2]], v[q[3]]);
    }
    return faces;
}
V3 transform(const Vertex &vertex, const Value &actor) {
    auto scale = v3(field(actor, "paimano"), {1, 1, 1}), rotation = v3(field(actor, "ghumao"));
    V3 v{vertex.x * scale.x, vertex.y * scale.y, vertex.z * scale.z};
    double rad = 3.141592653589793 / 180;
    double s = std::sin(rotation.x * rad), c = std::cos(rotation.x * rad);
    v = {v.x, v.y * c - v.z * s, v.y * s + v.z * c};
    s = std::sin(rotation.y * rad);
    c = std::cos(rotation.y * rad);
    v = {v.x * c + v.z * s, v.y, -v.x * s + v.z * c};
    s = std::sin(rotation.z * rad);
    c = std::cos(rotation.z * rad);
    v = {v.x * c - v.y * s, v.x * s + v.y * c, v.z};
    return v + v3(field(actor, "jagah3d"));
}
struct CV {
    V3 p;
    double u, v;
};
void raster(World &w, CV a, CV b, CV c, double focal, uint32_t rgb, const Image *texture, double lighting) {
    auto project = [&](CV v) {
        return V3{w.width * .5 + v.p.x * focal / v.p.z, w.height * .5 - v.p.y * focal / v.p.z, 1 / v.p.z};
    };
    auto p = project(a), q = project(b), r = project(c);
    if (!std::isfinite(p.x) || !std::isfinite(p.y) || !std::isfinite(q.x) || !std::isfinite(q.y) ||
        !std::isfinite(r.x) || !std::isfinite(r.y))
        return;
    auto edge = [](V3 a, V3 b, double x, double y) {
        return (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x);
    };
    double area = edge(p, q, r.x, r.y);
    if (std::abs(area) < .00001)
        return;
    int minx = int(std::clamp(std::floor(std::min({p.x, q.x, r.x})), 0.0, double(w.width - 1))),
        maxx = int(std::clamp(std::ceil(std::max({p.x, q.x, r.x})), 0.0, double(w.width - 1)));
    int miny = int(std::clamp(std::floor(std::min({p.y, q.y, r.y})), 0.0, double(w.height - 1))),
        maxy = int(std::clamp(std::ceil(std::max({p.y, q.y, r.y})), 0.0, double(w.height - 1)));
    for (int y = miny; y <= maxy; y++)
        for (int x = minx; x <= maxx; x++) {
            double wa = edge(q, r, x + .5, y + .5) / area, wb = edge(r, p, x + .5, y + .5) / area,
                   wc = 1 - wa - wb;
            if (wa < 0 || wb < 0 || wc < 0)
                continue;
            double invz = wa * p.z + wb * q.z + wc * r.z;
            if (invz <= 0)
                continue;
            double z = 1 / invz;
            auto index = size_t(y) * w.width + x;
            if (z >= w.depth[index])
                continue;
            uint32_t out = rgb;
            if (texture && texture->width > 0) {
                double u = (wa * a.u * p.z + wb * b.u * q.z + wc * c.u * r.z) * z,
                       v = (wa * a.v * p.z + wb * b.v * q.z + wc * c.v * r.z) * z;
                int tx = std::clamp(int(u * (texture->width - 1)), 0, texture->width - 1),
                    ty = std::clamp(int((1 - v) * (texture->height - 1)), 0, texture->height - 1);
                out = texture->pixels[size_t(ty) * texture->width + tx];
                if ((out >> 24) == 0)
                    continue;
                out = shade(out, lighting);
            }
            w.depth[index] = float(z);
            w.pixels[index] = out;
        }
}
std::pair<V3, V3> bounds(const Actor &actor) {
    auto localMin = v3(field(actor.data, "$boundsMin"), {-.5, -.5, -.5}),
         localMax = v3(field(actor.data, "$boundsMax"), {.5, .5, .5});
    V3 minimum{1e300, 1e300, 1e300}, maximum{-1e300, -1e300, -1e300};
    for (int i = 0; i < 8; i++) {
        Vertex v{i & 1 ? localMax.x : localMin.x, i & 2 ? localMax.y : localMin.y,
                 i & 4 ? localMax.z : localMin.z};
        auto p = transform(v, actor.data);
        minimum = {std::min(minimum.x, p.x), std::min(minimum.y, p.y), std::min(minimum.z, p.z)};
        maximum = {std::max(maximum.x, p.x), std::max(maximum.y, p.y), std::max(maximum.z, p.z)};
    }
    return {minimum, maximum};
}
bool collision(const Actor &a, const Actor &b) {
    if (a.mesh != b.mesh)
        return false;
    if (a.mesh) {
        auto ab = bounds(a), bb = bounds(b);
        bool sphereA = field(a.data, "shakal3d", Value::s("")).str() == "sphere",
             sphereB = field(b.data, "shakal3d", Value::s("")).str() == "sphere";
        auto radius = [](const Actor &actor) {
            auto s = v3(field(actor.data, "paimano"), {1, 1, 1});
            return .5 * std::max({std::abs(s.x), std::abs(s.y), std::abs(s.z)});
        };
        if (sphereA && sphereB) {
            auto d = v3(field(a.data, "jagah3d")) - v3(field(b.data, "jagah3d"));
            double r = radius(a) + radius(b);
            return dot(d, d) <= r * r;
        }
        if (sphereA || sphereB) {
            auto p = v3(field((sphereA ? a : b).data, "jagah3d"));
            auto box = sphereA ? bb : ab;
            V3 closest{std::clamp(p.x, box.first.x, box.second.x), std::clamp(p.y, box.first.y, box.second.y),
                       std::clamp(p.z, box.first.z, box.second.z)};
            auto d = p - closest;
            double r = radius(sphereA ? a : b);
            return dot(d, d) <= r * r;
        }
        return ab.first.x < bb.second.x && ab.second.x > bb.first.x && ab.first.y < bb.second.y &&
               ab.second.y > bb.first.y && ab.first.z < bb.second.z && ab.second.z > bb.first.z;
    }
    auto p = field(a.data, "jagah"), q = field(b.data, "jagah");
    double ax = num(p, "x"), ay = num(p, "y"), bx = num(q, "x"), by = num(q, "y");
    return ax < bx + num(b.data, "width", 40) && ax + num(a.data, "width", 40) > bx &&
           ay < by + num(b.data, "height", 40) && ay + num(a.data, "height", 40) > by;
}
} // namespace
uint32_t color(const Value &value) {
    auto s = value.str();
    const std::map<std::string, uint32_t> colors = {
        {"black", 0xff050a15},  {"white", 0xffeff7ff}, {"cyan", 0xff55dfed},   {"lime", 0xffa1ef67},
        {"red", 0xfff66e79},    {"blue", 0xff5289f5},  {"amber", 0xffffc664},  {"green", 0xff3fc5a2},
        {"violet", 0xffa687fb}, {"gray", 0xff394355},  {"yellow", 0xffffdf72}, {"orange", 0xfff28b4f}};
    auto found = colors.find(s);
    if (found != colors.end())
        return found->second;
    if ((s.size() == 7 || s.size() == 9) && s[0] == '#') {
        auto n = uint32_t(std::stoul(s.substr(1), nullptr, 16));
        return s.size() == 7 ? 0xff000000 | n : n;
    }
    throw std::runtime_error("Unknown color '" + s + "'.");
}
Image loadImage(const fs::path &path) {
#ifdef _WIN32
    auto initialized = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IWICImagingFactory *factory = nullptr;
    IWICBitmapDecoder *decoder = nullptr;
    IWICBitmapFrameDecode *frame = nullptr;
    IWICFormatConverter *converter = nullptr;
    auto cleanup = [&]() {
        if (converter)
            converter->Release();
        if (frame)
            frame->Release();
        if (decoder)
            decoder->Release();
        if (factory)
            factory->Release();
        if (SUCCEEDED(initialized))
            CoUninitialize();
    };
    try {
        if (FAILED(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                                    IID_PPV_ARGS(&factory))))
            throw std::runtime_error("Cannot initialize Windows image decoder.");
        if (FAILED(factory->CreateDecoderFromFilename(path.c_str(), nullptr, GENERIC_READ,
                                                      WICDecodeMetadataCacheOnLoad, &decoder)) ||
            FAILED(decoder->GetFrame(0, &frame)))
            throw std::runtime_error("Cannot decode image '" + path.string() + "'.");
        UINT w = 0, h = 0;
        frame->GetSize(&w, &h);
        if (w == 0 || h == 0 || w > 8192 || h > 8192 || uint64_t(w) * h > 16 * 1024 * 1024)
            throw std::runtime_error("Image dimensions exceed the texture limit.");
        if (FAILED(factory->CreateFormatConverter(&converter)) ||
            FAILED(converter->Initialize(frame, GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone,
                                         nullptr, 0, WICBitmapPaletteTypeCustom)))
            throw std::runtime_error("Cannot convert image pixels.");
        Image image;
        image.width = int(w);
        image.height = int(h);
        image.pixels.resize(size_t(w) * h);
        if (FAILED(converter->CopyPixels(nullptr, w * 4, UINT(image.pixels.size() * 4),
                                         reinterpret_cast<BYTE *>(image.pixels.data()))))
            throw std::runtime_error("Cannot read image pixels.");
        cleanup();
        return image;
    } catch (...) {
        cleanup();
        throw;
    }
#else
    std::ifstream f(path, std::ios::binary);
    if (!f)
        throw std::runtime_error("Cannot open image '" + path.string() + "'.");
    unsigned char header[54]{};
    f.read(reinterpret_cast<char *>(header), 54);
    if (!f || header[0] != 'B' || header[1] != 'M')
        throw std::runtime_error(
            "The Linux headless renderer reads BMP assets. Windows also supports PNG/JPG via WIC.");
    auto u32 = [&](int i) {
        return uint32_t(header[i]) | (uint32_t(header[i + 1]) << 8) | (uint32_t(header[i + 2]) << 16) |
               (uint32_t(header[i + 3]) << 24);
    };
    int w = int32_t(u32(18)), signedH = int32_t(u32(22));
    int bpp = header[28] | (header[29] << 8);
    bool bitfields = u32(30) == 3 && bpp == 32 && u32(14) >= 108;
    if (w <= 0 || signedH == 0 || signedH == std::numeric_limits<int>::min() || w > 8192 ||
        std::abs(signedH) > 8192 || uint64_t(w) * std::abs(signedH) > 16 * 1024 * 1024 ||
        (bpp != 24 && bpp != 32) || (u32(30) != 0 && !bitfields))
        throw std::runtime_error("Unsupported BMP layout.");
    if (bitfields) {
        unsigned char masks[16]{};
        f.read(reinterpret_cast<char *>(masks), 16);
        uint32_t expected[] = {0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000};
        for (int i = 0; i < 4; i++) {
            uint32_t actual = 0;
            for (int j = 0; j < 4; j++)
                actual |= uint32_t(masks[i * 4 + j]) << (j * 8);
            if (actual != expected[i])
                throw std::runtime_error("Unsupported BMP channel masks.");
        }
    }
    Image image;
    image.width = w;
    image.height = std::abs(signedH);
    image.pixels.resize(size_t(w) * image.height);
    size_t stride = (size_t(w) * bpp + 31) / 32 * 4;
    std::vector<unsigned char> row(stride);
    f.seekg(u32(10));
    for (int y = 0; y < image.height; y++) {
        f.read(reinterpret_cast<char *>(row.data()), std::streamsize(stride));
        if (!f)
            throw std::runtime_error("Truncated BMP pixels.");
        int target = signedH > 0 ? image.height - 1 - y : y;
        for (int x = 0; x < w; x++) {
            size_t at = size_t(x) * (bpp / 8);
            uint32_t alpha = bpp == 32 ? row[at + 3] : 255;
            image.pixels[size_t(target) * w + x] =
                (alpha << 24) | (uint32_t(row[at + 2]) << 16) | (uint32_t(row[at + 1]) << 8) | row[at];
        }
    }
    return image;
#endif
}
std::vector<Face> loadMesh(const fs::path &path) {
    std::ifstream file(path);
    if (!file)
        throw std::runtime_error("Cannot open mesh '" + path.string() + "'.");
    std::vector<Vertex> vertices, uv;
    std::vector<Face> faces;
    std::string line;
    auto index = [](int i, size_t count) -> size_t {
        int64_t n = i > 0 ? int64_t(i) - 1 : int64_t(count) + i;
        if (i == 0 || n < 0 || uint64_t(n) >= count)
            throw std::runtime_error("OBJ face has an invalid index.");
        return size_t(n);
    };
    while (std::getline(file, line)) {
        if (line.size() > 1024 * 1024)
            throw std::runtime_error("OBJ line is too long.");
        std::istringstream s(line);
        std::string kind;
        s >> kind;
        if (kind == "v") {
            Vertex v;
            if (!(s >> v.x >> v.y >> v.z) || !std::isfinite(v.x) || !std::isfinite(v.y) ||
                !std::isfinite(v.z))
                throw std::runtime_error("Invalid OBJ vertex.");
            vertices.push_back(v);
        } else if (kind == "vt") {
            Vertex v;
            if (!(s >> v.u >> v.v))
                throw std::runtime_error("Invalid OBJ UV coordinate.");
            uv.push_back(v);
        } else if (kind == "f") {
            std::vector<Vertex> polygon;
            std::string part;
            while (s >> part) {
                if (part[0] == '#')
                    break;
                auto slash = part.find('/');
                int vi = std::stoi(part.substr(0, slash));
                auto v = vertices[index(vi, vertices.size())];
                if (slash != std::string::npos) {
                    auto end = part.find('/', slash + 1);
                    auto sub = part.substr(slash + 1, end == std::string::npos ? end : end - slash - 1);
                    if (!sub.empty()) {
                        auto t = uv[index(std::stoi(sub), uv.size())];
                        v.u = t.u;
                        v.v = t.v;
                    }
                }
                polygon.push_back(v);
                if (polygon.size() > 10000)
                    throw std::runtime_error("OBJ polygon too large.");
            }
            if (polygon.size() < 3)
                throw std::runtime_error("OBJ face needs three vertices.");
            for (size_t i = 1; i + 1 < polygon.size(); i++)
                faces.push_back({polygon[0], polygon[i], polygon[i + 1]});
        }
        if (vertices.size() > 1000000 || faces.size() > 1000000)
            throw std::runtime_error("Mesh exceeds one million vertices/faces.");
    }
    if (faces.empty())
        throw std::runtime_error("OBJ mesh contains no triangles.");
    return faces;
}
void VM::tick(double dt) {
    pumpTasks();
    cancelled();
    world.time += dt;
    globals->find("dt")->value = Value::d(dt);
    auto mouse = io.mouse ? io.mouse() : std::pair<int, int>{0, 0};
    globals->find("mouse_x")->value = Value::i(mouse.first);
    globals->find("mouse_y")->value = Value::i(mouse.second);
    auto held = [&](const std::string &k) { return io.key && io.key(k); };
    auto pressed = [&](const std::string &k) { return held(k) && !world.previousKeys.count(k); };
    std::set<std::string> queried = {"ESC", "F1", "SPACE", "LEFT", "RIGHT",      "UP",         "DOWN",
                                     "W",   "A",  "S",     "D",    "MOUSE_LEFT", "MOUSE_RIGHT"};
    for (auto &h : world.handlers)
        if ((h.kind == "on_key" || h.kind == "on_click") && !h.args.empty())
            queried.insert(h.args[0].str());
    if (pressed("ESC"))
        world.paused = !world.paused;
    if (pressed("F1"))
        world.debug = !world.debug;
    auto shop = globals->find("$shop");
    if (shop) {
        auto &items = shop->value.array->values;
        if (!items.empty()) {
            auto key = items[0]->value.str();
            queried.insert(key);
            if (pressed(key))
                world.paused = !world.paused;
            if (world.paused)
                for (size_t i = 1; i + 2 < items.size(); i += 3) {
                    auto digit = std::to_string((i - 1) / 3 + 1);
                    queried.insert(digit);
                    if (pressed(digit)) {
                        auto walletName = globals->find("$wallet");
                        auto wallet = walletName ? globals->find(walletName->value.str()) : nullptr;
                        auto cost = items[i + 1]->value.numeric();
                        if (wallet && cost >= 0 && wallet->value.numeric() >= cost) {
                            wallet->value =
                                convert(Value::input(std::to_string(int64_t(wallet->value.numeric() - cost))),
                                        wallet->type, {});
                            invoke(items[i + 2]->value.str(), {}, {});
                        }
                    }
                }
        }
    }
    if (!world.paused && !world.over) {
        size_t initial = world.actors.size();
        for (size_t i = 0; i < initial; i++)
            if (world.actors[i].spawnEvery > 0) {
                auto &source = world.actors[i];
                source.spawnTime += dt;
                if (source.spawnTime >= source.spawnEvery) {
                    source.spawnTime -= source.spawnEvery;
                    auto data = source.data;
                    auto spawned = builtin("paida", {data}, {});
                    double width = num(spawned, "width", 40);
                    position(spawned,
                             std::uniform_real_distribution<double>(
                                 std::min(20.0, double(world.width) - width),
                                 std::max(20.0, double(world.width) - width - 20))(random),
                             -num(spawned, "height", 40));
                }
            }
        initial = world.actors.size();
        for (size_t i = 0; i < initial; i++) {
            auto &actor = world.actors[i];
            if (!visible(actor, world))
                continue;
            auto data = actor.data;
            bool mesh = actor.mesh;
            auto pos = field(data, mesh ? "jagah3d" : "jagah");
            double x = num(pos, "x"), y = num(pos, "y"), z = num(pos, "z");
            double speed = num(data, "raftar") * (mesh ? 1 : 60), dx = 0, dy = 0, dz = 0;
            auto controls = field(data, "qabu", Value::s("none")).str();
            bool controlled = controls != "none";
            if (controlled) {
                bool wasd = controls == "wasd" || controls == "wasd_3d";
                dx = (held(wasd ? "D" : "RIGHT") ? 1 : 0) - (held(wasd ? "A" : "LEFT") ? 1 : 0);
                if (mesh)
                    dz = (held(wasd ? "S" : "DOWN") ? 1 : 0) - (held(wasd ? "W" : "UP") ? 1 : 0);
                else if (controls != "arrows_platformer")
                    dy = (held(wasd ? "S" : "DOWN") ? 1 : 0) - (held(wasd ? "W" : "UP") ? 1 : 0);
                if (dx && dy) {
                    dx *= .70710678;
                    dy *= .70710678;
                }
                x += dx * speed * dt;
                y += dy * speed * dt;
                z += dz * speed * dt;
                setField(data, "flip", Value::b(dx < 0));
                setField(data, "animation", Value::s(dx || dy || dz ? "run" : "idle"));
            } else if (actor.spawned && !mesh)
                y += speed * dt;
            auto ai = field(data, "chal_ai");
            if (ai.kind == Value::Record) {
                auto kind = field(ai, "kind").str();
                if (kind == "patrol") {
                    double low = field(ai, "arg0", Value::d(0)).numeric(),
                           high = field(ai, "arg1", Value::d(world.width)).numeric(),
                           dir = field(data, "$direction", Value::d(1)).numeric();
                    x += dir * speed * dt;
                    if (x < low) {
                        x = low;
                        dir = 1;
                    }
                    if (x > high) {
                        x = high;
                        dir = -1;
                    }
                    setField(data, "$direction", Value::d(dir));
                } else if (kind == "chase") {
                    auto target = field(ai, "arg0"), tp = field(target, mesh ? "jagah3d" : "jagah");
                    double tx = num(tp, "x") - x, ty = num(tp, "y") - y, tz = num(tp, "z") - z,
                           len = std::sqrt(tx * tx + ty * ty + tz * tz);
                    if (len > .01) {
                        x += tx / len * speed * dt;
                        y += ty / len * speed * dt;
                        z += tz / len * speed * dt;
                    }
                }
            }
            double gravity = num(data, "wazan");
            if (gravity != 0) {
                double velocity = num(data, "vy");
                bool grounded = field(data, "$grounded", Value::b(false)).truth();
                if (pressed("SPACE") && grounded) {
                    velocity = mesh ? num(data, "chhal", 8) : -num(data, "chhal", 500);
                    grounded = false;
                }
                velocity += (mesh ? -gravity : gravity) * dt;
                y += velocity * dt;
                setField(data, "vy", Value::d(velocity));
                setField(data, "$grounded", Value::b(false));
            }
            if (!mesh && controlled) {
                x = std::clamp(x, 0.0, std::max(0.0, world.width - num(data, "width", 40)));
                if (gravity == 0)
                    y = std::clamp(y, 0.0, std::max(0.0, world.height - num(data, "height", 40)));
            }
            position(data, x, y, z, mesh);
            actor.frame += dt;
            auto forced = field(data, "forced_animation", Value::s("")).str();
            if (!forced.empty()) {
                auto range = field(data, "anim_" + forced);
                double elapsed = num(data, "animation_time") + dt;
                double duration =
                    (num(range, "y") - num(range, "x") + 1) / std::max(1.0, num(range, "z", 12));
                if (elapsed >= duration)
                    setField(data, "forced_animation", Value::s(""));
                else
                    setField(data, "animation_time", Value::d(elapsed));
            }
            if (actor.spawned && !mesh && y > world.height + 100)
                setField(data, "visible", Value::b(false));
        }
        // Resolve descending 2D bodies against solid platform tops.
        for (auto &body : world.actors)
            if (!body.mesh && visible(body, world) && num(body.data, "wazan") != 0 &&
                num(body.data, "vy") >= 0) {
                auto p = field(body.data, "jagah");
                double x = num(p, "x"), y = num(p, "y"), w = num(body.data, "width", 40),
                       h = num(body.data, "height", 40), lastBottom = y + h - num(body.data, "vy") * dt;
                for (auto &platform : world.actors)
                    if (platform.data.object != body.data.object && !platform.mesh &&
                        visible(platform, world) &&
                        field(platform.data, "thandho", Value::b(false)).truth()) {
                        auto q = field(platform.data, "jagah");
                        double py = num(q, "y");
                        if (x + w > num(q, "x") && x < num(q, "x") + num(platform.data, "width", 40) &&
                            y + h >= py && lastBottom <= py + 2) {
                            position(body.data, x, py - h);
                            setField(body.data, "vy", Value::d(0));
                            setField(body.data, "$grounded", Value::b(true));
                        }
                    }
            }
        for (auto &body : world.actors)
            if (body.mesh && visible(body, world) && num(body.data, "wazan") != 0 &&
                num(body.data, "vy") <= 0) {
                auto box = bounds(body);
                double previousBottom = box.first.y - num(body.data, "vy") * dt;
                for (auto &platform : world.actors)
                    if (platform.data.object != body.data.object && platform.mesh &&
                        visible(platform, world) &&
                        field(platform.data, "thandho", Value::b(false)).truth()) {
                        auto floor = bounds(platform);
                        if (box.second.x > floor.first.x && box.first.x < floor.second.x &&
                            box.second.z > floor.first.z && box.first.z < floor.second.z &&
                            box.first.y <= floor.second.y && previousBottom >= floor.second.y - .02) {
                            auto pos = field(body.data, "jagah3d");
                            position(body.data, num(pos, "x"), num(pos, "y") + floor.second.y - box.first.y,
                                     num(pos, "z"), true);
                            setField(body.data, "vy", Value::d(0));
                            setField(body.data, "$grounded", Value::b(true));
                        }
                    }
            }
        for (size_t hindex = 0; hindex < world.handlers.size(); hindex++) {
            auto handler = world.handlers[hindex];
            auto scene = handler.args.empty() ? "" : handler.args.back().str();
            if (!scene.empty() && scene != world.scene)
                continue;
            if (handler.kind == "timer") {
                world.handlers[hindex].elapsed += dt;
                double every = handler.args[0].numeric();
                int steps = 0;
                while (world.handlers[hindex].elapsed >= every && steps++ < 4) {
                    world.handlers[hindex].elapsed -= every;
                    invoke(handler.function, {}, {});
                }
            } else if (handler.kind == "on_key") {
                if (pressed(handler.args[0].str()))
                    invoke(handler.function, {}, {});
            } else if (handler.kind == "on_click") {
                auto button = handler.args[0].str();
                auto key = button == "left" ? "MOUSE_LEFT" : button == "right" ? "MOUSE_RIGHT" : button;
                queried.insert(key);
                if (pressed(key))
                    invoke(handler.function, {}, {});
            } else if (handler.kind == "level") {
                auto stage = globals->find("level");
                if (stage && stage->value.numeric() == handler.args[0].numeric() &&
                    world.handlers[hindex].elapsed == 0) {
                    world.handlers[hindex].elapsed = 1;
                    invoke(handler.function, {}, {});
                }
            } else if (handler.kind == "takkar" || handler.kind == "takkar3d") {
                auto a = handler.args[0].str(), b = handler.args[1].str();
                size_t count = world.actors.size();
                for (size_t i = 0; i < count; i++)
                    for (size_t j = 0; j < count; j++) {
                        if (i == j || world.actors[i].name != a || world.actors[j].name != b ||
                            !visible(world.actors[i], world) || !visible(world.actors[j], world))
                            continue;
                        if (!collision(world.actors[i], world.actors[j]))
                            continue;
                        auto ac = globals->find(a), bc = globals->find(b);
                        auto oldA = ac->value, oldB = bc->value;
                        ac->value = world.actors[i].data;
                        bc->value = world.actors[j].data;
                        try {
                            invoke(handler.function, {}, {});
                        } catch (...) {
                            ac->value = oldA;
                            bc->value = oldB;
                            throw;
                        }
                        ac->value = oldA;
                        bc->value = oldB;
                    }
            }
        }
        for (auto &p : world.particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        }
        world.particles.erase(std::remove_if(world.particles.begin(), world.particles.end(),
                                             [](const Particle &p) { return p.life <= 0; }),
                              world.particles.end());
        world.actors.erase(std::remove_if(world.actors.begin(), world.actors.end(),
                                          [](const Actor &a) {
                                              return a.spawned &&
                                                     !field(a.data, "visible", Value::b(true)).truth();
                                          }),
                           world.actors.end());
    }
    world.previousKeys.clear();
    for (auto &k : queried)
        if (held(k))
            world.previousKeys.insert(k);
}
void VM::render() {
    world.pixels.assign(size_t(world.width) * world.height, world.background);
    world.depth.assign(world.pixels.size(), std::numeric_limits<float>::infinity());
    auto texture = [&](const std::string &name) -> const Image * {
        if (name.empty())
            return nullptr;
        auto found = world.images.find(name);
        if (found == world.images.end()) {
            try {
                found = world.images.emplace(name, loadImage(safePath(name, {}))).first;
            } catch (const std::exception &e) {
                if (io.warning)
                    io.warning(e.what());
                world.images[name] = {};
                return nullptr;
            }
        }
        return found->second.pixels.empty() ? nullptr : &found->second;
    };
    if (world.dimension == 2) {
        double offsetX = 0, offsetY = 0;
        auto follow = field(world.camera, "follow");
        if (follow.kind == Value::Record) {
            auto p = field(follow, "jagah");
            offsetX = num(p, "x") - world.width * .5;
            offsetY = num(p, "y") - world.height * .5;
        }
        for (auto &kv : globals->values)
            if (kv.first.rfind("$tilemap:", 0) == 0) {
                auto grid = field(kv.second->value, "grid");
                if (grid.kind == Value::List)
                    for (size_t y = 0; y < grid.array->values.size(); y++) {
                        auto row = grid.array->values[y]->value;
                        if (row.kind == Value::List)
                            for (size_t x = 0; x < row.array->values.size(); x++) {
                                auto id = row.array->values[x]->value.integer;
                                uint32_t colors[] = {0xff123e35, 0xff293347, 0xfff4e6b4, 0xff54c7a8};
                                rectangle(world, int(x * 32 - offsetX), int(y * 32 - offsetY), 32, 32,
                                          colors[std::abs(id) % 4]);
                            }
                    }
            }
        for (auto &actor : world.actors) {
            if (actor.mesh || !visible(actor, world))
                continue;
            auto pos = field(actor.data, "jagah");
            double xx = num(pos, "x") - offsetX, yy = num(pos, "y") - offsetY,
                   ww = num(actor.data, "width", 40), hh = num(actor.data, "height", 40);
            if (!std::isfinite(xx) || !std::isfinite(yy) || ww <= 0 || hh <= 0 || ww > 20000 || hh > 20000 ||
                xx > world.width || yy > world.height || xx + ww < 0 || yy + hh < 0)
                continue;
            int x = int(xx), y = int(yy), width = int(ww), height = int(hh);
            auto image = texture(field(actor.data, "tasveer", Value::s("")).str());
            if (image) {
                int frames = 1, index = 0;
                auto forced = field(actor.data, "forced_animation", Value::s("")).str();
                auto anim = forced.empty() ? field(actor.data, "animation", Value::s("idle")).str() : forced;
                auto range = field(actor.data, "anim_" + anim);
                if (range.kind != Value::Record)
                    for (auto &prop : actor.data.object->fields)
                        if (prop.first.rfind("anim_", 0) == 0) {
                            range = prop.second->value;
                            break;
                        }
                if (range.kind == Value::Record) {
                    int first = int(num(range, "x")), last = int(num(range, "y")),
                        fps = int(num(range, "z", 12));
                    frames = last + 1;
                    for (auto &p : actor.data.object->fields)
                        if (p.first.rfind("anim_", 0) == 0)
                            frames = std::max(frames, int(num(p.second->value, "y")) + 1);
                    if (first < 0 || last < first || frames > image->width || image->width % frames != 0 ||
                        fps <= 0)
                        throw std::runtime_error("Invalid sprite-sheet frame range.");
                    index = forced.empty()
                                ? first + int(std::fmod(actor.frame * fps, last - first + 1))
                                : std::min(last, first + int(num(actor.data, "animation_time") * fps));
                }
                sprite(world, *image, x, y, width, height, index, frames,
                       field(actor.data, "flip", Value::b(false)).truth());
            } else
                rectangle(world, x, y, width, height, color(field(actor.data, "rang", Value::s("cyan"))));
            if (world.debug) {
                rectangle(world, x, y, width, 1, 0xffff6188);
                rectangle(world, x, y, 1, height, 0xffff6188);
                rectangle(world, x + width - 1, y, 1, height, 0xffff6188);
                rectangle(world, x, y + height - 1, width, 1, 0xffff6188);
            }
        }
        for (auto &p : world.particles)
            if (p.x - offsetX >= 0 && p.x - offsetX < world.width && p.y - offsetY >= 0 &&
                p.y - offsetY < world.height)
                rectangle(world, int(p.x - offsetX), int(p.y - offsetY), 3, 3,
                          shade(p.color, std::max(.1, p.life / .8)));
    } else {
        for (int i = 0; i < 100; i++) {
            int x = (i * 977 + 13) % world.width, y = (i * 397 + 23) % world.height;
            rectangle(world, x, y, i % 7 == 0 ? 2 : 1, i % 7 == 0 ? 2 : 1, 0xff435776);
        }
        V3 eye = v3(field(world.camera, "jagah3d"), {0, 3.5, 11}), target{0, 0, 0};
        auto follow = field(world.camera, "follow3d");
        if (follow.kind == Value::Record) {
            target = v3(field(follow, "jagah3d"));
            eye = eye + target;
        }
        auto look = field(world.camera, "look_at");
        if (look.kind == Value::Record)
            target = v3(look);
        auto forward = normalize(target - eye), right = normalize(cross(forward, {0, 1, 0})),
             up = cross(right, forward), direction = normalize(v3(field(world.light, "simt"), {.4, -1, -.6}));
        double fov = std::clamp(num(world.camera, "fov", 60), 10.0, 150.0),
               focal = world.height * .5 / std::tan(fov * 3.141592653589793 / 360),
               ambient = std::clamp(num(world.light, "ambient", .25), 0.0, 1.0);
        for (auto &actor : world.actors) {
            if (!actor.mesh || !visible(actor, world))
                continue;
            auto shape = field(actor.data, "shakal3d", Value::s("cube")).str();
            auto mesh = world.meshes.find(shape);
            if (mesh == world.meshes.end())
                mesh = world.meshes
                           .emplace(shape, shape == "cube" || shape == "sphere" || shape == "plane" ||
                                                   shape == "pyramid"
                                               ? primitive(shape)
                                               : loadMesh(safePath(shape, {})))
                           .first;
            uint32_t base = color(field(actor.data, "rang", Value::s("cyan")));
            auto image = texture(field(actor.data, "tasveer", Value::s("")).str());
            for (auto &face : mesh->second) {
                V3 a = transform(face.a, actor.data), b = transform(face.b, actor.data),
                   c = transform(face.c, actor.data);
                double light =
                    ambient + (1 - ambient) * std::abs(dot(normalize(cross(b - a, c - a)), direction));
                auto view = [&](V3 p) {
                    p = p - eye;
                    return V3{dot(p, right), dot(p, up), dot(p, forward)};
                };
                std::vector<CV> poly = {{view(a), face.a.u, face.a.v},
                                        {view(b), face.b.u, face.b.v},
                                        {view(c), face.c.u, face.c.v}},
                                clipped;
                for (size_t i = 0; i < poly.size(); i++) {
                    auto prev = poly[(i + poly.size() - 1) % poly.size()], cur = poly[i];
                    bool inside = cur.p.z >= .1, prevInside = prev.p.z >= .1;
                    if (inside != prevInside) {
                        double t = (.1 - prev.p.z) / (cur.p.z - prev.p.z);
                        clipped.push_back({prev.p + (cur.p - prev.p) * t, prev.u + (cur.u - prev.u) * t,
                                           prev.v + (cur.v - prev.v) * t});
                    }
                    if (inside)
                        clipped.push_back(cur);
                }
                for (size_t i = 1; i + 1 < clipped.size(); i++)
                    raster(world, clipped[0], clipped[i], clipped[i + 1], focal, shade(base, light), image,
                           light);
            }
        }
        for (auto &particle : world.particles) {
            auto p = V3{particle.x, particle.y, particle.z} - eye;
            double z = dot(p, forward);
            if (z > .1) {
                double x = world.width * .5 + dot(p, right) * focal / z,
                       y = world.height * .5 - dot(p, up) * focal / z;
                if (x >= 0 && x < world.width && y >= 0 && y < world.height)
                    rectangle(world, int(x), int(y), 3, 3,
                              shade(particle.color, std::max(.1, particle.life / .8)));
            }
        }
    }
    if (!world.hud.empty()) {
        int gap = std::min(174, (world.width - 60) / int(world.hud.size()));
        rectangle(world, 18, 18, std::min(world.width - 36, int(world.hud.size()) * gap + 24), 42,
                  0xff101c30);
        int x = 30;
        for (auto &label : world.hud) {
            auto cell = globals->find(label);
            text(world, x, 33, label + ": " + (cell ? cell->value.str() : label), 0xffedf5ff, 2);
            x += gap;
        }
    }
    if (world.debug)
        text(world, 20, world.height - 28,
             "ENTITIES " + std::to_string(world.actors.size()) + "  PARTICLES " +
                 std::to_string(world.particles.size()),
             0xff85e9c2, 2);
    if (world.paused || world.over) {
        int width = std::min(440, world.width - 32), x = (world.width - width) / 2, y = world.height / 2 - 80;
        rectangle(world, x, y, width, 160, 0xff101c30);
        text(world, x + 24, y + 24, world.over ? (world.won ? "VICTORY" : "GAME OVER") : "PAUSED",
             world.over && !world.won ? 0xfff18490 : 0xff76ecd0, 3);
        text(world, x + 24, y + 62, world.over ? world.message : "ESC TO RESUME", 0xffe0e9f8, 2);
        auto shop = globals->find("$shop");
        if (world.paused && shop) {
            auto &items = shop->value.array->values;
            for (size_t i = 1; i + 2 < items.size() && i < 10; i += 3)
                text(world, x + 24, y + 85 + int((i - 1) / 3) * 22,
                     std::to_string((i - 1) / 3 + 1) + " " + items[i]->value.str() + " : " +
                         items[i + 1]->value.str(),
                     0xffffd083, 2);
        }
    }
}
void saveFrame(const World &world, const fs::path &path) {
    std::ofstream f(path, std::ios::binary);
    if (!f)
        throw std::runtime_error("Cannot write frame.");
    f << "P6\n" << world.width << " " << world.height << "\n255\n";
    for (auto p : world.pixels) {
        char b[] = {char(p >> 16), char(p >> 8), char(p)};
        f.write(b, 3);
    }
}
} // namespace jim
