#include "jimsabz.hpp"
#include <iostream>
#include <fstream>
#include <thread>
#ifndef _WIN32
#include <sys/resource.h>
#endif
using namespace jim;
static int passed = 0, total = 0;
void test(bool condition, const std::string &name) {
    total++;
    std::cout << (condition ? "PASS " : "FAIL ") << name << "\n";
    if (condition)
        passed++;
}
std::unique_ptr<VM> make(const std::string &source, RuntimeIO io = {}) {
    auto b = compile(source, fs::current_path() / "tests" / "runtime-input.jimsabz");
    if (!b.ok)
        throw std::runtime_error(b.errors.front().describe());
    auto vm = std::make_unique<VM>(b.program, io);
    vm->random.seed(1234);
    vm->run();
    return vm;
}
std::string stressSource(bool three) {
    std::ostringstream s;
    s << "kharna " << (three ? "gui3d" : "gui") << "\n"
      << (three ? "khed3d" : "khed") << " \"Stress\" {\nkhirki 900, 650\n";
    for (int i = 0; i < 300; i++)
        if (three)
            s << "mujassamo Actor" << i << " {\nshakal3d: cube\njagah3d: (" << (i % 20 - 10) * 1.5 << ", "
              << ((i / 20) % 5 - 2) * 1.2 << ", " << -(i / 100) * 5
              << ")\npaimano: (0.6, 0.6, 0.6)\nrang: cyan\n}\n";
        else
            s << "kirdar Actor" << i << " {\njagah: (" << (i % 20) * 44 << ", " << (i / 20) * 40
              << ")\nwidth: 20\nheight: 20\nrang: cyan\n}\n";
    s << "chining(\"spark\", at: " << (three ? "(0, 0, 0)" : "(450, 325)") << ", count: 500)\n}\n";
    return s.str();
}
int main(int argc, char **argv) {
    try {
        if (argc > 1 && std::string(argv[1]) == "--compile-benchmark") {
            std::string source;
            for (int i = 0; i < 400; i++)
                source += "adad variable" + std::to_string(i) + " = " + std::to_string(i) + "\n";
            std::vector<double> times;
            for (int i = 0; i < 20; i++) {
                auto start = std::chrono::steady_clock::now();
                auto b = compile(source, fs::current_path() / "tests" / "compile-benchmark.jimsabz");
                if (!b.ok)
                    throw std::runtime_error(b.errors.front().describe());
                times.push_back(
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start)
                        .count());
            }
            std::sort(times.begin(), times.end());
            std::cout << "{\"source_lines\":400,\"runs\":20,\"median_ms\":" << times[10]
                      << ",\"p95_ms\":" << times[18] << ",\"max_ms\":" << times.back() << "}\n";
            return 0;
        }
        if (argc > 1 && std::string(argv[1]) == "--benchmark") {
            bool three = argc > 2 && std::string(argv[2]) == "3d";
            auto vm = make(stressSource(three));
            std::vector<double> times;
            for (int i = 0; i < 120; i++) {
                if (vm->world.particles.size() < 500)
                    vm->builtin("chining",
                                {Value::s("spark"), Value::obj(three ? "vec3" : "vec2"),
                                 Value::i(int64_t(500 - vm->world.particles.size()))},
                                {});
                auto start = std::chrono::steady_clock::now();
                vm->instructions = 0;
                vm->tick(1.0 / 60);
                vm->render();
                times.push_back(
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start)
                        .count());
            }
            std::sort(times.begin(), times.end());
            double sum = 0;
            for (auto n : times)
                sum += n;
            std::cout << "{\"mode\":\"" << (three ? "3d" : "2d")
                      << "\",\"entities\":300,\"particles\":500,\"frames\":120,\"mean_ms\":"
                      << sum / times.size() << ",\"p95_ms\":" << times[114] << ",\"max_ms\":" << times.back();
#ifndef _WIN32
            rusage usage{};
            getrusage(RUSAGE_SELF, &usage);
            std::cout << ",\"peak_rss_mib\":" << usage.ru_maxrss / 1024.0;
#endif
            std::cout << "}\n";
            return 0;
        }
        std::set<std::string> keys;
        RuntimeIO io;
        io.key = [&](const std::string &k) { return keys.count(k) > 0; };
        auto player =
            make("kharna gui\nkhed \"Keys\" {\n adad pressed = 0\n kirdar Hero {\n jagah: (100,100)\n "
                 "raftar: 5.0\n qabu: arrows\n }\n on_key(\"SPACE\") {\n pressed += 1\n }\n}\n",
                 io);
        keys.insert("RIGHT");
        player->tick(1.0 / 60);
        test(field(field(player->globals->find("Hero")->value, "jagah"), "x").numeric() == 105,
             "keyboard moves native entity");
        keys.insert("SPACE");
        player->tick(1.0 / 60);
        player->tick(1.0 / 60);
        test(player->globals->find("pressed")->value.integer == 1, "key event fires once per press");
        keys.erase("SPACE");
        player->tick(1.0 / 60);
        keys.insert("SPACE");
        player->tick(1.0 / 60);
        test(player->globals->find("pressed")->value.integer == 2, "key release permits next event");
        keys.clear();
        auto collision = make("kharna gui3d\nkhed3d \"Bounds\" {\n adad hits=0\n mujassamo Box {\n shakal3d: "
                              "cube\n jagah3d: (0,0,0)\n }\n mujassamo Ball {\n shakal3d: sphere\n jagah3d: "
                              "(0.8,0.8,0.8)\n }\n takkar3d(Box,Ball) {\n hits += 1\n }\n}\n");
        collision->tick(1.0 / 60);
        test(collision->globals->find("hits")->value.integer == 0,
             "sphere/AABB rejects corner false positive");
        auto pos = field(collision->globals->find("Ball")->value, "jagah3d");
        setField(pos, "x", Value::d(.7));
        collision->tick(1.0 / 60);
        test(collision->globals->find("hits")->value.integer == 1, "sphere/AABB detects actual overlap");
        auto physics = make("kharna gui\nkhed \"Gravity\" {\n kirdar Floor {\n jagah: (0,500)\n width: 800\n "
                            "height: 60\n thandho: ha\n }\n kirdar Hero {\n jagah: (100,200)\n width: 30\n "
                            "height: 50\n wazan: 1000\n }\n}\n");
        for (int i = 0; i < 120; i++)
            physics->tick(1.0 / 60);
        auto hero = physics->globals->find("Hero")->value;
        test(std::abs(field(field(hero, "jagah"), "y").numeric() - 450) < .01,
             "gravity lands a body on solid platform");
        test(field(hero, "$grounded").truth(), "ground contact sets grounded state");
        auto p3d = make("kharna gui3d\nkhed3d \"Gravity3D\" {\n mujassamo Floor {\n shakal3d: plane\n "
                        "jagah3d: (0,0,0)\n paimano: (20,1,20)\n thandho: ha\n }\n mujassamo Hero {\n "
                        "shakal3d: cube\n jagah3d: (0,4,0)\n wazan: 9.8\n }\n}\n");
        for (int i = 0; i < 120; i++)
            p3d->tick(1.0 / 60);
        auto h3d = p3d->globals->find("Hero")->value;
        test(std::abs(field(field(h3d, "jagah3d"), "y").numeric() - .5) < .01,
             "3D gravity lands a cube on a plane");
        auto scenes =
            make("kharna gui\nkhed \"Scenes\" {\n adad a=0\n adad b=0\n manzar First {\n har 0.01 second {\n "
                 "a+=1\n }\n }\n manzar Second {\n har 0.01 second {\n b+=1\n }\n }\n}\n");
        scenes->tick(1.0 / 60);
        test(scenes->globals->find("a")->value.integer > 0 && scenes->globals->find("b")->value.integer == 0,
             "inactive scene handlers do not execute");
        scenes->builtin("tabdeel_manzar", {Value::s("Second")}, {});
        scenes->tick(1.0 / 60);
        test(scenes->globals->find("b")->value.integer > 0, "scene transition activates target handlers");
        auto b = compile("wori (ha) {\n}\n", fs::current_path() / "tests" / "limit.jimsabz");
        VM endless(b.program);
        endless.instructionLimit = 100;
        bool limit = false;
        try {
            endless.run();
        } catch (const Fault &e) {
            limit = e.code == "RUN-LIMIT";
        }
        test(limit, "instruction budget stops an endless program");
        std::atomic<bool> stop{true};
        RuntimeIO stopped;
        stopped.stop = &stop;
        VM cancel(b.program, stopped);
        bool stoppedOk = false;
        try {
            cancel.run();
        } catch (const Fault &e) {
            stoppedOk = e.code == "RUN-CANCEL";
        }
        test(stoppedOk, "cancellation stops VM execution");
        VM host(Program{}), client(Program{});
        bool bound = false;
        int port = 49200;
        for (; port < 49220; port++) {
            try {
                networkCall(host, "host", {Value::i(port)});
                bound = true;
                break;
            } catch (...) {
            }
        }
        if (!bound)
            throw std::runtime_error("No test UDP port available.");
        networkCall(client, "connect", {Value::s("127.0.0.1"), Value::i(port)});
        networkCall(client, "send", {Value::s("ping")});
        std::string packet;
        for (int i = 0; i < 100 && packet.empty(); i++) {
            packet = networkCall(host, "receive", {}).str();
            if (packet.empty())
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        test(packet == "ping", "LAN client sends actual UDP packet");
        networkCall(host, "send", {Value::s("pong")});
        packet.clear();
        for (int i = 0; i < 100 && packet.empty(); i++) {
            packet = networkCall(client, "receive", {}).str();
            if (packet.empty())
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        test(packet == "pong", "LAN host replies to connected peer");
        // A generated 2x2 BMP verifies asset bundling without shipping a demo game.
        const unsigned char bitmap[] = {'B', 'M', 70, 0, 0,   0, 0, 0, 0, 0, 54,  0,   0,   0, 40, 0, 0,  0,
                                        2,   0,   0,  0, 2,   0, 0, 0, 1, 0, 24,  0,   0,   0, 0,  0, 16, 0,
                                        0,   0,   0,  0, 0,   0, 0, 0, 0, 0, 0,   0,   0,   0, 0,  0, 0,  0,
                                        255, 0,   0,  0, 255, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0,  0};
        auto testSprite = fs::current_path() / "build" / "test-sprite.bmp";
        {
            std::ofstream sprite(testSprite, std::ios::binary);
            sprite.write(reinterpret_cast<const char *>(bitmap), sizeof(bitmap));
        }
        auto assetBuild = compile("kharna gui\nkhed \"Bundle\" {\n kirdar Hero {\n tasveer: "
                                  "\"build/test-sprite.bmp\" (size: 46, 88)\n }\n}\n",
                                  fs::current_path() / "examples" / "bundle-test.jimsabz");
        if (!assetBuild.ok)
            throw std::runtime_error(assetBuild.errors.front().describe());
        auto bundled = fs::current_path() / "build" / "test-embedded.exe";
        buildExecutable(assetBuild.program, executablePath(), bundled);
        Program restored;
        bool embedded = readEmbedded(bundled, restored);
        VM bundleVM(restored);
        bundleVM.run();
        bundleVM.gameLoop(1, false);
        test(embedded && fs::exists(fs::path(restored.root) / "build" / "test-sprite.bmp") &&
                 !bundleVM.world.pixels.empty(),
             "standalone bundle extracts and renders its sprite");
        fs::remove_all(restored.root);
        fs::remove(bundled);
        fs::remove(testSprite);
        std::cout << passed << "/" << total << " runtime tests passed\n";
        return passed == total ? 0 : 1;
    } catch (const std::exception &e) {
        std::cerr << e.what() << "\n";
        return 1;
    }
}
