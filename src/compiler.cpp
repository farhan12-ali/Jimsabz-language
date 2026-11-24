#include "jimsabz.hpp"
#include <fstream>
#include <cstring>

namespace jim {
namespace {
struct Control {
    std::vector<int> breaks, continues;
    int depth = 0;
    bool loop = false;
};
class Generator {
    Program p;
    const Analysis &a;
    std::vector<Ins> *code = &p.code;
    int depth = 0, unique = 0;
    std::vector<Control> controls;
    std::string scene;
    int emit(Op op, const N &n, int v = 0, std::string text = {}) {
        code->push_back({op, v, std::move(text), n->at});
        return int(code->size() - 1);
    }
    void patch(int i, int to) { (*code)[i].a = to; }
    int here() { return int(code->size()); }
    void push(const N &n, std::string value, int kind = 4) { emit(Op::Push, n, kind, std::move(value)); }
    void load(const N &n, const std::string &name) { emit(Op::Load, n, 0, name); }
    void enter(const N &n) {
        emit(Op::Enter, n);
        depth++;
    }
    void leave(const N &n) {
        emit(Op::Leave, n);
        depth--;
    }
    void declare(const N &n, const std::string &name, const std::string &type, bool fixed = false) {
        emit(Op::Declare, n, fixed ? 1 : 0, name + "\x1f" + type);
    }
    void call(const N &n, std::string name, int count) { emit(Op::Call, n, count, std::move(name)); }
    void expression(const N &n, bool lvalue = false) {
        auto k = n->kind;
        auto &c = n->children;
        if (k == "int")
            push(n, n->text, 1);
        else if (k == "dec")
            push(n, n->text, 2);
        else if (k == "string")
            push(n, n->text);
        else if (k == "bool")
            push(n, n->text == "ha" ? "1" : "0", 3);
        else if (k == "null")
            push(n, "", 0);
        else if(k=="await") {expression(c[0]);emit(Op::Await,n);p.format=3;}
        else if(k=="lambda") {emit(Op::Closure,n,1,n->id);p.format=3;}
        else if(k=="baseview")expression(c[0]);
        else if (k == "name") {
            if(n->attrs.count("$function")){emit(Op::Closure,n,0,n->id);p.format=3;return;}
            if (n->type == "lafz" && a.globals.find(n->text) == a.globals.end()) {
                const std::set<std::string> words = {"arrows",  "wasd",   "arrows_platformer",
                                                     "wasd_3d", "none",   "cube",
                                                     "sphere",  "plane",  "pyramid",
                                                     "white",   "black",  "cyan",
                                                     "lime",    "red",    "blue",
                                                     "amber",   "green",  "violet",
                                                     "gray",    "yellow", "orange",
                                                     "patrol",  "chase"};
                if (words.count(n->text)) {
                    push(n, n->text);
                    return;
                }
            }
            if (n->type == "type")
                push(n, n->text);
            else {
                load(n, n->text);
                if (!lvalue)
                    emit(Op::Read, n);
            }
        } else if (k == "named" || k=="spread")
            expression(c[0]);
        else if (k == "array" || k == "vector") {
            for (auto &x : c)
                expression(x);
            emit(k == "array" ? Op::Array : Op::Vector, n, int(c.size()),
                 k == "array" ? n->type.substr(6) : n->type);
        } else if (k == "member") {
            expression(c[0]);
            if(n->attrs.count("$methodref")){emit(Op::Closure,n,2,n->id);p.format=3;return;}
            emit(Op::Member, n, 0, n->text);
            if (!lvalue)
                emit(Op::Read, n);
        } else if (k == "index") {
            expression(c[0]);
            expression(c[1]);
            emit(Op::Index, n);
            if (!lvalue)
                emit(Op::Read, n);
        } else if (k == "increment") {
            expression(c[0],true);emit(Op::Unary,n,0,n->text);
        } else if (k == "unary") {
            expression(c[0]);
            emit(Op::Unary, n, 0, n->text);
        } else if (k == "binary") {
            expression(c[0]);
            if(n->text=="??") {
                emit(Op::Dup,n);push(n,"",0);emit(Op::Binary,n,0,"==");auto jump=emit(Op::JumpFalse,n);
                emit(Op::Pop,n);expression(c[1]);patch(jump,here());p.format=3;
            } else if (n->text == "&&" || n->text == "||") {
                emit(Op::Dup, n);
                auto j = emit(n->text == "&&" ? Op::JumpFalse : Op::JumpTrue, n);
                emit(Op::Pop, n);
                expression(c[1]);
                patch(j, here());
            } else {
                expression(c[1]);
                emit(Op::Binary, n, 0, n->text);
            }
        } else if (k == "assign") {
            expression(c[0], true);
            if (n->text != "=") {
                emit(Op::Dup, n);
                emit(Op::Read, n);
            }
            expression(c[1]);
            if (n->text != "=")
                emit(Op::Binary, n, 0, n->text.substr(0, 1));
            emit(Op::Store, n);
        } else if (k == "new") {
            if(n->attrs.count("$collection")){push(n,n->text);call(n,"$collection.new",1);p.format=3;return;}
            for (auto &x : c)
                expression(x);
            if(n->attrs.count("$constructor")){call(n,"$ctor:"+n->text+":"+n->id,int(c.size()));p.format=3;}
            else if(c.size()<a.classes.at(n->text).fields.size())call(n,"$new:"+n->text+":"+std::to_string(c.size()),int(c.size()));
            else emit(Op::New, n, int(c.size()), n->text);
        } else if (k == "call") {
            auto callee = c[0];
            std::string labels;
            for(size_t i=1;i<c.size();++i){if(i>1)labels+='\x1f';labels+=c[i]->kind=="named"?c[i]->text:c[i]->kind=="spread"?"*":"";}
            bool named=false;for(size_t i=1;i<c.size();++i)named|=c[i]->kind=="named"||c[i]->kind=="spread";
            if(n->attrs.count("$indirect")) {
                expression(callee);for(size_t i=1;i<c.size();++i)expression(c[i]);
                emit(Op::Invoke,n,int(c.size()-1),labels);p.format=3;
            } else if (callee->kind == "member" && callee->children[0]->type != "namespace") {
                expression(callee->children[0]);
                for (size_t i = 1; i < c.size(); i++)
                    expression(c[i]);
                auto target=n->id.empty()?callee->text:n->id;
                if(named&&!n->id.empty()){target+="\x1f"+labels;p.format=3;}
                if(target.rfind("$direct:",0)==0)p.format=3;
                emit(Op::Method, n, int(c.size() - 1), target);
            } else {
                std::string name =
                    callee->kind == "member" ? callee->children[0]->text + "." + callee->text : callee->text;
                for (size_t i = 1; i < c.size(); i++) {
                    if (name == "dekhar" && c[i]->kind == "name")
                        push(c[i], c[i]->text);
                    else
                        expression(c[i]);
                }
                if(!n->id.empty())name=n->id;
                if(named&&!n->id.empty()){emit(Op::CallNamed,n,int(c.size()-1),name+"\x1f"+labels);p.format=3;}
                else call(n, name, int(c.size() - 1));
            }
        }
    }
    void block(const N &n, bool scope = true) {
        if (scope)
            enter(n);
        for (auto &x : n->children)
            statement(x);
        if (scope)
            leave(n);
    }
    void finishControl(const N &n, int end, int continuation = -1) {
        auto ctrl = controls.back();
        controls.pop_back();
        for (auto j : ctrl.breaks)
            patch(j, end);
        for (auto j : ctrl.continues)
            patch(j, continuation);
        (void)n;
    }
    std::string handler(const N &body) {
        auto name = "$event" + std::to_string(unique++);
        Function f;
        f.name = name;
        auto old = code;
        int oldDepth = depth;
        auto oldControls = std::move(controls);
        code = &f.code;
        depth = 0;
        controls.clear();
        block(body);
        push(body, "", 0);
        emit(Op::Return, body);
        code = old;
        depth = oldDepth;
        controls = std::move(oldControls);
        p.functions[name] = std::move(f);
        return name;
    }
    void bind(const N &n, std::string kind, std::string fn, int count) {
        emit(Op::Bind, n, count, kind + "\x1f" + fn + "\x1f" + scene);
    }
    void entity(const N &n) {
        int count = 0;
        for (auto &prop : n->children) {
            if (prop->text == "harkat") {
                push(prop, "anim_" + prop->children[0]->text);
                for (size_t i = 1; i < prop->children.size(); i++)
                    expression(prop->children[i]);
                emit(Op::Vector, prop, 3, "vec3");
                count++;
                continue;
            }
            push(prop, prop->text);
            expression(prop->children[0]);
            count++;
            if (prop->text == "tasveer" && prop->children.size() == 3) {
                push(prop, "width");
                expression(prop->children[1]);
                count++;
                push(prop, "height");
                expression(prop->children[2]);
                count++;
            }
        }
        push(n, "__scene");
        push(n, scene);
        count++;
        emit(Op::Entity, n, count, n->text + "\x1f" + (n->kind == "mesh" ? "3" : "2"));
    }
    void statement(const N &n) {
        auto k = n->kind;
        auto &c = n->children;
        if (k == "program")
            for (auto &x : c)
                statement(x);
        else if (k == "block")
            block(n);
        else if (k == "var") {
            if(nullableType(n->type)||callableType(n->type)||typeHead(n->type)=="Map"||typeHead(n->type)=="Set"||typeHead(n->type)=="Task")p.format=3;
            if (c.empty()) {
                push(n, n->type);
                call(n, "$default", 1);
            } else
                expression(c[0]);
            declare(n, n->text, n->type, n->fixed);
            if (n->currency) {
                push(n, n->text);
                call(n, "$wallet", 1);
                emit(Op::Pop, n);
            }
        } else if(k=="function"&&n->attrs.count("$local")) {
            emit(Op::Closure,n,1,n->id);declare(n,n->text,functionType(n),true);p.format=3;
        } else if (k == "expression") {
            expression(c[0]);
            emit(Op::Pop, n);
        } else if (k == "print") {
            expression(c[0]);
            emit(Op::Print, n);
        } else if (k == "if") {
            expression(c[0]);
            int j = emit(Op::JumpFalse, n);
            statement(c[1]);
            if (c.size() == 3) {
                int e = emit(Op::Jump, n);
                patch(j, here());
                statement(c[2]);
                patch(e, here());
            } else
                patch(j, here());
        } else if (k == "while") {
            int start = here();
            expression(c[0]);
            int end = emit(Op::JumpFalse, n);
            controls.push_back({{}, {}, depth, true});
            statement(c[1]);
            emit(Op::Jump, n, start);
            int stop = here();
            patch(end, stop);
            finishControl(n, stop, start);
        } else if (k == "for") {
            enter(n);
            if (c[0]->kind == "var")
                statement(c[0]);
            else {
                expression(c[0]);
                emit(Op::Pop, n);
            }
            int start = here();
            expression(c[1]);
            int end = emit(Op::JumpFalse, n);
            controls.push_back({{}, {}, depth, true});
            statement(c[3]);
            int step = here();
            expression(c[2]);
            emit(Op::Pop, n);
            emit(Op::Jump, n, start);
            int stop = here();
            patch(end, stop);
            finishControl(n, stop, step);
            leave(n);
        } else if (k == "foreach") {
            enter(n);
            auto id = std::to_string(unique++), arr = "$array" + id, index = "$index" + id;
            expression(c[0]);
            declare(n, arr, c[0]->type);
            load(n,arr);call(n,"$iteration.version",1);declare(n,"$version"+id,"adad");
            push(n, "0", 1);
            declare(n, index, "adad");
            int start = here();
            load(n,arr);load(n,"$version"+id);call(n,"$iteration.check",2);emit(Op::Pop,n);
            load(n, index);
            load(n, arr);
            emit(Op::Member, n, 0, "lambai");
            emit(Op::Binary, n, 0, "<");
            auto end = emit(Op::JumpFalse, n);
            controls.push_back({{}, {}, depth, true});
            enter(n);
            load(n, arr);
            load(n, index);
            call(n,"$iteration.at",2);
            declare(n, n->text, n->type);
            statement(c[1]);
            leave(n);
            int step = here();
            load(n, index);
            emit(Op::Dup, n);
            push(n, "1", 1);
            emit(Op::Binary, n, 0, "+");
            emit(Op::Store, n);
            emit(Op::Pop, n);
            emit(Op::Jump, n, start);
            int stop = here();
            patch(end, stop);
            finishControl(n, stop, step);
            leave(n);
        } else if (k == "break" || k == "continue") {
            int i = int(controls.size()) - 1;
            if (k == "continue")
                while (i >= 0 && !controls[i].loop)
                    i--;
            emit(Op::Unwind, n, depth - controls[i].depth);
            int j = emit(Op::Jump, n);
            (k == "break" ? controls[i].breaks : controls[i].continues).push_back(j);
        } else if (k == "return") {
            if (c.empty())
                push(n, "", 0);
            else
                expression(c[0]);
            emit(Op::Return, n);
        } else if (k == "try") {
            int tr = emit(Op::Try, n, 0, n->text);
            statement(c[0]);
            emit(Op::EndTry, n);
            int end = emit(Op::Jump, n);
            patch(tr, here());
            enter(n);
            declare(n, n->text, "lafz");
            statement(c[1]);
            leave(n);
            patch(end, here());
        } else if (k == "switch") {
            enter(n);
            auto id = "$switch" + std::to_string(unique++);
            expression(c[0]);
            declare(n, id, c[0]->type);
            controls.push_back({{}, {}, depth, false});
            std::vector<int> ends;
            N def;
            for (size_t i = 1; i < c.size(); i++) {
                if (c[i]->kind == "default") {
                    def = c[i]->children[0];
                    continue;
                }
                load(n, id);
                expression(c[i]->children[0]);
                emit(Op::Binary, n, 0, "==");
                int next = emit(Op::JumpFalse, n);
                statement(c[i]->children[1]);
                ends.push_back(emit(Op::Jump, n));
                patch(next, here());
            }
            if (def)
                statement(def);
            int end = here();
            for (auto j : ends)
                patch(j, end);
            finishControl(n, end);
            leave(n);
        } else if (k == "game") {
            p.title = n->text;
            push(n, n->text);
            push(n, n->type, 1);
            call(n, "$game", 2);
            emit(Op::Pop, n);
            block(c[0], false);
        } else if (k == "scene") {
            auto old = scene;
            scene = n->text;
            push(n, scene);
            call(n, "$scene", 1);
            emit(Op::Pop, n);
            block(c[0], false);
            scene = old;
        } else if (k == "actor" || k == "mesh")
            entity(n);
        else if (k == "config") {
            for (auto &prop : c) {
                push(prop, prop->text);
                expression(prop->children[0]);
            }
            call(n, "$" + n->text, int(c.size() * 2));
            emit(Op::Pop, n);
        } else if (k == "window" || k == "background" || k == "audio") {
            for (auto &x : c)
                expression(x);
            call(n, n->text, int(c.size()));
            emit(Op::Pop, n);
        } else if (k == "timer" || k == "event") {
            auto fn = handler(c.back());
            for (size_t i = 0; i + 1 < c.size(); i++) {
                if ((n->text == "takkar" || n->text == "takkar3d") && c[i]->kind == "name")
                    push(c[i], c[i]->text);
                else
                    expression(c[i]);
            }
            bind(n, k == "timer" ? "timer" : n->text, fn, int(c.size() - 1));
        } else if (k == "tilemap") {
            expression(c[0]);
            declare(n, n->text, c[0]->type);
            push(n, n->text);
            load(n, n->text);
            call(n, "$tilemap", 2);
            emit(Op::Pop, n);
        } else if (k == "shop") {
            expression(c[0]);
            for (size_t i = 1; i < c.size(); i++) {
                auto body = node("block", Token{TK::Word, "", c[i]->at});
                body->children.push_back(c[i]->children[2]);
                auto fn = handler(body);
                expression(c[i]->children[0]);
                expression(c[i]->children[1]);
                push(n, fn);
            }
            call(n, "$shop", 1 + int(c.size() - 1) * 3);
            emit(Op::Pop, n);
        } else if (k == "level") {
            expression(c[0]);
            auto fn = handler(c[1]);
            bind(n, "level", fn, 1);
        }
    }

