#include "jimsabz.hpp"
#include "sindhi_numbers.hpp"
#include <fstream>
#include <limits>
#include <thread>

namespace jim {
thread_local VM *heapOwner = nullptr;
Value Value::i(int64_t n) {
    Value v;
    v.kind = Integer;
    v.integer = n;
    return v;
}
Value Value::d(double n) {
    if (!std::isfinite(n))
        throw std::runtime_error("Numeric result is not finite.");
    Value v;
    v.kind = Decimal;
    v.number = n;
    return v;
}
Value Value::b(bool n) {
    Value v;
    v.kind = Boolean;
    v.integer = n;
    return v;
}
Value Value::s(std::string s) {
    Value v;
    v.kind = String;
    v.text = std::move(s);
    return v;
}
Value Value::input(std::string s) {
    auto v = Value::s(std::move(s));
    v.kind = Input;
    return v;
}
Value Value::list(std::vector<Value> values, std::string type) {
    Value v;
    v.kind = List;
    v.array = std::make_shared<Array>();
    if(heapOwner)heapOwner->heapArrays.push_back(v.array);
    v.array->elementType = std::move(type);
    for (auto &x : values)
        v.array->values.push_back(std::make_shared<Cell>(Cell{x.raw(), v.array->elementType}));
    return v;
}
Value Value::obj(std::string type) {
    Value v;
    v.kind = Record;
    v.object = std::make_shared<Object>();
    if(heapOwner)heapOwner->heapObjects.push_back(v.object);
    v.object->type = std::move(type);
    return v;
}
Value Value::reference(std::shared_ptr<Cell> cell) {
    Value v;
    v.kind = Ref;
    v.ref = std::move(cell);
    return v;
}
Value Value::raw() const {
    if (kind == Ref) {
        if (!ref)
            throw std::runtime_error("Invalid reference.");
        return ref->value.raw();
    }
    return *this;
}
std::string Value::type() const {
    auto v = raw();
    switch (v.kind) {
    case FunctionValue: return v.callable->signature;
    case Dictionary: return "Map<"+v.mapping->keyType+","+v.mapping->valueType+">";
    case SetValue: return "Set<"+v.mapping->keyType+">";
    case TaskValue: return "Task<"+v.task->resultType+">";
    case Dynamic: return "Core.Value";
    case Integer:
        return "adad";
    case Decimal:
        return "dec";
    case Boolean:
        return "isharo";
    case String:
        return "lafz";
    case Input:
        return "input";
    case List:
        return "qatar " + v.array->elementType;
    case Record:
        return v.object->type;
    default:
        return "khali";
    }
}
double Value::numeric() const {
    auto v = raw();
    if (v.kind == Integer)
        return double(v.integer);
    if (v.kind == Decimal)
        return v.number;
    throw std::runtime_error("Expected a numeric value.");
}
bool Value::truth() const {
    auto v = raw();
    if (v.kind != Boolean)
        throw std::runtime_error("Expected isharo condition.");
    return v.integer != 0;
}
std::string Value::str(int depth) const {
    if (depth > 12)
        return "...";
    auto v = raw();
    switch (v.kind) {
    case FunctionValue:return "<kam "+v.callable->name+">";
    case TaskValue:return std::string("<Task ")+(v.task->state==Task::Pending?"pending":v.task->state==Task::Fulfilled?"fulfilled":v.task->state==Task::Cancelled?"cancelled":"rejected")+">";
    case Dynamic:return v.ref->value.str(depth+1);
    case Dictionary: case SetValue:{
        std::string out=v.kind==Dictionary?"Map{":"Set{";
        for(size_t i=0;i<v.mapping->entries.size();++i){if(i)out+=", ";out+=v.mapping->entries[i].first.str(depth+1);if(v.kind==Dictionary)out+=": "+v.mapping->entries[i].second.str(depth+1);}
        return out+"}";
    }
    case Integer:
        return std::to_string(v.integer);
    case Decimal: {
        std::ostringstream s;
        s << std::setprecision(12) << v.number;
        return s.str();
    }
    case Boolean:
        return v.integer ? "ha" : "na";
    case String:
    case Input:
        return v.text;
    case List: {
        std::string s = "[";
        for (auto &c : v.array->values) {
            if (s.size() > 1)
                s += ", ";
            s += c->value.str(depth + 1);
        }
        return s + "]";
    }
    case Record: {
        std::string s = v.object->type + "{";
        bool first = true;
        for (auto &c : v.object->fields) {
            if (!first)
                s += ", ";
            first = false;
            s += c.first + ": " + c.second->value.str(depth + 1);
        }
        return s + "}";
    }
    default:
        return "khali";
    }
}
std::shared_ptr<Cell> Env::find(const std::string &name) const {
    auto it = values.find(name);
    if (it != values.end())
        return it->second;
    return parent ? parent->find(name) : nullptr;
}
void setField(Value &value, const std::string &name, Value data, std::string type) {
    auto v = value.raw();
    if (v.kind != Value::Record)
        throw std::runtime_error("Expected an object.");
    auto found = v.object->fields.find(name);
    if (found != v.object->fields.end())
        found->second->value = data.raw();
    else
        v.object->fields[name] = std::make_shared<Cell>(Cell{data.raw(), std::move(type)});
}
Value field(const Value &value, const std::string &name, Value fallback) {
    auto v = value.raw();
    if (v.kind != Value::Record)
        return fallback;
    auto it = v.object->fields.find(name);
    return it == v.object->fields.end() ? fallback : it->second->value.raw();
}
Value defaultValue(const std::string &type) {
    if(nullableType(type))return {};
    if (type == "adad")
        return Value::i(0);
    if (type == "dec")
        return Value::d(0);
    if (type == "isharo")
        return Value::b(false);
    if (type == "lafz")
        return Value::s("");
    if (type.rfind("qatar ", 0) == 0)
        return Value::list({}, type.substr(6));
    if (type == "khali")
        return {};
    return Value::obj(type);
}
Value convert(Value v, const std::string &type, const Span &at) {
    v = v.raw();
    if(nullableType(type)){if(v.kind==Value::Null)return v;return convert(v,type.substr(0,type.size()-1),at);}
    if(type=="Core.Value") {
        if(v.kind==Value::Dynamic)return v;
        Value box;box.kind=Value::Dynamic;box.ref=std::make_shared<Cell>(Cell{v,v.type(),false});return box;
    }
    if(v.kind==Value::Record&&v.object->parents.count(type))return v;
    if (type == "any")
        return v;
    if (v.kind == Value::Input) {
        if (type == "lafz")
            return Value::s(v.text);
        auto str = v.text;
        auto start = str.find_first_not_of(" \t\r\n");
        auto end = str.find_last_not_of(" \t\r\n");
        str = start == std::string::npos ? "" : str.substr(start, end - start + 1);
        try {
            size_t used = 0;
            if (type == "adad") {
                auto n = std::stoll(str, &used);
                if (used == str.size())
                    return Value::i(n);
            }
            if (type == "dec") {
                auto n = std::stod(str, &used);
                if (used == str.size() && std::isfinite(n))
                    return Value::d(n);
            }
            if (type == "isharo") {
                if (str == "ha" || str == "true" || str == "1")
                    return Value::b(true);
                if (str == "na" || str == "false" || str == "0")
                    return Value::b(false);
            }
        } catch (...) {
        }
        throw Fault("RUN-01", 5, at, "Input '" + v.text + "' is not a valid " + type + " value.");
    }
    if (type == "dec" && v.kind == Value::Integer)
        return Value::d(double(v.integer));
    if (type.rfind("qatar ", 0) == 0 && v.kind == Value::List) {
        auto element = type.substr(6);
        if (v.array->elementType == element)
            return v;
        std::vector<Value> converted;
        for (auto &x : v.array->values)
            converted.push_back(convert(x->value, element, at));
        return Value::list(std::move(converted), element);
    }
    if (v.type() == type)
        return v;
    throw Fault("RUN-01", 5, at, "Cannot store " + v.type() + " in " + type + ".");
}
namespace {
void freeze(Value v, int depth = 0) {
    if (depth > 64)
        throw std::runtime_error("Constant is nested too deeply.");
    v = v.raw();
    if (v.kind == Value::List && !v.array->fixed) {
        v.array->fixed = true;
        for (auto &c : v.array->values) {
            c->fixed = true;
            freeze(c->value, depth + 1);
        }
    }
    if (v.kind == Value::Record && !v.object->fixed) {
        v.object->fixed = true;
        for (auto &kv : v.object->fields) {
            kv.second->fixed = true;
            freeze(kv.second->value, depth + 1);
        }
    }
    if((v.kind==Value::Dictionary||v.kind==Value::SetValue)&&!v.mapping->fixed) {
        v.mapping->fixed=true;
        for(auto &pair:v.mapping->entries){freeze(pair.first,depth+1);freeze(pair.second,depth+1);}
    }
    if(v.kind==Value::Dynamic&&!v.ref->fixed){v.ref->fixed=true;freeze(v.ref->value,depth+1);}

}
std::vector<std::string> split(const std::string &s) {
    std::vector<std::string> r;
    size_t start = 0;
    for (size_t i = 0; i <= s.size(); i++)
        if (i == s.size() || s[i] == '\x1f') {
            r.push_back(s.substr(start, i - start));
            start = i + 1;
        }
    return r;
}
int64_t integerOp(int64_t a, int64_t b, const std::string &op) {
    auto min = std::numeric_limits<int64_t>::min(), max = std::numeric_limits<int64_t>::max();
    if (op == "+") {
        if ((b > 0 && a > max - b) || (b < 0 && a < min - b))
            throw std::runtime_error("Integer addition overflow.");
        return a + b;
    }
    if (op == "-") {
        if ((b < 0 && a > max + b) || (b > 0 && a < min + b))
            throw std::runtime_error("Integer subtraction overflow.");
        return a - b;
    }
    if (op == "*") {
        if (a == 0 || b == 0)
            return 0;
        if ((a == -1 && b == min) || (b == -1 && a == min))
            throw std::runtime_error("Integer multiplication overflow.");
        if (a > 0 ? (b > 0 ? a > max / b : b < min / a) : (b > 0 ? a < min / b : a < max / b))
            throw std::runtime_error("Integer multiplication overflow.");
        return a * b;
    }
    if (b == 0)
        throw std::runtime_error("Division by zero.");
    if (a == min && b == -1) {
        if (op == "%")
            return 0;
        throw std::runtime_error("Integer division overflow.");
    }
    return op == "/" ? a / b : a % b;
}
Value operation(Value l, Value r, const std::string &op) {
    l = l.raw();
    r = r.raw();
    if (l.kind == Value::Record && (l.type() == "vec2" || l.type() == "vec3") &&
        (op == "+" || op == "-" || op == "*" || op == "/")) {
        auto v = Value::obj(l.type());
        for (auto &kv : l.object->fields)
            setField(v, kv.first,
                     operation(kv.second->value, r.kind == Value::Record ? field(r, kv.first) : r, op),
                     "dec");
        return v;
    }
    if (op == "+" && l.kind == Value::String)
        return Value::s(l.text + r.str());
    if (op == "==" || op == "!=") {
        bool equal = false;
        if ((l.kind == Value::Integer || l.kind == Value::Decimal) &&
            (r.kind == Value::Integer || r.kind == Value::Decimal))
            equal = l.kind == Value::Integer && r.kind == Value::Integer ? l.integer == r.integer
                                                                         : l.numeric() == r.numeric();
        else if (l.kind == r.kind) {
            switch (l.kind) {
            case Value::Null:
                equal = true;
                break;
            case Value::Boolean:
                equal = l.integer == r.integer;
                break;
            case Value::String:
                equal = l.text == r.text;
                break;
            case Value::List:
                equal = l.array == r.array;
                break;
            case Value::Record: equal=l.object==r.object;break;
            case Value::Dictionary: case Value::SetValue: equal=l.mapping==r.mapping;break;
            case Value::FunctionValue: equal=l.callable==r.callable;break;
            case Value::TaskValue: equal=l.task==r.task;break;
            case Value::Dynamic: equal=l.ref==r.ref;break;
            default:
                break;
            }
        }
        return Value::b(op == "==" ? equal : !equal);
    }
    if (op == "&&" || op == "||")
        return Value::b(op == "&&" ? (l.truth() && r.truth()) : (l.truth() || r.truth()));
    if (op == ">" || op == "<" || op == ">=" || op == "<=") {
        if (l.kind == Value::String && r.kind == Value::String)
            return Value::b(op == ">"    ? l.text > r.text
                            : op == "<"  ? l.text < r.text
                            : op == ">=" ? l.text >= r.text
                                         : l.text <= r.text);
        if (l.kind == Value::Integer && r.kind == Value::Integer)
            return Value::b(op == ">"    ? l.integer > r.integer
                            : op == "<"  ? l.integer < r.integer
                            : op == ">=" ? l.integer >= r.integer
                                         : l.integer <= r.integer);
        auto a = l.numeric(), b = r.numeric();
        return Value::b(op == ">" ? a > b : op == "<" ? a < b : op == ">=" ? a >= b : a <= b);
    }
    if (l.kind == Value::Integer && r.kind == Value::Integer)
        return Value::i(integerOp(l.integer, r.integer, op));
    auto a = l.numeric(), b = r.numeric();
    if (op == "/") {
        if (b == 0)
            throw std::runtime_error("Division by zero.");
        return Value::d(a / b);
    }
    if (op == "+")
        return Value::d(a + b);
    if (op == "-")
        return Value::d(a - b);
    if (op == "*")
        return Value::d(a * b);
    throw std::runtime_error("Unsupported arithmetic operation.");
}
void append32(std::string &out, uint32_t x) {
    for (int i = 0; i < 4; i++)
        out += char(x >> (i * 8));
}
uint32_t take32(const std::string &in, size_t &p) {
    if (p + 4 > in.size())
        throw std::runtime_error("Truncated save file.");
    uint32_t n = 0;
    for (int i = 0; i < 4; i++)
        n |= uint32_t(static_cast<unsigned char>(in[p++])) << (8 * i);
    return n;
}
void putString(std::string &out, const std::string &s) {
    append32(out, uint32_t(s.size()));
    out += s;
}
std::string takeString(const std::string &in, size_t &p) {
    auto n = take32(in, p);
    if (n > 16 * 1024 * 1024 || p + n > in.size())
        throw std::runtime_error("Invalid save string.");
    auto s = in.substr(p, n);
    p += n;
    return s;
}
void saveValue(std::string &out, Value v, int depth) {
    if (depth > 32)
        throw std::runtime_error("Save value is cyclic or nested too deeply.");
    v = v.raw();
    if(v.kind>=Value::FunctionValue)throw std::runtime_error("Snapshots cannot store functions, tasks or Map/Set values; save plain data explicitly.");
    append32(out, v.kind);
    if (v.kind == Value::Integer || v.kind == Value::Decimal || v.kind == Value::Boolean ||
        v.kind == Value::String || v.kind == Value::Input)
        putString(out, v.str());
    else if (v.kind == Value::List) {
        putString(out, v.array->elementType);
        append32(out, uint32_t(v.array->values.size()));
        for (auto &c : v.array->values)
            saveValue(out, c->value, depth + 1);
    } else if (v.kind == Value::Record) {
        putString(out, v.object->type);
        append32(out, uint32_t(v.object->fields.size()));
        for (auto &kv : v.object->fields) {
            putString(out, kv.first);
            putString(out, kv.second->type);
            saveValue(out, kv.second->value, depth + 1);
        }
    }
    if (out.size() > 16 * 1024 * 1024)
        throw std::runtime_error("Save file exceeds 16 MiB.");
}
Value loadValue(const std::string &in, size_t &p, int depth) {
    if (depth > 32)
        throw std::runtime_error("Save is nested too deeply.");
    auto kind = take32(in, p);
    if (kind == Value::Null)
        return {};
    if (kind == Value::Integer)
        return Value::i(std::stoll(takeString(in, p)));
    if (kind == Value::Decimal)
        return Value::d(std::stod(takeString(in, p)));
    if (kind == Value::Boolean) {
        auto s = takeString(in, p);
        if (s != "ha" && s != "na")
            throw std::runtime_error("Invalid save boolean.");
        return Value::b(s == "ha");
    }
    if (kind == Value::String || kind == Value::Input)
        return Value::s(takeString(in, p));
    if (kind == Value::List) {
        auto type = takeString(in, p);
        auto count = take32(in, p);
        if (count > 1000000)
            throw std::runtime_error("Invalid save array size.");
        std::vector<Value> values;
        for (uint32_t i = 0; i < count; i++)
            values.push_back(loadValue(in, p, depth + 1));
        return Value::list(std::move(values), type);
    }
    if (kind == Value::Record) {
        auto v = Value::obj(takeString(in, p));
        auto count = take32(in, p);
        if (count > 10000)
            throw std::runtime_error("Invalid save object size.");
        for (uint32_t i = 0; i < count; i++) {
            auto name = takeString(in, p), type = takeString(in, p);
            setField(v, name, loadValue(in, p, depth + 1), type);
        }
        return v;
    }
    throw std::runtime_error("Unknown save value tag.");
}
void restore(Value &current, Value saved) {
    current = current.raw();
    saved = saved.raw();
    if (current.kind == Value::Record && saved.kind == Value::Record && current.type() == saved.type()) {
        for (auto &kv : saved.object->fields) {
            auto it = current.object->fields.find(kv.first);
            if (it != current.object->fields.end())
                restore(it->second->value, kv.second->value);
            else
                current.object->fields[kv.first] = kv.second;
        }
    } else
        current = saved;
}
} // namespace
void VM::cancelled(const Span &at) {
    if (io.stop && io.stop->load())
        throw Fault("RUN-CANCEL", 5, at, "Execution stopped.");
}
Value VM::run() {
    verifyBytecode(program);
    globals->values["dt"] = std::make_shared<Cell>(Cell{Value::d(1.0 / 60), "dec", true});
    globals->values["mouse_x"] = std::make_shared<Cell>(Cell{Value::i(0), "adad", true});
    globals->values["mouse_y"] = std::make_shared<Cell>(Cell{Value::i(0), "adad", true});
    return execute(program.code, globals);
}
Value VM::execute(const std::vector<Ins> &code, std::shared_ptr<Env> env) {
    FrameState frame;frame.code=&code;frame.env=std::move(env);frame.name=frames.empty()?"main":frames.back().function;
    auto out=executeFrame(frame);
    if(frame.suspended)throw Fault("RUN-ASYNC",5,{},"A synchronous frame cannot suspend.");
    return out;
}
Value VM::executeFrame(FrameState &frame) {
    auto &code=*frame.code;auto &env=frame.env;auto &stack=frame.stack;auto &traps=frame.traps;
    struct Active {
        VM &vm;VM *old;
        Active(VM &v,FrameState &f):vm(v),old(heapOwner){heapOwner=&v;v.activeFrames.push_back(&f);}
        ~Active(){vm.activeFrames.pop_back();heapOwner=old;}
    } active(*this,frame);
    frame.suspended=false;size_t quantum=0;
    auto pop = [&]() {
        if (stack.empty())
            throw std::runtime_error("Invalid bytecode: stack underflow.");
        auto v = stack.back();
        stack.pop_back();frame.transient.push_back(v);
        return v;
    };
    auto arguments = [&](int n) {
        if (n < 0 || size_t(n) > stack.size())
            throw std::runtime_error("Invalid bytecode argument stack.");
        std::vector<Value> args(n);
        for (int i = n - 1; i >= 0; i--)
            args[i] = pop().raw();
        return args;
    };
    auto &pc=frame.pc;
    while (pc < code.size()) {
        frame.transient.clear();
        if(frame.cooperative&&quantum++>=10000){frame.suspended=true;return {};}
        if(instructions && instructions%4096==0)collect();
        const auto &ins = code[pc++];frame.at=ins.at;
        try {
            cancelled(ins.at);
            if(io.debug) {
                std::vector<DebugFrame> snapshot;
                for(auto *current:activeFrames){DebugFrame item{current->name,current->at,{}};std::set<std::string> seen;
                    for(auto scope=current->env;scope;scope=scope->parent)for(auto &kv:scope->values)if(kv.first.rfind("$",0)!=0&&seen.insert(kv.first).second)item.locals[kv.first]=kv.second->value;
                    snapshot.push_back(std::move(item));}
                io.debug(ins.at,snapshot);
            }
            if (++instructions > instructionLimit)
                throw Fault("RUN-LIMIT", 5, ins.at, "Instruction limit reached. Check for an endless loop.");
            if (stack.size() > 1000000)
                throw Fault("RUN-LIMIT", 5, ins.at, "Operand stack limit reached.");
            switch (ins.op) {
            case Op::Push: {
                Value v;
                if (ins.a == 1)
                    v = Value::i(std::stoll(ins.text));
                else if (ins.a == 2)
                    v = Value::d(std::stod(ins.text));
                else if (ins.a == 3)
                    v = Value::b(ins.text == "1");
                else if (ins.a == 4)
                    v = Value::s(ins.text);
                else if (ins.a != 0)
                    throw std::runtime_error("Invalid literal tag.");
                stack.push_back(v);
                break;
            }
            case Op::Load: {
                auto cell = env->find(ins.text);
                if (!cell)
                    throw std::runtime_error("Name '" + ins.text + "' has no runtime value.");
                stack.push_back(Value::reference(cell));
                break;
            }
            case Op::Declare: {
                auto fields = split(ins.text);
                if (fields.size() != 2)
                    throw std::runtime_error("Invalid declaration bytecode.");
                if (env->values.count(fields[0]))
                    throw std::runtime_error("Duplicate runtime variable '" + fields[0] + "'.");
                auto value = convert(pop(), fields[1], ins.at);
                if (ins.a)
                    freeze(value);
                env->values[fields[0]] = std::make_shared<Cell>(Cell{value, fields[1], ins.a != 0});
                break;
            }
            case Op::Read: {
                auto v = pop().raw();
                stack.push_back(v);
                break;
            }
            case Op::Pop:
                pop();
                break;
            case Op::Dup:
                if (stack.empty())
                    throw std::runtime_error("Invalid DUP.");
                else
                    stack.push_back(stack.back());
                break;
            case Op::Member: {
                auto v = pop().raw();
                if (v.kind == Value::List && ins.text == "lambai") {
                    stack.push_back(Value::i(int64_t(v.array->values.size())));
                    break;
                }
                if((v.kind==Value::Dictionary||v.kind==Value::SetValue)&&(ins.text=="lambai"||ins.text=="size")){stack.push_back(Value::i(v.mapping->entries.size()));break;}
                if (v.kind != Value::Record)
                    throw std::runtime_error("Member access requires an object.");
                auto f = v.object->fields.find(ins.text);
                if (f == v.object->fields.end())
                    throw std::runtime_error("Unknown field '" + ins.text + "'.");
                stack.push_back(Value::reference(f->second));
                break;
            }
            case Op::Index: {
                auto index = pop().raw(), base = pop().raw();
                if (index.kind != Value::Integer || base.kind != Value::List)
                    throw std::runtime_error("Array index requires qatar[adad].");
                if (index.integer < 0 || uint64_t(index.integer) >= base.array->values.size())
                    throw std::runtime_error("Array index " + index.str() + " is out of bounds (length " +
                                             std::to_string(base.array->values.size()) + ").");
                stack.push_back(Value::reference(base.array->values[size_t(index.integer)]));
                break;
            }
            case Op::Array: {
                auto args = arguments(ins.a);
                for (auto &v : args)
                    v = convert(v, ins.text, ins.at);
                stack.push_back(Value::list(std::move(args), ins.text));
                break;
            }
            case Op::Vector: {
                if (ins.a < 2 || ins.a > 3)
                    throw std::runtime_error("Invalid vector bytecode.");
                auto args = arguments(ins.a);
                if(program.typeFlags[ins.text]&3)throw std::runtime_error("Cannot construct an abstract/interface type.");
                auto v = Value::obj(ins.text);
                for (int i = 0; i < ins.a; i++)
                    setField(v, std::string(1, "xyz"[i]), Value::d(args[i].numeric()), "dec");
                stack.push_back(v);
                break;
            }
            case Op::Binary: {
                auto r = pop(), l = pop();
                stack.push_back(operation(l, r, ins.text));
                break;
            }
            case Op::Unary: {
                if(ins.text=="pre++"||ins.text=="post++"||ins.text=="pre--"||ins.text=="post--") {
                    auto target=pop();
                    if(target.kind!=Value::Ref||!target.ref||target.ref->fixed)throw std::runtime_error("Increment needs a writable numeric value.");
                    auto before=target.ref->value.raw();
                    auto next=convert(operation(before,Value::i(1),ins.text.substr(ins.text.size()-2)=="++"?"+":"-"),target.ref->type,ins.at);
                    target.ref->value=next;stack.push_back(ins.text.rfind("post",0)==0?before:next);break;
                }
                auto v = pop().raw();
                if (ins.text == "!")
                    v = Value::b(!v.truth());
                else if (ins.text == "-") {
                    if (v.kind == Value::Integer) {
                        if (v.integer == std::numeric_limits<int64_t>::min())
                            throw std::runtime_error("Integer negation overflow.");
                        v = Value::i(-v.integer);
                    } else
                        v = Value::d(-v.numeric());
                }
                stack.push_back(v);
                break;
            }
            case Op::Store: {
                auto v = pop().raw(), target = pop();
                if (target.kind != Value::Ref || !target.ref)
                    throw std::runtime_error("Assignment target is not a reference.");
                if (target.ref->fixed)
                    throw std::runtime_error("Cannot modify a pakko constant.");
                target.ref->value = convert(v, target.ref->type, ins.at);
                stack.push_back(target.ref->value);
                break;
            }
            case Op::Enter: {
                auto child = std::make_shared<Env>();
                child->parent = env;
                env = child;heapEnvs.push_back(child);
                break;
            }
            case Op::Leave:
                if (!env->parent)
                    throw std::runtime_error("Invalid scope exit.");
                else
                    env = env->parent;
                break;
            case Op::Unwind:
                for (int i = 0; i < ins.a; i++) {
                    if (!env->parent)
                        throw std::runtime_error("Invalid scope unwind.");
                    env = env->parent;
                }
                break;
            case Op::Jump:
                pc = size_t(ins.a);
                break;
            case Op::JumpFalse: {
                if (!pop().truth())
                    pc = size_t(ins.a);
                break;
            }
            case Op::JumpTrue: {
                if (pop().truth())
                    pc = size_t(ins.a);
                break;
            }
            case Op::Call: {
                auto args = arguments(ins.a);
                stack.push_back(invoke(ins.text, args, ins.at));
                break;
            }
            case Op::CallNamed: {
                auto args=arguments(ins.a);auto info=split(ins.text);
                if(info.empty())throw std::runtime_error("Invalid named call.");
                auto name=info.front();info.erase(info.begin());stack.push_back(invoke(name,args,ins.at,{}, {},info));break;
            }
            case Op::Invoke: {
                auto args=arguments(ins.a);auto callee=pop();
                stack.push_back(invokeValue(callee,args,ins.at,split(ins.text)));break;
            }
            case Op::Closure: {
                std::string name=ins.text;Value receiver;
                if(ins.a==2){receiver=pop().raw();name=name.rfind("$direct:",0)==0?name.substr(8):receiver.type()+"."+name;}
                auto f=program.functions.find(name);
                if(f==program.functions.end())throw std::runtime_error("Unknown function reference.");
                Value value;value.kind=Value::FunctionValue;value.callable=std::make_shared<Callable>();
                auto &fn=*value.callable;fn.name=name;fn.environment=ins.a==1?env:globals;fn.receiver=receiver;fn.signature=f->second.signature;
                if(fn.signature.empty()){fn.signature="kam(";for(size_t i=0;i<f->second.params.size();++i){if(i)fn.signature+=",";fn.signature+=f->second.params[i].first;}fn.signature+=")->"+f->second.result;}
                heapEnvs.push_back(fn.environment);stack.push_back(value);break;
            }
            case Op::Await: {
                auto value=pop().raw();if(value.kind!=Value::TaskValue)throw std::runtime_error("@await needs Task<T>.");
                auto task=value.task;task->observed=true;
                if(task->state==Task::Pending) {
                    if(!frame.cooperative)throw std::runtime_error("A synchronous frame cannot await.");
                    std::set<const Task*> path;
                    for(auto dependency=task;dependency&&dependency->frame;dependency=dependency->frame->waiting) {
                        if(!path.insert(dependency.get()).second||dependency->frame.get()==&frame)throw std::runtime_error("Cyclic task dependency.");
                    }
                    frame.waiting=task;stack.push_back(value);--pc;frame.suspended=true;return {};
                }
                frame.waiting.reset();if(task->failure)throw *task->failure;
                if(task->state==Task::Cancelled)throw Fault("RUN-TASK-CANCEL",5,ins.at,"Task cancelled.");
                stack.push_back(task->result);break;
            }
            case Op::Method: {
                auto args = arguments(ins.a);
                auto receiver = pop().raw();
                auto info=split(ins.text);auto method=info.front();info.erase(info.begin());
                if(receiver.kind==Value::Dictionary||receiver.kind==Value::SetValue) {
                    auto &m=*receiver.mapping;bool write=method=="set"||method=="add"||method=="remove"||method=="clear";
                    if(write&&m.fixed)throw std::runtime_error("Cannot mutate a pakko collection.");
                    if(method=="keys"||method=="values") {
                        if(!args.empty())throw std::runtime_error("Collection snapshot takes no arguments.");
                        std::vector<Value> out;for(auto &pair:m.entries)out.push_back(method=="keys"||m.unique?pair.first:pair.second);
                        stack.push_back(Value::list(std::move(out),method=="keys"||m.unique?m.keyType:m.valueType));break;
                    }
                    if(method=="clear"){if(!args.empty())throw std::runtime_error("clear takes no arguments.");m.entries.clear();m.index.clear();++m.version;stack.push_back({});break;}
                    size_t count=method=="set"?2:1;if(args.size()!=count)throw std::runtime_error("Collection method arity mismatch.");
                    auto key=convert(args[0],m.keyType,ins.at);auto encoded=collectionKey(key);auto old=m.index.find(encoded);bool exists=old!=m.index.end();
                    if(method=="get"||method=="tryGet") {
                        if(!exists&&method=="get")throw std::runtime_error("Dictionary key does not exist.");
                        stack.push_back(exists?m.entries[old->second].second:Value{});
                    }else if(method=="has"||method=="contains")stack.push_back(Value::b(exists));
                    else if(method=="remove") {
                        if(exists){m.entries.erase(m.entries.begin()+old->second);m.index.clear();for(size_t j=0;j<m.entries.size();++j)m.index[collectionKey(m.entries[j].first)]=j;++m.version;}
                        stack.push_back(Value::b(exists));
                    }else if(method=="set"||method=="add") {
                        auto value=m.unique?Value{}:convert(args[1],m.valueType,ins.at);
                        if(!exists){if(m.entries.size()>=1000000)throw std::runtime_error("Collection size limit.");m.index[encoded]=m.entries.size();m.entries.push_back({key,value});++m.version;}
                        else if(!m.unique)m.entries[old->second].second=value;
                        stack.push_back(m.unique?Value::b(!exists):Value{});
                    }else throw std::runtime_error("Unknown collection method.");
                    break;
                }
                if (receiver.kind == Value::List) {
                    if (receiver.array->fixed && (method=="joryo"||method=="kadh"||method=="insert"||method=="reverse"))
                        throw std::runtime_error("Cannot mutate a pakko array through an alias.");
                    if (method == "joryo") {
                        if (args.size() != 1)
                            throw std::runtime_error("joryo expects one value.");
                        if (receiver.array->values.size() >= 1000000)
                            throw std::runtime_error("Array size limit reached.");
                        receiver.array->values.push_back(
                            std::make_shared<Cell>(Cell{convert(args[0], receiver.array->elementType, ins.at),
                                                        receiver.array->elementType}));
                        ++receiver.array->version;
                        stack.push_back({});
                    } else if (method == "kadh") {
                        if (args.size() != 1 || args[0].kind != Value::Integer)
                            throw std::runtime_error("kadh expects an adad index.");
                        auto i = args[0].integer;
                        if (i < 0 || uint64_t(i) >= receiver.array->values.size())
                            throw std::runtime_error("kadh index is out of bounds.");
                        auto v = receiver.array->values[size_t(i)]->value;
                        receiver.array->values.erase(receiver.array->values.begin() + i);
                        ++receiver.array->version;
                        stack.push_back(v);
                    } else if(method=="map"||method=="filter"||method=="reduce") {
                        if(args.size()!=(method=="reduce"?2u:1u))throw std::runtime_error("Wrong callback method arity.");
                        auto callback=args[method=="reduce"?1:0];
                        auto type=method=="map"?functionResult(callback.type()):receiver.array->elementType;
                        Value out=method=="reduce"?args[0]:Value::list({},type);
                        frame.transient.push_back(out);
                        auto version=receiver.array->version;size_t count=receiver.array->values.size();
                        for(size_t i=0;i<count;++i) {
                            auto item=receiver.array->values[i]->value;
                            auto value=invokeValue(callback,method=="reduce"?std::vector<Value>{out,item}:std::vector<Value>{item},ins.at);
                            if(receiver.array->version!=version)throw std::runtime_error("Collection modified during callback iteration.");
                            if(method=="reduce"){out=value;frame.transient.push_back(out);}
                            else if(method=="map"||value.truth())out.array->values.push_back(std::make_shared<Cell>(Cell{method=="map"?convert(value,type,ins.at):item,type}));
                        }
                        stack.push_back(out);
                    } else if(method=="reverse") {
                        if(!args.empty())throw std::runtime_error("reverse takes no arguments.");
                        std::reverse(receiver.array->values.begin(),receiver.array->values.end());++receiver.array->version;stack.push_back({});
                    } else if(method=="insert") {
                        if(args.size()!=2||args[0].kind!=Value::Integer||args[0].integer<0||uint64_t(args[0].integer)>receiver.array->values.size())throw std::runtime_error("insert index is out of bounds.");
                        if(receiver.array->values.size()>=1000000)throw std::runtime_error("Array size limit.");
                        auto cell=std::make_shared<Cell>(Cell{convert(args[1],receiver.array->elementType,ins.at),receiver.array->elementType});
                        receiver.array->values.insert(receiver.array->values.begin()+args[0].integer,cell);++receiver.array->version;stack.push_back({});
                    } else if(method=="contains") {
                        if(args.size()!=1)throw std::runtime_error("contains takes one value.");bool found=false;
                        for(auto &cell:receiver.array->values)if(operation(cell->value,args[0],"==").truth()){found=true;break;}
                        stack.push_back(Value::b(found));
                    } else
                        throw std::runtime_error("Unknown qatar method.");
                } else if (receiver.kind == Value::Record)
                    stack.push_back(invoke(method.rfind("$direct:",0)==0?method.substr(8):receiver.type()+"."+method,args,ins.at,receiver,{},info));
                else
                    throw std::runtime_error("Method receiver must be an array or object.");
                break;
            }
            case Op::New: {
                auto args = arguments(ins.a);
                auto it = program.classes.find(ins.text);
                if (it == program.classes.end() || it->second.size() != args.size())
                    throw std::runtime_error("Invalid object constructor.");
                auto v = Value::obj(ins.text);
                if(program.parents.count(ins.text))v.object->parents={program.parents.at(ins.text).begin(),program.parents.at(ins.text).end()};
                for (size_t i = 0; i < args.size(); i++)
                    setField(v, it->second[i].second, convert(args[i], it->second[i].first, ins.at),
                             it->second[i].first);
                stack.push_back(v);
                break;
            }
            case Op::Return:
                frame.done=true;return stack.empty() ? Value{} : pop().raw();
            case Op::Print: {
                auto s = pop().str() + "\n";
                if (io.print)
                    io.print(s);
                break;
            }
            case Op::Try:
                traps.push_back({int(pc), ins.a, env, stack.size()});
                break;
            case Op::EndTry:
                if (!traps.empty())
                    traps.pop_back();
                break;
            case Op::Throw:
                throw std::runtime_error(pop().str());
            case Op::Entity: {
                auto data = arguments(ins.a * 2);
                auto info = split(ins.text);
                if (info.size() != 2)
                    throw std::runtime_error("Invalid entity bytecode.");
                Actor actor;
                actor.name = info[0];
                actor.mesh = info[1] == "3";
                actor.data = Value::obj("@" + actor.name);
                auto vec = [](double x, double y, double z, bool three) {
                    auto v = Value::obj(three ? "vec3" : "vec2");
                    setField(v, "x", Value::d(x), "dec");
                    setField(v, "y", Value::d(y), "dec");
                    if (three)
                        setField(v, "z", Value::d(z), "dec");
                    return v;
                };
                setField(actor.data, "jagah", vec(0, 0, 0, false), "vec2");
                setField(actor.data, "jagah3d", vec(0, 0, 0, true), "vec3");
                setField(actor.data, "ghumao", vec(0, 0, 0, true), "vec3");
                setField(actor.data, "paimano", vec(1, 1, 1, true), "vec3");
                setField(actor.data, "width", Value::d(40), "dec");
                setField(actor.data, "height", Value::d(40), "dec");
                setField(actor.data, "raftar", Value::d(0), "dec");
                setField(actor.data, "rang", Value::s("cyan"), "lafz");
                setField(actor.data, "visible", Value::b(true), "isharo");
                setField(actor.data, "vy", Value::d(0), "dec");
                for (size_t i = 0; i < data.size(); i += 2) {
                    auto name = data[i].str();
                    auto existing = actor.data.object->fields.find(name);
                    auto type = existing == actor.data.object->fields.end() ? data[i + 1].type()
                                                                            : existing->second->type;
                    setField(actor.data, name, convert(data[i + 1], type, ins.at), type);
                }
                auto spawn = field(actor.data, "paida");
                if (spawn.kind == Value::Record) {
                    actor.spawnEvery = field(spawn, "interval", Value::d(1)).numeric();
                    if (actor.spawnEvery <= 0)
                        throw std::runtime_error("Spawn interval must be positive.");
                    setField(actor.data, "visible", Value::b(false));
                }
                if (actor.mesh) {
                    auto shape = field(actor.data, "shakal3d", Value::s("cube")).str();
                    double minx = -.5, miny = -.5, minz = -.5, maxx = .5, maxy = .5, maxz = .5;
                    if (shape == "plane") {
                        miny = 0;
                        maxy = 0;
                    } else if (shape == "pyramid") {
                        miny = -.3;
                        maxy = .7;
                    } else if (shape != "cube" && shape != "sphere") {
                        auto mesh = world.meshes.find(shape);
                        if (mesh == world.meshes.end())
                            mesh = world.meshes.emplace(shape, loadMesh(safePath(shape, ins.at))).first;
                        minx = miny = minz = 1e300;
                        maxx = maxy = maxz = -1e300;
                        for (auto &face : mesh->second)
                            for (auto vertex : {face.a, face.b, face.c}) {
                                minx = std::min(minx, vertex.x);
                                maxx = std::max(maxx, vertex.x);
                                miny = std::min(miny, vertex.y);
                                maxy = std::max(maxy, vertex.y);
                                minz = std::min(minz, vertex.z);
                                maxz = std::max(maxz, vertex.z);
                            }
                    }
                    setField(actor.data, "$boundsMin", vec(minx, miny, minz, true));
                    setField(actor.data, "$boundsMax", vec(maxx, maxy, maxz, true));
                }
                globals->values[actor.name] = std::make_shared<Cell>(Cell{actor.data, "@" + actor.name});
                world.actors.push_back(std::move(actor));
                break;
            }
            case Op::Bind: {
                auto info = split(ins.text);
                if (info.size() != 3)
                    throw std::runtime_error("Invalid handler bytecode.");
                auto args = arguments(ins.a);
                if (info[0] == "timer" && (args.size() != 1 || args[0].numeric() <= 0))
                    throw std::runtime_error("har interval must be positive.");
                args.push_back(Value::s(info[2]));
                world.handlers.push_back({info[0], info[1], args});
                break;
            }
            case Op::Halt:
                frame.done=true;return {};
            }
            if (pc > code.size())
                throw std::runtime_error("Invalid jump target.");
            while (!traps.empty() && (int(pc) < traps.back().begin || int(pc) >= traps.back().end) &&
                   ins.op != Op::Try)
                traps.pop_back();
        } catch (const Fault &fault) {
            if (fault.code == "RUN-CANCEL" || fault.code == "RUN-LIMIT" || traps.empty())
                throw;
            auto trap = traps.back();
            traps.pop_back();
            env = trap.env;
            stack.resize(trap.size);
            stack.push_back(Value::s(fault.describe()));
            pc = size_t(trap.end);
        } catch (const std::exception &e) {
            Fault fault("RUN-01", 5, ins.at, e.what());
            if (traps.empty())
                throw fault;
            auto trap = traps.back();
            traps.pop_back();
            env = trap.env;
            stack.resize(trap.size);
            stack.push_back(Value::s(fault.describe()));
            pc = size_t(trap.end);
        }
    }
    frame.done=true;return {};
}
Value VM::invoke(const std::string &name,const std::vector<Value> &input,const Span &at,Value receiver,std::shared_ptr<Env> capture,const std::vector<std::string> &labels) {
    auto found=program.functions.find(name);
    if(found==program.functions.end())return builtin(name,input,at);
    if(callDepth>=256)throw Fault("RUN-LIMIT",5,at,"Function call depth exceeds 256.");
    auto &f=found->second;
    auto env=std::make_shared<Env>();heapEnvs.push_back(env);env->parent=capture?capture:globals;
    if(receiver.kind==Value::Record) {
        env->values=receiver.object->fields;
        env->values["paan"]=std::make_shared<Cell>(Cell{receiver,receiver.type(),true});
    }
    std::vector<Value> values(f.params.size());std::vector<bool> supplied(f.params.size());std::vector<Value> rest;
    size_t positional=0;bool named=false;
    std::vector<std::pair<std::string,Value>> args;
    for(size_t i=0;i<input.size();++i) {
        auto label=i<labels.size()?labels[i]:"";
        if(label=="*") {
            auto array=input[i].raw();
            if(array.kind!=Value::List)throw Fault("RUN-01",5,at,"Spread argument must be a qatar.");
            for(auto &cell:array.array->values)args.push_back({"",cell->value});
        }else args.push_back({label,input[i]});
    }
    for(auto &arg:args) {
        size_t slot=positional;
        if(!arg.first.empty()) {
            named=true;slot=f.params.size();
            for(size_t i=0;i<f.params.size();++i)if(f.params[i].second==arg.first){slot=i;break;}
            if(slot==f.params.size())throw Fault("RUN-01",5,at,"Unknown named argument '"+arg.first+"'.");
        }else {if(named)throw Fault("RUN-01",5,at,"Positional argument follows a named argument.");++positional;}
        if(f.variadic&&slot>=f.params.size()-1) {
            if(!arg.first.empty())throw Fault("RUN-01",5,at,"Variadic arguments are positional.");
            rest.push_back(convert(arg.second,f.params.back().first,at));continue;
        }
        if(slot>=f.params.size()||supplied[slot])throw Fault("RUN-01",5,at,"Invalid or duplicate function argument.");
        values[slot]=convert(arg.second,f.params[slot].first,at);supplied[slot]=true;
    }
    // Pin supplied values before evaluating defaults, which can call other functions.
    auto rootCount=hostRoots.size();hostRoots.insert(hostRoots.end(),input.begin(),input.end());hostRoots.push_back(receiver);
    struct Roots {VM &vm;size_t count;~Roots(){vm.hostRoots.resize(count);}} roots{*this,rootCount};
    ++callDepth;
    try {
        for(size_t i=0;i<f.params.size();++i) {
            auto type=f.params[i].first;
            if(f.variadic&&i+1==f.params.size()){values[i]=Value::list(rest,type);type="qatar "+type;supplied[i]=true;}
            if(!supplied[i]) {
                if(i>=f.defaults.size()||f.defaults[i].empty())throw Fault("RUN-01",5,at,"Missing required argument '"+f.params[i].second+"'.");
                values[i]=convert(execute(f.defaults[i],env),type,at);
            }
            env->values[f.params[i].second]=std::make_shared<Cell>(Cell{values[i],type,false});
        }
        if(f.asynchronous) {
            auto task=std::make_shared<Task>();task->resultType=f.result;
            task->frame=std::make_shared<FrameState>();task->frame->code=&f.code;task->frame->env=env;task->frame->name=name;task->frame->cooperative=true;
            auto value=makeTask(task);--callDepth;return value;
        }
        frames.push_back({name,at,{}});
        Value result;
        try{result=execute(f.code,env);}catch(...){frames.pop_back();throw;}
        frames.pop_back();
        auto value=f.result=="khali"?Value{}:convert(result,f.result,at);--callDepth;return value;
    }catch(Fault &e){--callDepth;e.trace.push_back({name,at});throw;}catch(...){--callDepth;throw;}
}
Value VM::invokeValue(Value value,const std::vector<Value> &args,const Span &at,const std::vector<std::string> &labels) {
    value=value.raw();
    if(value.kind!=Value::FunctionValue||!value.callable)throw Fault("RUN-01",5,at,"Expected a typed kam value.");
    auto f=value.callable;
    return invoke(f->name,args,at,f->receiver,f->environment,labels);
}
double VM::taskClock() const {
    return world.active?world.time:std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
Value VM::makeTask(std::shared_ptr<Task> task) {
    if(tasks.size()>=4096)throw Fault("RUN-LIMIT",5,{},"Pending task limit exceeded.");
    task->id=nextTask++;tasks.push_back(task);Value value;value.kind=Value::TaskValue;value.task=std::move(task);return value;
}
void VM::pumpTasks() {
    if(pumping)return;
    pumping=true;
    struct Finish{bool &flag;~Finish(){flag=false;}} finish{pumping};
    auto count=tasks.size();
    for(size_t i=0;i<count;++i) {
        auto task=tasks[i];if(task->state!=Task::Pending)continue;
        try {
            if(task->kind==Task::TimerTask) {
                if(taskClock()>=task->deadline){task->state=Task::Fulfilled;task->result={};}
            } else if(task->kind==Task::HostTask) {
                if(task->future.valid()&&task->future.wait_for(std::chrono::seconds(0))==std::future_status::ready) {
                    task->result=convert(task->future.get(),task->resultType,{});task->state=Task::Fulfilled;
                }
            } else {
                auto &frame=*task->frame;
                if(frame.waiting&&frame.waiting->state==Task::Pending)continue;
                frames.push_back({frame.name,{}, {}});
                Value value;
                try{value=executeFrame(frame);}catch(...){frames.pop_back();throw;}
                frames.pop_back();
                if(frame.done){task->result=task->resultType=="khali"?Value{}:convert(value,task->resultType,{});task->state=Task::Fulfilled;task->frame.reset();}
            }
        }catch(const Fault &e){task->failure=std::make_shared<Fault>(e);task->state=e.code=="RUN-TASK-CANCEL"?Task::Cancelled:Task::Rejected;task->frame.reset();}
        catch(const std::exception &e){task->failure=std::make_shared<Fault>("RUN-ASYNC",5,Span{},e.what());task->state=Task::Rejected;task->frame.reset();}
        if((task->state==Task::Rejected||task->state==Task::Cancelled)&&!task->observed&&!task->reported&&io.warning){io.warning(task->failure->describe());task->reported=true;}
    }
    tasks.erase(std::remove_if(tasks.begin(),tasks.end(),[](const auto &t){return t->state!=Task::Pending;}),tasks.end());
}
Value VM::awaitTask(Value value,const Span &at) {
    value=value.raw();
    if(value.kind!=Value::TaskValue)throw Fault("RUN-ASYNC",5,at,"Expected Task<T>.");
    if(world.active||pumping)throw Fault("RUN-ASYNC",5,at,"Async.run is a console entry boundary; game tasks resume on ticks.");
    auto task=value.task;task->observed=true;
    while(task->state==Task::Pending){cancelled(at);pumpTasks();if(task->state==Task::Pending)std::this_thread::sleep_for(std::chrono::milliseconds(1));}
    if(task->failure)throw *task->failure;
    if(task->state==Task::Cancelled)throw Fault("RUN-TASK-CANCEL",5,at,"Task cancelled.");
    return task->result;
}
fs::path VM::safePath(const std::string &name, const Span &at, bool data) const {
    fs::path rel = fs::u8path(name);
    if (rel.empty() || rel.is_absolute())
        throw Fault("RUN-02", 5, at, "File paths must be relative to the project folder.");
    auto root = fs::weakly_canonical(data && !program.dataRoot.empty() ? program.dataRoot : program.root),
         path = fs::weakly_canonical(root / rel), check = path.lexically_relative(root);
    if (check.empty() || *check.begin() == "..")
        throw Fault("RUN-02", 5, at, "File path leaves the project folder.");
    return path;
}
Value VM::builtin(const std::string &original, const std::vector<Value> &args, const Span &at) {
    if(original=="$equal"){if(args.size()!=2)throw std::runtime_error("Expected two values.");return operation(args[0],args[1],"==");}
    auto dot=original.find('.');
    if(original.rfind("$collection.",0)==0||original.rfind("$iteration.",0)==0||(dot!=std::string::npos&&standardModule(original.substr(0,dot))))return standardCall(*this,original,args,at);
    auto name = original.rfind("hisab.", 0) == 0 ? original.substr(6) : original;
    auto get = [&](size_t i) -> Value {
        if (i >= args.size())
            throw std::runtime_error("Missing argument for " + name + ".");
        return args[i].raw();
    };
    auto number = [&](size_t i) { return get(i).numeric(); };
    if (name == "budh") {
        if(world.active)throw std::runtime_error("Console input is unavailable on the game rendering thread.");
        if (!args.empty() && io.print)
            io.print(get(0).str());
        if (!io.read)
            throw std::runtime_error("No input stream is connected.");
        auto input = io.read();
        cancelled(at);
        return Value::input(input);
    }
    if (name == "$default") {
        auto type = get(0).str();
        auto value = defaultValue(type);
        auto cl = program.classes.find(type);
        if (cl != program.classes.end())
            for (auto &f : cl->second)
                setField(value, f.second, defaultValue(f.first), f.first);
        return value;
    }
    if (name == "badal") {
        auto v = get(0);
        auto type = get(1).str();
        if (type == "lafz")
            return Value::s(v.str());
        if (v.kind == Value::String || v.kind == Value::Input)
            return convert(Value::input(v.text), type, at);
        if (type == "isharo") {
            if (v.kind == Value::Boolean)
                return v;
            return Value::b(v.numeric() != 0);
        }
        if (type == "adad") {
            if (v.kind == Value::Integer)
                return v;
            if (v.kind == Value::Boolean)
                return Value::i(v.integer);
            auto x = v.numeric();
            if (x < -9223372036854775808.0 || x >= 9223372036854775808.0)
                throw std::runtime_error("Cast exceeds adad range.");
            return Value::i(int64_t(x));
        }
        if (type == "dec")
            return v.kind == Value::Boolean ? Value::d(double(v.integer)) : Value::d(v.numeric());
        throw std::runtime_error("Unsupported cast target.");
    }
    if (name == "lambai") {
        auto v = get(0);
        if (v.kind == Value::List)
            return Value::i(v.array->values.size());
        if (v.kind == Value::String) {
            int64_t n = 0;
            for (unsigned char c : v.text)
                if ((c & 0xc0) != 0x80)
                    n++;
            return Value::i(n);
        }
        throw std::runtime_error("lambai expects a string or array.");
    }
    if (name == "sindhi_lafz") {
        auto value = get(0).integer;
        if (value < 0 || value > 1000) throw std::runtime_error("Sindhi word conversion supports 0 through 1000.");
        return Value::s(sindhiWord(int(value)));
    }
    if (name == "sindhi_adad") {
        int value = sindhiNumber(get(0).str());
        if (value < 0) throw std::runtime_error("Unknown Sindhi number. Use a word from 0 through 1000.");
        return Value::i(value);
    }
    if (name == "sqrt")
        return Value::d(std::sqrt(number(0)));
    if (name == "sin")
        return Value::d(std::sin(number(0)));
    if (name == "cos")
        return Value::d(std::cos(number(0)));
    if (name == "abs") {
        auto v = get(0);
        if (v.kind == Value::Integer) {
            if (v.integer == std::numeric_limits<int64_t>::min())
                throw std::runtime_error("abs exceeds adad range.");
            return Value::i(v.integer < 0 ? -v.integer : v.integer);
        }
        return Value::d(std::abs(v.numeric()));
    }
    if (name == "floor" || name == "round") {
        auto n = name == "floor" ? std::floor(number(0)) : std::round(number(0));
        if (n < -9223372036854775808.0 || n >= 9223372036854775808.0)
            throw std::runtime_error("Result exceeds adad range.");
        return Value::i(int64_t(n));
    }
    if (name == "min" || name == "max") {
        auto a = get(0), b = get(1);
        if (a.kind == Value::Integer && b.kind == Value::Integer)
            return Value::i(name == "min" ? std::min(a.integer, b.integer) : std::max(a.integer, b.integer));
        return Value::d(name == "min" ? std::min(a.numeric(), b.numeric())
                                      : std::max(a.numeric(), b.numeric()));
    }
    if (name == "bina_tarteeb") {
        auto a = get(0), b = get(1);
        if (a.numeric() > b.numeric())
            throw std::runtime_error("Random lower bound exceeds upper bound.");
        if (a.kind == Value::Integer && b.kind == Value::Integer)
            return Value::i(std::uniform_int_distribution<int64_t>(a.integer, b.integer)(random));
        return Value::d(std::uniform_real_distribution<double>(a.numeric(), b.numeric())(random));
    }
    if (name == "assert") {
        if (!get(0).truth())
            throw std::runtime_error(args.size() > 1 ? get(1).str() : "Assertion failed.");
        return {};
    }
    if (name == "uthao")
        throw std::runtime_error(get(0).str());
    if (name == "waqt") {
        if (world.active)
            return Value::d(world.time);
        return Value::d(
            std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count());
    }
    if (name == "likh") {
        auto path = safePath(get(0).str(), at, true);
        fs::create_directories(path.parent_path());
        std::ofstream out(path, std::ios::binary);
        auto text = get(1).str();
        if (text.size() > 16 * 1024 * 1024)
            throw std::runtime_error("File exceeds 16 MiB.");
        if (!out || !out.write(text.data(), std::streamsize(text.size())))
            throw std::runtime_error("Cannot write file.");
        return {};
    }
    if (name == "parh") {
        auto path = safePath(get(0).str(), at, true);
        std::ifstream in(path, std::ios::binary);
        if (!in)
            throw std::runtime_error("Cannot read file.");
        if (fs::file_size(path) > 16 * 1024 * 1024)
            throw std::runtime_error("File exceeds 16 MiB.");
        return Value::s({std::istreambuf_iterator<char>(in), {}});
    }
    if (name == "mahfooz") {
        std::string bytes = "JIMSAVE2";
        append32(bytes, uint32_t(globals->values.size()));
        for (auto &kv : globals->values) {
            putString(bytes, kv.first);
            saveValue(bytes, kv.second->value, 0);
        }
        auto path = safePath(get(0).str(), at, true);
        fs::create_directories(path.parent_path());
        std::ofstream out(path, std::ios::binary);
        if (!out || !out.write(bytes.data(), std::streamsize(bytes.size())))
            throw std::runtime_error("Cannot write save file.");
        return {};
    }
    if (name == "wapas_lao") {
        auto path = safePath(get(0).str(), at, true);
        std::ifstream in(path, std::ios::binary);
        if (!in || fs::file_size(path) > 16 * 1024 * 1024)
            throw std::runtime_error("Cannot read save file.");
        std::string data{std::istreambuf_iterator<char>(in), {}};
        if (data.substr(0, 8) != "JIMSAVE2")
            throw std::runtime_error("Invalid Jimsabz save file.");
        size_t pos = 8;
        auto count = take32(data, pos);
        if (count > 100000)
            throw std::runtime_error("Invalid save variable count.");
        std::map<std::string, Value> loaded;
        for (uint32_t i = 0; i < count; i++) {
            auto key = takeString(data, pos);
            auto value = loadValue(data, pos, 0);
            auto cell = globals->find(key);
            if (cell && !cell->fixed)
                loaded[key] = convert(value, cell->type, at);
        }
        if (pos != data.size())
            throw std::runtime_error("Unexpected save data.");
        for (auto &kv : loaded)
            restore(globals->find(kv.first)->value, kv.second);
        return {};
    }
    if (name.rfind("shabak.", 0) == 0)
        return networkCall(*this, name.substr(7), args);
    if (name == "$game") {
        world.active = true;
        world.title = get(0).str();
        world.dimension = int(number(1));
        return {};
    }
    if (name == "khirki") {
        int w = int(number(0)), h = int(number(1));
        if (w < 160 || h < 120 || w > 3840 || h > 2160)
            throw std::runtime_error("Window size must be between 160x120 and 3840x2160.");
        world.width = w;
        world.height = h;
        return {};
    }
    if (name == "pichaan") {
        world.background = color(get(0));
        return {};
    }
    if (name == "dekhar") {
        for (auto &v : args)
            world.hud.push_back(v.str());
        return {};
    }
    if (name == "$roshni" || name == "$camera3d") {
        auto v = Value::obj(name.substr(1));
        for (size_t i = 0; i + 1 < args.size(); i += 2)
            setField(v, args[i].str(), args[i + 1]);
        (name == "$roshni" ? world.light : world.camera) = v;
        return {};
    }
    if (name == "camera.follow") {
        if (world.camera.kind != Value::Record)
            world.camera = Value::obj("camera");
        setField(world.camera, "follow", get(0));
        return {};
    }
    if (name == "$scene") {
        if (world.scene.empty())
            world.scene = get(0).str();
        return {};
    }
    if (name == "tabdeel_manzar") {
        world.scene = get(0).str();
        return {};
    }
    if (name == "$tilemap") {
        auto o = Value::obj("tilemap");
        setField(o, "grid", get(1));
        globals->values["$tilemap:" + get(0).str()] = std::make_shared<Cell>(Cell{o, "tilemap"});
        return {};
    }
    if (name == "random_top") {
        if (number(0) <= 0)
            throw std::runtime_error("Spawn interval must be positive.");
        auto v = Value::obj("spawn");
        setField(v, "interval", get(0), "dec");
        return v;
    }
    if (name == "patrol" || name == "chase") {
        auto v = Value::obj("behavior");
        setField(v, "kind", Value::s(name));
        for (size_t i = 0; i < args.size(); i++)
            setField(v, "arg" + std::to_string(i), args[i]);
        return v;
    }
    if (name == "shoot_every")
        return get(0);
    if (name == "jeet" || name == "haar") {
        world.over = true;
        world.won = name == "jeet";
        world.message = args.empty() ? (world.won ? "You won!" : "Game over") : get(0).str();
        return {};
    }
    if (name == "dhun" || name == "wajai") {
        auto s = get(0).str();
        auto path = safePath(s, at);
        nativeSound(path, s, name == "dhun");
        return {};
    }
    if (name == "awaz") {
        if (number(0) < 0 || number(0) > 100)
            throw std::runtime_error("awaz expects 0 through 100.");
        nativeVolume(int(number(0)));
        globals->values["$volume"] = std::make_shared<Cell>(Cell{get(0), "adad"});
        return {};
    }
    if (name == "chup") {
        stopSound();
        return {};
    }
    if (name == "khatam") {
        auto v = get(0);
        setField(v, "visible", Value::b(false), "isharo");
        return {};
    }
    if (name == "chalao") {
        auto v = get(0);
        auto animation = get(1);
        if (field(v, "anim_" + animation.str()).kind != Value::Record)
            throw std::runtime_error("Unknown animation '" + animation.str() + "'.");
        setField(v, "forced_animation", animation, "lafz");
        setField(v, "animation_time", Value::d(0), "dec");
        return {};
    }
    if (name == "paida") {
        auto source = get(0);
        if (source.kind != Value::Record)
            throw std::runtime_error("paida expects an actor.");
        auto v = Value::obj(source.type());
        for (auto &kv : source.object->fields) {
            auto data = kv.second->value;
            if (data.kind == Value::Record && (data.type() == "vec2" || data.type() == "vec3")) {
                auto copy = Value::obj(data.type());
                for (auto &field : data.object->fields)
                    setField(copy, field.first, field.second->value, field.second->type);
                data = copy;
            }
            setField(v, kv.first, data, kv.second->type);
        }
        setField(v, "visible", Value::b(true));
        if (args.size() > 1)
            setField(v, world.dimension == 3 ? "jagah3d" : "jagah", get(1));
        if (world.actors.size() >= 10000)
            throw std::runtime_error("Entity pool limit reached.");
        auto name = source.type().substr(1);
        world.actors.push_back({name, v, world.dimension == 3, true});
        return v;
    }
    if (name == "chining") {
        auto position = args.size() > 1 ? get(1) : Value{};
        double x = field(position, "x", Value::d(0)).numeric(),
               y = field(position, "y", Value::d(0)).numeric(),
               z = field(position, "z", Value::d(0)).numeric();
        int count = args.size() > 2 ? int(number(2)) : 20;
        count = std::clamp(count, 0, 2000);
        for (int i = 0; i < count && world.particles.size() < 10000; i++) {
            double angle = std::uniform_real_distribution<double>(0, 6.28318)(random),
                   speed = std::uniform_real_distribution<double>(30, 160)(random);
            world.particles.push_back(
                {x, y, z, std::cos(angle) * speed, std::sin(angle) * speed, 0.8, 0xff54e9c5});
        }
        return {};
    }
    if (name == "$shop") {
        auto v = Value::list(args);
        globals->values["$shop"] = std::make_shared<Cell>(Cell{v, "qatar any"});
        return {};
    }
    if (name == "$wallet") {
        globals->values["$wallet"] = std::make_shared<Cell>(Cell{get(0), "lafz"});
        return {};
    }
    throw std::runtime_error("Unknown native function '" + name + "'.");
}
void VM::gameLoop(int maxFrames, bool realtime) {
    using clock = std::chrono::steady_clock;
    int frame = 0;
    while (world.active && (maxFrames < 0 || frame < maxFrames)) {
        auto start = clock::now();
        cancelled();
        instructions = 0;
        tick(1.0 / 60);
        render();
        if (io.frame)
            io.frame(world.pixels, world.width, world.height);
        frame++;
        if (realtime)
            std::this_thread::sleep_until(start + std::chrono::microseconds(16667));
    }
}
} // namespace jim
