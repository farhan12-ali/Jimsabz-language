#pragma once
// Jimsabz: a native compiler, stack VM, and software game runtime.
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <future>
#include <iomanip>
#include <map>
#include <memory>
#include <random>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace jim {
namespace fs = std::filesystem;
struct Span {
    std::string file;
    int line = 1, col = 1;
};
struct Fault : std::runtime_error {
    std::string code;
    int stage;
    Span at;
    std::vector<std::pair<std::string,Span>> trace;
    Fault(std::string c, int s, Span p, std::string message)
        : std::runtime_error(std::move(message)), code(std::move(c)), stage(s), at(std::move(p)) {}
    std::string describe() const;
};
enum class TK { Word, Integer, Decimal, String, Symbol, Newline, End };
struct Token {
    TK kind;
    std::string text;
    Span at;
};
std::vector<Token> lex(const std::string &, const std::string &);

struct Node;
using N = std::shared_ptr<Node>;
struct Node {
    std::string kind, text, type;
    Span at;
    bool fixed = false;
    bool currency = false;
    std::vector<N> children;
    std::vector<std::pair<std::string, std::string>> params;
    std::vector<N> defaults;
    std::vector<std::string> generics, bases, typeArgs;
    std::map<std::string, std::string> constraints;
    std::set<std::string> attrs;
    std::string id, origin, returnType;
    bool variadic = false;
};
N node(std::string kind, const Token &t, std::string text = {});
N parse(const std::vector<Token> &);
std::string astText(const N &, int indent = 0);
size_t nodeCount(const N &);

struct Symbol {
    std::string type;
    bool fixed = false;
    // The method receiver cannot be rebound, but its mutable fields can change.
    bool bindingOnly = false;
    N callable;
    N member;
};
struct ClassInfo {
    std::vector<N> fields, methods;
    std::vector<std::string> parents;
    std::set<std::string> attrs;
};
struct Analysis {
    std::map<std::string, Symbol> globals;
    std::map<std::string, N> functions;
    std::map<std::string, ClassInfo> classes;
    std::set<std::string> libraries;
};
Analysis analyze(const N &);
bool compatible(const std::string &target, const std::string &value);
std::vector<std::string> typeArguments(const std::string &);
std::string typeHead(const std::string &);
std::string functionType(const N &);
std::vector<std::string> functionParameters(const std::string &);
std::string functionResult(const std::string &);
bool callableType(const std::string &);
bool nullableType(const std::string &);
std::string substituteType(const std::string &, const std::map<std::string,std::string> &);
N cloneNode(const N &, const std::map<std::string,std::string> & = {});
void elaborate(const N &);

enum class Op : uint8_t {
    Push,
    Load,
    Declare,
    Pop,
    Dup,
    Member,
    Index,
    Array,
    Vector,
    Binary,
    Unary,
    Store,
    Enter,
    Leave,
    Unwind,
    Jump,
    JumpFalse,
    JumpTrue,
    Call,
    Method,
    New,
    Return,
    Print,
    Try,
    EndTry,
    Throw,
    Entity,
    Bind,
    Halt,
    Read,
    Closure,
    Invoke,
    CallNamed,
    Await
};
struct Ins {
    Op op = Op::Halt;
    int a = 0;
    std::string text;
    Span at;
};
struct Function {
    std::string name, result = "khali", owner;
    std::vector<std::pair<std::string, std::string>> params;
    std::vector<Ins> code;
    std::vector<std::vector<Ins>> defaults;
    bool variadic = false, asynchronous = false;
    std::string signature;
};
struct Program {
    std::string title, root, dataRoot;
    std::vector<Ins> code;
    std::map<std::string, Function> functions;
    std::map<std::string, std::vector<std::pair<std::string, std::string>>> classes;
    std::vector<std::string> assets;
    std::map<std::string, std::vector<std::string>> parents;
    std::map<std::string,uint32_t> typeFlags;
    int format = 2;
};
Program generate(const N &, const Analysis &);
std::string disassemble(const Program &);
void writeBytecode(const Program &, const fs::path &);
Program readBytecode(const fs::path &);
std::string encodeBytecode(const Program &);
Program decodeBytecode(const std::string &);
void buildExecutable(const Program &, const fs::path &host, const fs::path &output);
bool readEmbedded(const fs::path &, Program &);
fs::path executablePath();