  public:
    explicit Generator(const Analysis &analysis) : a(analysis) {}
    Program run(const N &root) {
        statement(root);
        emit(Op::Halt, root);
        for (auto &pair : a.classes) {
            auto &fields=p.classes[pair.first];
            for (auto &f : pair.second.fields)fields.push_back({f->type,f->text});
            if(!pair.second.parents.empty())p.format=3;
            uint32_t flags=(pair.second.attrs.count("abstract")?1:0)|(pair.second.attrs.count("interface")?2:0);
            if(flags){p.typeFlags[pair.first]=flags;p.format=3;}
            std::set<std::string> all;
            std::function<void(const std::string&)> parents=[&](const std::string &type){if(!all.insert(type).second)return;auto it=a.classes.find(type);if(it!=a.classes.end())for(auto &base:it->second.parents)parents(base);};
            for(auto &base:pair.second.parents)parents(base);
            if(!all.empty())p.parents[pair.first]={all.begin(),all.end()};
        }
        auto compileFunction = [&](const N &n, std::string owner) {
            if(n->children.empty())return;
            Function f;
            f.name = owner.empty() ? (n->id.empty()?n->text:n->id) : owner + "." + (n->id.empty()?n->text:n->id);
            f.result = n->returnType.empty()?n->type:n->returnType;
            f.owner = owner;
            f.params = n->params;
            f.variadic=n->variadic;f.asynchronous=n->attrs.count("async");f.signature=functionType(n);
            if(f.variadic||f.asynchronous)p.format=3;
            code = &f.code;
            depth = 0;
            controls.clear();
            for(auto &value:n->defaults) {
                f.defaults.emplace_back();
                if(value){auto previous=code;code=&f.defaults.back();expression(value);emit(Op::Return,value);code=previous;p.format=3;}
            }
            block(n->children[0]);
            push(n, "", 0);
            emit(Op::Return, n);
            p.functions[f.name] = std::move(f);
        };
        for (auto &pair : a.functions)
            compileFunction(pair.second, "");
        for (auto &pair : a.classes)
            for (auto &f : pair.second.methods)
                compileFunction(f, pair.first);
        std::map<std::string,N> factories;
        std::function<void(const N&)> collect=[&](const N &n){
            if(n->kind=="new" && !n->attrs.count("$collection") && !n->attrs.count("$constructor") && n->children.size()<a.classes.at(n->text).fields.size())factories["$new:"+n->text+":"+std::to_string(n->children.size())]=n;
            for(auto &child:n->children)collect(child);
        };
        collect(root);
        for(auto &pair:factories) {
            auto n=pair.second;auto &fields=a.classes.at(n->text).fields;
            auto count=n->children.size();Function f;f.name=pair.first;f.result=n->text;
            for(size_t i=0;i<count;i++)f.params.push_back({fields[i]->type,fields[i]->text});
            code=&f.code;depth=0;controls.clear();
            for(size_t i=count;i<fields.size();i++)statement(fields[i]);
            for(auto &field:fields){load(field,field->text);emit(Op::Read,field);}
            emit(Op::New,n,int(fields.size()),n->text);emit(Op::Return,n);
            p.functions[f.name]=std::move(f);
        }
        for(auto &pair:a.classes)for(auto &ctor:pair.second.methods)if(ctor->text=="naon"&&!ctor->children.empty()) {
            Function f;f.name="$ctor:"+pair.first+":"+ctor->id;f.result=pair.first;f.params=ctor->params;f.variadic=ctor->variadic;
            code=&f.code;depth=0;controls.clear();
            for(auto &value:ctor->defaults){f.defaults.emplace_back();if(value){auto previous=code;code=&f.defaults.back();expression(value);emit(Op::Return,value);code=previous;}}
            // Field defaults execute in their own lexical scope, before constructor parameters.
            Function init;init.name="$fields:"+pair.first;init.result=pair.first;
            code=&init.code;depth=0;controls.clear();
            for(auto &field:pair.second.fields)statement(field);
            for(auto &field:pair.second.fields){load(field,field->text);emit(Op::Read,field);}
            emit(Op::New,ctor,int(pair.second.fields.size()),pair.first);emit(Op::Return,ctor);
            p.functions[init.name]=std::move(init);code=&f.code;depth=0;controls.clear();call(ctor,"$fields:"+pair.first,0);
            declare(ctor,"$instance",pair.first);
            load(ctor,"$instance");emit(Op::Read,ctor);
            for(auto &param:ctor->params){load(ctor,param.second);emit(Op::Read,ctor);}
            emit(Op::Method,ctor,int(ctor->params.size()),"$direct:"+pair.first+"."+ctor->id);emit(Op::Pop,ctor);
            load(ctor,"$instance");emit(Op::Read,ctor);emit(Op::Return,ctor);p.functions[f.name]=std::move(f);p.format=3;
        }
        return std::move(p);
    }
};
const char *opname(Op op) {
    static const char *names[] = {"PUSH",       "LOAD_REF",   "DECLARE",     "POP",         "DUP",
                                  "MEMBER_REF", "INDEX_REF",  "MAKE_ARRAY",  "MAKE_VECTOR", "BINARY",
                                  "UNARY",      "STORE",      "ENTER_SCOPE", "LEAVE_SCOPE", "UNWIND",
                                  "JUMP",       "JUMP_FALSE", "JUMP_TRUE",   "CALL",        "METHOD",
                                  "NEW",        "RETURN",     "PRINT",       "TRY",         "END_TRY",
                                  "THROW",      "ENTITY",     "BIND_EVENT",  "HALT",        "READ_VALUE",
                                  "CLOSURE", "INVOKE", "CALL_NAMED", "AWAIT"};
    return names[static_cast<int>(op)];
}
std::string readAll(const fs::path &p) {
    std::ifstream f(p, std::ios::binary);
    if (!f)
        throw std::runtime_error("Cannot open " + p.string());
    return {std::istreambuf_iterator<char>(f), {}};
}
fs::path projectRoot(fs::path p) {
    p = fs::absolute(p).parent_path();
    auto candidate = p;
    while (!candidate.empty()) {
        if (fs::exists(candidate / "jimsabz.json"))
            return candidate;
        auto next = candidate.parent_path();
        if (next == candidate)
            break;
        candidate = next;
    }
    return p;
}
void assets(const N &n, Program &p, std::vector<std::string> &warnings) {
    bool image = n->kind == "property" && n->text == "tasveer";
    bool mesh = n->kind == "property" && n->text == "shakal3d";
    bool sound = n->kind == "audio" && (n->text == "dhun" || n->text == "wajai");
    if ((image || mesh || sound) && !n->children.empty() && n->children[0]->kind == "string") {
        auto name = n->children[0]->text;
        fs::path rel(name);
        if (rel.is_absolute())
            throw Fault("ASSET-01", 4, n->at, "Asset paths must be relative to the project folder.");
        auto root = fs::weakly_canonical(p.root), path = fs::weakly_canonical(root / rel);
        auto relative = path.lexically_relative(root);
        if (relative.empty() || *relative.begin() == "..")
            throw Fault("ASSET-01", 4, n->at, "Asset path leaves the project folder.");
        if (!fs::is_regular_file(path)) {
            if (sound)
                warnings.push_back("Synth fallback: " + name);
            else
                throw Fault("ASSET-01", 4, n->at,
                            "Missing asset '" + name + "'. Add it to the project folder.");
        } else {
            try {
                if (image)
                    loadImage(path);
                if (mesh)
                    loadMesh(path);
            } catch (const std::exception &e) {
                throw Fault("ASSET-02", 4, n->at, e.what());
            }
            auto s = relative.generic_string();
            if (std::find(p.assets.begin(), p.assets.end(), s) == p.assets.end())
                p.assets.push_back(s);
        }
    }
    for (auto &c : n->children)
        assets(c, p, warnings);
}
} // namespace
Program generate(const N &root, const Analysis &a) { return Generator(a).run(root); }
std::string disassemble(const Program &p) {
    std::ostringstream s;
    auto output = [&](const std::string &name, const std::vector<Ins> &code) {
        s << "\n[" << name << "]\n";
        for (size_t i = 0; i < code.size(); i++) {
            auto &ins = code[i];
            std::string text = ins.text;
            std::replace(text.begin(), text.end(), '\x1f', '|');
            s << std::setw(5) << i << "  " << std::left << std::setw(15) << opname(ins.op) << std::right
              << " " << ins.a << "  " << text << "  ; " << ins.at.file << ":" << ins.at.line << "\n";
        }
    };
    output("main", p.code);
    for (auto &f : p.functions)
        output(f.first, f.second.code);
    return s.str();
}
Build compile(const std::string &source, const fs::path &file, Progress progress) {
    Build b;
    b.stages = {{"Lexical analysis"},    {"Parser & AST"},     {"Semantic analysis"},
                {"Bytecode generation"}, {"Asset validation"}, {"Runtime"}};
    int stage = 0;
    auto start = std::chrono::steady_clock::now();
    auto begin = [&](int i) {
        stage = i;
        start = std::chrono::steady_clock::now();
        b.stages[i].state = "running";
        if (progress)
            progress(i, b.stages[i]);
    };
    auto pass = [&](std::string detail) {
        auto &s = b.stages[stage];
        s.state = "passed";
        s.detail = std::move(detail);
        s.milliseconds =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
        if (progress)
            progress(stage, s);
    };
    try {
        auto root = projectRoot(file);
        auto relative = fs::absolute(file).lexically_relative(root).generic_string();
        begin(0);
        b.tokens = lex(source, relative);
        pass(std::to_string(b.tokens.size() - 1) + " tokens");
        begin(1);
        b.ast = parse(b.tokens);
        std::set<fs::path> loaded, visiting;
        visiting.insert(fs::weakly_canonical(file));
        std::function<void(N &, const fs::path &)> expand = [&](N &tree, const fs::path &current) {
            std::vector<N> result;
            for (auto &n : tree->children) {
                if (n->kind == "import" && n->text.find('.') != std::string::npos) {
                    auto path = fs::weakly_canonical(current.parent_path() / fs::u8path(n->text));
                    auto rel = path.lexically_relative(root);
                    if (rel.empty() || *rel.begin() == "..")
                        throw Fault("SEM-01", 2, n->at, "Module path leaves the project folder.");
                    if (path.extension() != ".jimsabz")
                        throw Fault("SEM-01", 2, n->at, "Imported modules use the .jimsabz extension.");
                    if (visiting.count(path))
                        throw Fault("SEM-01", 2, n->at, "Circular module import: " + n->text);
                    if (loaded.count(path))
                        continue;
                    if (!fs::is_regular_file(path))
                        throw Fault("SEM-01", 2, n->at, "Cannot find imported module '" + n->text + "'.");
                    auto tokens = lex(readAll(path), rel.generic_string());
                    auto imported = parse(tokens);
                    b.tokens.insert(b.tokens.end() - 1, tokens.begin(), tokens.end() - 1);
                    visiting.insert(path);
                    expand(imported, path);
                    visiting.erase(path);
                    loaded.insert(path);
                    result.insert(result.end(), imported->children.begin(), imported->children.end());
                } else
                    result.push_back(n);
            }
            tree->children = std::move(result);
        };
        expand(b.ast, fs::absolute(file));
        pass(std::to_string(nodeCount(b.ast)) + " AST nodes; " + std::to_string(loaded.size()) + " modules");
        begin(2);
        b.analysis = analyze(b.ast);
        pass(std::to_string(b.analysis.globals.size()) + " global symbols; type and library checks passed");
        begin(3);
        b.program = generate(b.ast, b.analysis);
        b.program.root = root.string();
        pass(std::to_string(b.program.code.size()) + " main instructions; " +
             std::to_string(b.program.functions.size()) + " functions/handlers");
        begin(4);
        std::vector<std::string> warnings;
        assets(b.ast, b.program, warnings);
        std::string detail = std::to_string(b.program.assets.size()) + " assets validated";
        for (auto &w : warnings)
            detail += "\n" + w;
        pass(detail);
        b.stages[5].state = "ready";
        b.stages[5].detail = "Ready to run .jbc bytecode";
        b.ok = true;
    } catch (const Fault &e) {
        b.errors.push_back(e);
        int failed = std::clamp(e.stage, 0, 5);
        for (int i = 0; i < failed; i++)
            if (b.stages[i].state == "pending" || b.stages[i].state == "running")
                b.stages[i].state = "passed";
        b.stages[failed].state = "failed";
        b.stages[failed].detail = e.describe();
        for (int i = failed + 1; i < 6; i++)
            b.stages[i].state = "blocked";
        if (progress)
            progress(failed, b.stages[failed]);
    } catch (const std::exception &e) {
        b.errors.emplace_back("BUILD-01", stage, Span{file.string()}, e.what());
        b.stages[stage].state = "failed";
        b.stages[stage].detail = e.what();
    }
    return b;
}
} // namespace jim
