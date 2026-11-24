#include "jimsabz.hpp"
#include <fstream>
#include <iostream>
#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#endif

int main(int argc, char **argv) {
#ifdef _WIN32
    struct ConsoleEncoding {
        UINT input = GetConsoleCP(), output = GetConsoleOutputCP();
        ConsoleEncoding() {
            if (input)
                SetConsoleCP(CP_UTF8);
            if (output)
                SetConsoleOutputCP(CP_UTF8);
        }
        ~ConsoleEncoding() {
            if (input)
                SetConsoleCP(input);
            if (output)
                SetConsoleOutputCP(output);
        }
    } consoleEncoding;
#endif
    using namespace jim;
    try {
        Program embedded;
        if (readEmbedded(executablePath(), embedded)) {
            RuntimeIO io;
            io.print = [](const std::string &s) { std::cout << s << std::flush; };
            io.read = []() {
                std::string s;
                if (!std::getline(std::cin, s))
                    throw std::runtime_error("Input stream closed.");
                return s;
            };
            VM vm(embedded, io);
            vm.run();
            if (vm.world.active)
                nativeGame(vm);
            auto root = embedded.root;
            std::error_code ignored;
            fs::remove_all(root, ignored);
            return 0;
        }
        if (argc == 1)
            return launchStudio();
        std::string command = argv[1];
        if (command == "studio")
            return launchStudio(argc > 2 ? argv[2] : "");
        if (command == "--version") {
            std::cout << "Jimsabz 0.8.0 / language v3.0 preview / JBC2 + JBC3\n";
            return 0;
        }
        if (command == "--help" || command == "help") {
            std::cout << "Jimsabz native compiler and Studio\n\n"
                         "  jimsabz studio [file.jimsabz]\n  jimsabz run file.jimsabz|file.jbc|file.jjimsa "
                         "[--headless N] [--frame image.ppm]\n"
                         "  jimsabz debug file.jimsabz [--break file.jimsabz:line]\n  jimsabz check file.jimsabz [--trace]\n  jimsabz build file.jimsabz [-o "
                         "program.jbc|program.jjimsa|program.exe]\n"
                         "  jimsabz inspect file.jimsabz|file.jbc [--ast|--tokens]\n\n"
                         "Output: budhai expression  |  Input: adad n = budh(\"Number: \")\n";
            return 0;
        }
        std::set<std::string> commands = {"run", "check", "build", "inspect", "debug"};
        int start = 2;
        std::string filename;
        if (commands.count(command)) {
            if (argc < 3)
                throw std::runtime_error("Provide a source or bytecode filename. Run jimsabz --help.");
            filename = argv[2];
            start = 3;
        } else {
            filename = command;
            command = "run";
        }
        fs::path file = fs::absolute(fs::u8path(filename)), output, frame;
        bool trace = false, wantAst = false, wantTokens = false;
        std::set<std::string> breakpoints;
        int headless = -1;
        for (int i = start; i < argc; i++) {
            std::string flag = argv[i];
            if(flag=="--break" && i+1<argc)breakpoints.insert(argv[++i]);
            else if (flag == "--trace")
                trace = true;
            else if (flag == "--ast")
                wantAst = true;
            else if (flag == "--tokens")
                wantTokens = true;
            else if ((flag == "-o" || flag == "--frame" || flag == "--headless") && i + 1 < argc) {
                std::string value = argv[++i];
                if (flag == "-o")
                    output = fs::u8path(value);
                else if (flag == "--frame")
                    frame = fs::u8path(value);
                else {
                    headless = std::stoi(value);
                    if (headless < 0 || headless > 1000000)
                        throw std::runtime_error("Headless frame count must be from 0 to 1000000.");
                }
            } else
                throw std::runtime_error("Unknown option: " + flag);
        }
        Program program;
        Build build;
        if (file.extension() == ".jbc" || file.extension() == ".jjimsa")
            program = readBytecode(file);
        else {
            if (file.extension() != ".jimsabz")
                throw std::runtime_error("Source files use .jimsabz; compiled programs use .jbc or .jjimsa.");
            std::ifstream f(file, std::ios::binary);
            if (!f)
                throw std::runtime_error("Cannot open " + file.string());
            std::string source{std::istreambuf_iterator<char>(f), {}};
            build = compile(source, file);
            if (trace)
                for (auto &stage : build.stages)
                    std::cerr << stage.name << ": " << stage.state << " (" << stage.milliseconds << " ms) "
                              << stage.detail << "\n";
            if (!build.ok) {
                for (auto &error : build.errors)
                    std::cerr << error.describe() << "\n";
                return 1;
            }
            program = build.program;
        }
        if (command == "check") {
            std::cerr << "Compilation successful.\n";
            return 0;
        }
        if (command == "inspect") {
            if (wantAst) {
                if (!build.ast)
                    throw std::runtime_error("AST inspection needs the .jimsabz source.");
                std::cout << astText(build.ast);
            } else if (wantTokens) {
                if (build.tokens.empty())
                    throw std::runtime_error("Token inspection needs the .jimsabz source.");
                for (auto &t : build.tokens)
                    std::cout << t.at.file << ":" << t.at.line << ":" << t.at.col << " "
                              << (t.kind == TK::Newline ? "NEWLINE" : t.text) << "\n";
            } else
                std::cout << disassemble(program);
            return 0;
        }
        if (command == "build") {
            if (output.empty()) {
                output = file;
                output.replace_extension(".jbc");
            }
            auto ext = output.extension().string();
            if (ext == ".exe")
                buildExecutable(program, executablePath(), output);
            else if (ext == ".jbc" || ext == ".jjimsa")
                writeBytecode(program, output);
            else
                throw std::runtime_error("Build output uses .jbc, .jjimsa, or .exe.");
            std::cerr << "Built " << output.string() << "\n";
            return 0;
        }
        RuntimeIO io;
        io.print = [](const std::string &s) { std::cout << s << std::flush; };
        io.read = []() {
            std::string line;
            if (!std::getline(std::cin, line))
                throw std::runtime_error("Input stream closed while the program was waiting for input.");
            return line;
        };
        io.warning = [](const std::string &s) { std::cerr << "Warning: " << s << "\n"; };
        if(command=="debug") {
            struct DebugState{std::string mode="into",last;size_t depth=0;};auto state=std::make_shared<DebugState>();
            auto quote=[](const std::string &s){std::string o="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){o+='\\';o+=char(c);}else if(c=='\n')o+="\\n";else if(c=='\r')o+="\\r";else if(c=='\t')o+="\\t";else if(c<32){const char*h="0123456789abcdef";o+="\\u00";o+=h[c>>4];o+=h[c&15];}else o+=char(c);}return o+"\"";};
            io.debug=[&,state,quote](const Span &at,const std::vector<DebugFrame> &frames){
                auto &mode=state->mode;auto &last=state->last;auto &depth=state->depth;
                auto key=at.file+":"+std::to_string(at.line)+":"+std::to_string(frames.size());if(key==last)return;last=key;
                bool stop=breakpoints.count(at.file+":"+std::to_string(at.line))||mode=="into"||(mode=="over"&&frames.size()<=depth)||(mode=="out"&&frames.size()<depth);
                if(!stop)return;depth=frames.size();
                std::cerr<<"{\"event\":\"paused\",\"file\":"<<quote(at.file)<<",\"line\":"<<at.line<<",\"frames\":[";
                for(size_t i=0;i<frames.size();++i){if(i)std::cerr<<",";auto &f=frames[i];std::cerr<<"{\"function\":"<<quote(f.function)<<",\"line\":"<<f.at.line<<",\"locals\":{";bool first=true;for(auto &v:f.locals){if(!first)std::cerr<<",";first=false;std::cerr<<quote(v.first)<<":"<<quote(v.second.str());}std::cerr<<"}}";}std::cerr<<"]}\n"<<std::flush;
                std::string cmd;while(std::getline(std::cin,cmd)){if(cmd=="continue"||cmd=="c"){mode="continue";return;}if(cmd=="step"||cmd=="s"){mode="into";return;}if(cmd=="next"||cmd=="n"){mode="over";return;}if(cmd=="out"){mode="out";return;}if(cmd.rfind("break ",0)==0){breakpoints.insert(cmd.substr(6));continue;}if(cmd.rfind("clear ",0)==0){breakpoints.erase(cmd.substr(6));continue;}if(cmd=="quit"||cmd=="q")throw Fault("RUN-CANCEL",5,at,"Debug session stopped.");std::cerr<<"{\"event\":\"command-error\",\"message\":\"Use continue, step, next, out, break file:line, clear file:line or quit.\"}\n";}
                throw Fault("RUN-CANCEL",5,at,"Debugger command stream closed.");
            };
        }
        VM vm(program, io);
        vm.run();
        if (vm.world.active) {
            if (headless >= 0) {
                vm.gameLoop(headless, false);
                if (headless == 0)
                    vm.render();
                if (!frame.empty())
                    saveFrame(vm.world, frame);
            } else
                nativeGame(vm);
        }
        return 0;
    } catch (const jim::Fault &e) {
        std::cerr << e.describe() << "\n";
        return 1;
    } catch (const std::exception &e) {
        std::cerr << "Jimsabz: " << e.what() << "\n";
        return 1;
    }
}