struct Stage {
    std::string name, state = "pending", detail;
    double milliseconds = 0;
};
struct Build {
    bool ok = false;
    Program program;
    N ast;
    std::vector<Token> tokens;
    Analysis analysis;
    std::vector<Stage> stages;
    std::vector<Fault> errors;
};
using Progress = std::function<void(int, const Stage &)>;
Build compile(const std::string &, const fs::path &, Progress = {});

struct Cell;
struct Array;
struct Object;
struct Env;
struct Callable;
struct Mapping;
struct Task;
struct Value {
    enum Kind { Null, Integer, Decimal, Boolean, String, Input, List, Record, Ref,
                FunctionValue, Dictionary, SetValue, TaskValue, Dynamic } kind = Null;
    int64_t integer = 0;
    double number = 0;
    std::string text;
    std::shared_ptr<Array> array;
    std::shared_ptr<Object> object;
    std::shared_ptr<Cell> ref;
    std::shared_ptr<Callable> callable;
    std::shared_ptr<Mapping> mapping;
    std::shared_ptr<Task> task;
    static Value i(int64_t);
    static Value d(double);
    static Value b(bool);
    static Value s(std::string);
    static Value input(std::string);
    static Value list(std::vector<Value>, std::string elementType = "any");
    static Value obj(std::string type);
    static Value reference(std::shared_ptr<Cell>);
    Value raw() const;
    std::string type() const;
    std::string str(int depth = 0) const;
    double numeric() const;
    bool truth() const;
};
struct Cell {
    Value value;
    std::string type = "any";
    bool fixed = false;
};
struct Array {
    std::string elementType = "any";
    std::vector<std::shared_ptr<Cell>> values;
    bool fixed = false;
    uint64_t version = 0;
};
struct Object {
    std::string type;
    std::map<std::string, std::shared_ptr<Cell>> fields;
    bool fixed = false;
    std::set<std::string> parents;
};
struct Env {
    std::shared_ptr<Env> parent;
    std::map<std::string, std::shared_ptr<Cell>> values;
    std::shared_ptr<Cell> find(const std::string &) const;
};
struct Callable {
    std::string name, signature;
    std::shared_ptr<Env> environment;
    Value receiver;
};
struct Mapping {
    std::string keyType, valueType;
    std::vector<std::pair<Value,Value>> entries;
    std::unordered_map<std::string,size_t> index;
    bool fixed = false, unique = false;
    uint64_t version = 0;
};
struct TrapState {
    int begin = 0, end = 0;
    std::shared_ptr<Env> env;
    size_t size = 0;
};
struct FrameState {
    const std::vector<Ins> *code = nullptr;
    std::shared_ptr<Env> env;
    std::vector<Value> stack;
    std::vector<Value> transient;
    std::vector<TrapState> traps;
    size_t pc = 0;
    bool done = false, suspended = false;
    bool cooperative = false;
    std::shared_ptr<Task> waiting;
    std::string name;
    Span at;
};
struct Task {
    enum State { Pending, Fulfilled, Rejected, Cancelled } state = Pending;
    enum Kind { FunctionTask, TimerTask, HostTask } kind = FunctionTask;
    uint64_t id = 0;
    std::string resultType = "khali";
    Value result;
    std::shared_ptr<Fault> failure;
    std::shared_ptr<FrameState> frame;
    std::shared_ptr<Task> waiting;
    std::future<Value> future;
    double deadline = 0;
    bool observed = false;
    bool reported = false;
};
struct DebugFrame { std::string function; Span at; std::map<std::string,Value> locals; };
Value convert(Value, const std::string &, const Span &);
Value defaultValue(const std::string &);
void setField(Value &, const std::string &, Value, std::string type = "any");
Value field(const Value &, const std::string &, Value fallback = {});
struct RuntimeIO {
    std::function<void(const std::string &)> print;
    std::function<std::string()> read;
    std::function<void(const std::string &)> warning;
    std::function<void(const std::vector<uint32_t> &, int, int)> frame;
    std::function<bool(const std::string &)> key;
    std::function<std::pair<int, int>()> mouse;
    std::atomic<bool> *stop = nullptr;
    std::function<void(const Span &, const std::vector<DebugFrame> &)> debug;
};
struct Image {
    int width = 0, height = 0;
    std::vector<uint32_t> pixels;
};
struct Vertex {
    double x = 0, y = 0, z = 0, u = 0, v = 0;
};
struct Face {
    Vertex a, b, c;
};
struct Actor {
    std::string name;
    Value data;
    bool mesh = false, spawned = false;
    double spawnEvery = 0, spawnTime = 0, frame = 0;
    int sheetStart = 0, sheetEnd = 0, sheetFPS = 0;
};
struct Handler {
    std::string kind, function;
    std::vector<Value> args;
    double elapsed = 0;
};
struct Particle {
    double x, y, z, vx, vy, life;
    uint32_t color;
};
struct World {
    bool active = false, paused = false, over = false, won = false, debug = false;
    int dimension = 2, width = 900, height = 650;
    std::string title = "Jimsabz", message;
    uint32_t background = 0xff080f20;
    Value camera, light;
    std::vector<Actor> actors;
    std::vector<Handler> handlers;
    std::vector<std::string> hud;
    std::vector<Particle> particles;
    std::vector<uint32_t> pixels;
    std::vector<float> depth;
    std::map<std::string, Image> images;
    std::map<std::string, std::vector<Face>> meshes;
    std::string scene;
    std::set<std::string> previousKeys;
    double time = 0;
};
struct Network;
class VM {
  public:
    Program program;
    RuntimeIO io;
    World world;
    std::shared_ptr<Env> globals = std::make_shared<Env>();
    std::mt19937 random{std::random_device{}()};
    size_t instructions = 0, instructionLimit = 10000000;
    int callDepth = 0;
    std::shared_ptr<Network> network;
    std::vector<std::shared_ptr<Task>> tasks;
    std::vector<DebugFrame> frames;
    std::vector<FrameState*> activeFrames;
    std::vector<Value> hostRoots;
    std::vector<std::weak_ptr<Env>> heapEnvs;
    std::vector<std::weak_ptr<Object>> heapObjects;
    std::vector<std::weak_ptr<Array>> heapArrays;
    std::vector<std::weak_ptr<Mapping>> heapMappings;
    uint64_t nextTask = 1;
    bool pumping = false;
    explicit VM(Program p, RuntimeIO output = {}) : program(std::move(p)), io(std::move(output)) {}
    ~VM();
    void collect(bool shuttingDown = false);
    Value run();
    Value execute(const std::vector<Ins> &, std::shared_ptr<Env>);
    Value executeFrame(FrameState &);
    Value invoke(const std::string &, const std::vector<Value> &, const Span &, Value receiver = {},
                 std::shared_ptr<Env> capture = {}, const std::vector<std::string> &labels = {});
    Value invokeValue(Value, const std::vector<Value> &, const Span &, const std::vector<std::string> & = {});
    void pumpTasks();
    Value awaitTask(Value, const Span &);
    double taskClock() const;
    Value makeTask(std::shared_ptr<Task>);
    Value builtin(const std::string &, const std::vector<Value> &, const Span &);
    void tick(double dt);
    void render();
    void gameLoop(int maxFrames = -1, bool realtime = true);
    void cancelled(const Span &at = {});
    fs::path safePath(const std::string &, const Span &, bool data = false) const;
};
Value standardCall(VM &, const std::string &, const std::vector<Value> &, const Span &);
std::string standardResult(const std::string &, const std::vector<std::string> &, const Span &);
bool standardModule(const std::string &);
std::string collectionKey(const Value &);
void verifyBytecode(const Program &);
Value networkCall(VM &, const std::string &, const std::vector<Value> &);
Image loadImage(const fs::path &);
std::vector<Face> loadMesh(const fs::path &);
uint32_t color(const Value &);
void saveFrame(const World &, const fs::path &);
void nativeGame(VM &);
void nativeSound(const fs::path &, const std::string &tag = "", bool loop = false);
void stopSound();
void nativeVolume(int);
void mentor(bool success, const fs::path &root);
int launchStudio(const std::string &file = "");
} // namespace jim
