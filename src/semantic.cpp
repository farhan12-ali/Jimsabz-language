#include "jimsabz.hpp"

namespace jim {
bool compatible(const std::string &target, const std::string &value) {
    if(nullableType(target))return value=="khali"||compatible(target.substr(0,target.size()-1),nullableType(value)?value.substr(0,value.size()-1):value);
    if(nullableType(value))return false;
    if (target == "any" || value == "any" || target == value)
        return true;
    if (value == "input")
        return target == "adad" || target == "dec" || target == "lafz" || target == "isharo";
    if (target == "dec" && value == "adad")
        return true;
    if (target.rfind("qatar ", 0) == 0 && value.rfind("qatar ", 0) == 0)
        return compatible(target.substr(6), value.substr(6));
    return false;
}
namespace {
bool numeric(const std::string &t) { return t == "adad" || t == "dec"; }
bool primitive(const std::string &t) { return numeric(t) || t == "lafz" || t == "isharo"; }
const std::set<std::string> literals = {"arrows",  "wasd",   "arrows_platformer",
                                        "wasd_3d", "none",   "cube",
                                        "sphere",  "plane",  "pyramid",
                                        "white",   "black",  "cyan",
                                        "lime",    "red",    "blue",
                                        "amber",   "green",  "violet",
                                        "gray",    "yellow", "orange",
                                        "patrol",  "chase"};
const std::map<std::string, std::string> builtinResults = {
    {"sindhi_lafz", "lafz"}, {"sindhi_adad", "adad"},
    {"budhai", "khali"},     {"budh", "input"},      {"badal", "any"},        {"lambai", "adad"},
    {"likh", "khali"},       {"parh", "lafz"},       {"mahfooz", "khali"},    {"wapas_lao", "khali"},
    {"sqrt", "dec"},         {"sin", "dec"},         {"cos", "dec"},          {"abs", "dec"},
    {"min", "dec"},          {"max", "dec"},         {"bina_tarteeb", "dec"}, {"floor", "adad"},
    {"round", "adad"},       {"waqt", "dec"},        {"dekhar", "khali"},     {"khirki", "khali"},
    {"pichaan", "khali"},    {"dhun", "khali"},      {"wajai", "khali"},      {"awaz", "khali"},
    {"chup", "khali"},       {"jeet", "khali"},      {"haar", "khali"},       {"tabdeel_manzar", "khali"},
    {"chining", "khali"},    {"paida", "any"},       {"khatam", "khali"},     {"chalao", "khali"},
    {"random_top", "spawn"}, {"shoot_every", "dec"}, {"patrol", "behavior"},  {"chase", "behavior"},
    {"assert", "khali"},     {"uthao", "khali"}};
class Checker {
    Analysis a;
    N root;
    size_t unique=0;
    bool asynchronous=false;
    std::string accessOwner;
    std::map<std::string,std::vector<N>> groups,templates;
    std::set<std::string> checked;
    std::vector<std::map<std::string, Symbol>> scopes{1};
    std::map<std::string, std::map<std::string, std::string>> entities;
    int loops = 0, switches = 0;
    bool inGame = false;
    std::string result, owner;
    bool accepts(const std::string &target,const std::string &value) {
        if(compatible(target,value))return true;
        if(nullableType(target))return accepts(target.substr(0,target.size()-1),value);
        std::set<std::string> visited;
        std::function<bool(const std::string&)> parent=[&](const std::string &type){
            if(type==target)return true;
            if(!visited.insert(type).second||!a.classes.count(type))return false;
            for(auto &base:a.classes.at(type).parents)if(parent(base))return true;
            return false;
        };return parent(value);
    }
    Symbol *findSymbol(const std::string &name) {
        for(auto it=scopes.rbegin();it!=scopes.rend();++it){auto found=it->find(name);if(found!=it->end())return &found->second;}return nullptr;
    }
    void access(const N &member,const N &at,const std::string &base) {
        auto declaring=member->origin.empty()?base:member->origin;
        if(member->attrs.count("private") && accessOwner!=declaring)fail(at,"Private member '"+member->text+"' is not accessible.","SEM-141");
        if(member->attrs.count("protected") && (accessOwner.empty()||!accepts(declaring,accessOwner)))fail(at,"Protected member is not accessible.","SEM-141");
    }
    int argumentCost(const N &call,const N &f,size_t start,bool diagnose=false) {
        std::vector<bool> bound(f->params.size());size_t positional=0;bool named=false;int score=0;
        auto bad=[&](const std::string &why){if(diagnose)fail(call,why,"SEM-110");return -1;};
        for(size_t i=start;i<call->children.size();++i) {
            auto arg=call->children[i];auto actual=expression(arg);
            if(arg->kind=="spread") {
                if(!f->variadic||arg->children[0]->type.rfind("qatar ",0)!=0)return bad("Spread requires a typed array and a variadic parameter.");
                if(!accepts(f->params.back().first,arg->children[0]->type.substr(6)))return bad("Spread element type differs from the variadic parameter.");
                bound.back()=true;continue;
            }
            size_t slot=positional;
            if(arg->kind=="named") {
                named=true;slot=f->params.size();
                for(size_t j=0;j<f->params.size();++j)if(f->params[j].second==arg->text){slot=j;break;}
                if(slot==f->params.size())return bad("Unknown named argument '"+arg->text+"'.");
                if(f->variadic&&slot+1==f->params.size())return bad("Use positional values or ...array for a variadic parameter.");
            } else {if(named)return bad("Positional arguments must precede named arguments.");++positional;}
            if(f->variadic&&slot>=f->params.size()-1)slot=f->params.size()-1;
            if(slot>=f->params.size())return bad("Too many arguments.");
            bool rest=f->variadic&&slot+1==f->params.size();
            if(bound[slot]&&!rest)return bad("Argument '"+f->params[slot].second+"' was supplied twice.");
            bound[slot]=true;
            if(!accepts(f->params[slot].first,actual))return bad("Argument '"+f->params[slot].second+"' expects "+f->params[slot].first+", received "+actual+".");
            if(actual!=f->params[slot].first)++score;
        }
        for(size_t i=0;i<f->params.size();++i)if(!bound[i]&&!(f->variadic&&i+1==f->params.size())) {
            if(i>=f->defaults.size()||!f->defaults[i])return bad("Missing required argument '"+f->params[i].second+"'.");
        }
        return score;
    }
    N select(const N &call,const std::vector<N> &choices,size_t start) {
        N best;int cost=1000000;bool tie=false;
        for(auto &f:choices){int c=argumentCost(call,f,start);if(c>=0&&c<cost){best=f;cost=c;tie=false;}else if(c>=0&&c==cost)tie=true;}
        if(tie)fail(call,"Ambiguous overload; supply explicit argument types.","SEM-113");
        if(!best){if(choices.size()==1)argumentCost(call,choices[0],start,true);fail(call,"No overload accepts these arguments.","SEM-112");}
        return best;
    }
    bool unify(const std::string &pattern,const std::string &actual,const std::vector<std::string> &params,std::map<std::string,std::string> &binding) {
        if(std::find(params.begin(),params.end(),pattern)!=params.end()) {
            auto old=binding.find(pattern);if(old!=binding.end())return old->second==actual;
            binding[pattern]=actual;return true;
        }
        if(typeHead(pattern)!=typeHead(actual))return compatible(pattern,actual);
        auto p=typeArguments(pattern),v=typeArguments(actual);
        if(p.size()!=v.size())return false;
        if(p.empty())return pattern==actual;
        for(size_t i=0;i<p.size();++i)if(!unify(p[i],v[i],params,binding))return false;
        return true;
    }
    N instantiate(const N &t,const N &call) {
        std::map<std::string,std::string> binding;
        auto &explicitTypes=call->children[0]->typeArgs;
        if(!explicitTypes.empty()) {
            if(explicitTypes.size()!=t->generics.size())fail(call,"Wrong generic argument count.","SEM-130");
            for(size_t i=0;i<explicitTypes.size();++i)binding[t->generics[i]]=explicitTypes[i];
        } else {
            for(size_t i=1;i<call->children.size();++i) {
                auto arg=call->children[i];size_t slot=i-1;
                if(arg->kind=="named")for(size_t j=0;j<t->params.size();++j)if(t->params[j].second==arg->text)slot=j;
                if(t->variadic&&slot>=t->params.size()-1)slot=t->params.size()-1;
                if(slot>=t->params.size())continue;
                auto actual=expression(arg);if(arg->kind=="spread"&&actual.rfind("qatar ",0)==0)actual=actual.substr(6);
                if(!unify(t->params[slot].first,actual,t->generics,binding))return {};
            }
        }
        std::string id=t->text+"::<";
        for(size_t i=0;i<t->generics.size();++i) {
            auto &param=t->generics[i];if(!binding.count(param))return {};
            if(!validType(binding[param]))fail(call,"Unknown type argument.","SEM-130");
            auto constraint=t->constraints.find(param);
            if(constraint!=t->constraints.end()) {
                auto c=substituteType(constraint->second,binding),v=binding[param];
                bool ok=c=="Numeric"?numeric(v):c=="Comparable"||c=="Hashable"?primitive(v):accepts(c,v);
                if(!ok)fail(call,"Type '"+v+"' does not satisfy '"+c+"'.","SEM-130");
            }
            if(i)id+=",";id+=binding[param];
        }
        id+=">";if(a.functions.count(id))return a.functions[id];
        if(a.functions.size()>4096)fail(call,"Generic function specialization budget exceeded.","SEM-130");
        auto f=cloneNode(t,binding);f->generics.clear();f->id=id;f->attrs.insert("$specialized");
        a.functions[id]=f;root->children.push_back(f);elaborate(root);
        for(auto &n:root->children)if(n->kind=="class"&&n->generics.empty()&&!a.classes.count(n->text))registerNodes(n);
        return f;
    }
    void fail(const N &n, std::string msg, std::string code = "SEM-03") {
        throw Fault(code, 2, n->at, std::move(msg));
    }
    void gate(const N &n, const std::string &lib) {
        if (!a.libraries.count(lib))
            fail(n, "'" + n->text + "' requires 'kharna " + lib + "' at the top of the file.", "SEM-01");
    }
    void graphics(const N &n) {
        if (!a.libraries.count("gui") && !a.libraries.count("gui3d"))
            fail(n, "'" + n->text + "' requires 'kharna gui' or 'kharna gui3d'.", "SEM-01");
    }
    bool validType(const std::string &t) {
        if (t.rfind("qatar ",0)==0)return validType(t.substr(6));
        if(nullableType(t))return t!="khali?" && validType(t.substr(0,t.size()-1));
        if(callableType(t)) {
            if(functionResult(t).empty()||!validType(functionResult(t)))return false;
            for(auto &p:functionParameters(t))if(p=="khali"||!validType(p))return false;
            return true;
        }
        auto head=typeHead(t);auto args=typeArguments(t);
        if(head=="Map"||head=="Set"||head=="Task") {
            if(args.size()!=(head=="Map"?2u:1u))return false;
            for(auto &arg:args)if(!validType(arg)||(arg=="khali"&&head!="Task"))return false;
            if((head=="Map"||head=="Set")&&!primitive(args[0]))return false;
            return true;
        }
        return primitive(t)||t=="khali"||t=="Core.Value"||a.classes.count(t);
    }
    Symbol lookup(const N &n) {
        for (auto it = scopes.rbegin(); it != scopes.rend(); ++it) {
            auto s = it->find(n->text);
            if (s != it->end())
                return s->second;
        }
        fail(n, "Name '" + n->text + "' has not been declared.", "SEM-02");
        return {};
    }
    void declare(const N &n, const std::string &name, const std::string &type, bool fixed = false) {
        const std::set<std::string> reserved = {
            "adad",  "dec",    "lafz",  "isharo", "qatar",  "khali",  "budha",     "jey",
            "na_ta", "kharna", "acha",  "khed",   "khed3d", "kirdar", "mujassamo", "kam",
            "wapas", "qism",   "naon",  "ha",     "na",     "pakko",  "wori",      "gin",
            "rok",   "agty",   "azmai", "pakar",  "hisab",  "camera", "shabak"};
        if (scopes.back().count(name) || builtinResults.count(name) || literals.count(name) ||
            reserved.count(name) || standardModule(name) || name == "dt" || name == "mouse_x" || name == "mouse_y")
            fail(n, "Name '" + name + "' is already declared or reserved.", "SEM-02");
        scopes.back()[name] = {type, fixed};
    }
    void assignable(const N &n) {
        if (n->kind == "name") {
            auto s = lookup(n);
            if (s.fixed)
                fail(n, "Cannot modify 'pakko' constant '" + n->text + "'.", "SEM-02");
        } else if (n->kind == "member" || n->kind == "index") {
            if (n->kind == "member" && n->text == "lambai")
                fail(n, "Array length is read-only.", "SEM-02");
            auto root = n;
            while (root->kind == "member" || root->kind == "index")
                root = root->children[0];
            if (root->kind == "name" && lookup(root).fixed && !lookup(root).bindingOnly)
                fail(n, "Cannot mutate a value held by a pakko constant.", "SEM-02");
        } else
            fail(n, "The left side of assignment must be a variable, field, or array element.", "SEM-02");
    }
    void args(const N &n, size_t lo, size_t hi) {
        auto size = n->children.size() - 1;
        if (size < lo || size > hi)
            fail(n, "Expected " + std::to_string(lo) + (hi == lo ? "" : " to " + std::to_string(hi)) +
                        " arguments; received " + std::to_string(size) + ".");
    }
    void checkArgs(const N &n, const std::vector<std::pair<std::string, std::string>> &params, size_t start) {
        if (n->children.size() - start != params.size())
            fail(n, "Expected " + std::to_string(params.size()) + " arguments; received " +
                        std::to_string(n->children.size() - start) + ".");
        for (size_t i = 0; i < params.size(); i++) {
            auto t = expression(n->children[i + start]);
            if (!accepts(params[i].first, t))
                fail(n, "Argument '" + params[i].second + "' expects " + params[i].first + ", received " + t +
                            ".");
        }
    }
    std::string binary(const N &n, const std::string &l, const std::string &r, std::string op) {
        if (op == "+" && l == "lafz" && primitive(r))
            return "lafz";
        if ((l == "vec2" || l == "vec3") && (r == l || numeric(r)) &&
            (op == "+" || op == "-" || op == "*" || op == "/"))
            return l;
        if (op == "&&" || op == "||") {
            if (l != "isharo" || r != "isharo")
                fail(n, "Logical operators require isharo values.");
            return "isharo";
        }
        if (op == "==" || op == "!=") {
            if((nullableType(l)&&r=="khali")||(nullableType(r)&&l=="khali"))return "isharo";
            if (!(l == r || (numeric(l) && numeric(r))))
                fail(n, "Cannot compare " + l + " with " + r + ".");
            return "isharo";
        }
        if (op == ">" || op == "<" || op == ">=" || op == "<=") {
            if (!((numeric(l) && numeric(r)) || (l == "lafz" && r == "lafz")))
                fail(n, "Ordered comparison requires matching numbers or strings.");
            return "isharo";
        }
        if (!numeric(l) || !numeric(r))
            fail(n, "Operator '" + op + "' cannot combine " + l + " and " + r + ".");
        if (op == "%" && (l != "adad" || r != "adad"))
            fail(n, "Remainder (%) requires two adad values.");
        return l == "dec" || r == "dec" ? "dec" : "adad";
    }
    std::string expression(const N &n) {
        auto k = n->kind;
        auto &c = n->children;
        std::string t;
        if (k == "int")
            t = "adad";
        else if (k == "dec")
            t = "dec";
        else if (k == "string")
            t = "lafz";
        else if (k == "bool")
            t = "isharo";
        else if (k == "null")
            t = "khali";
        else if(k=="baseview")t=n->type;
        else if(k=="await") {
            if(!asynchronous)fail(n,"@await belongs in an @async kam.","SEM-170");
            auto value=expression(c[0]);auto args=typeArguments(value);
            if(typeHead(value)!="Task"||args.size()!=1)fail(n,"@await expects Task<T>.","SEM-170");
            t=args[0];
        } else if(k=="lambda") {
            if(n->id.empty()) {n->returnType=n->type;n->id="$lambda:"+std::to_string(unique++);n->attrs.insert("$local");a.functions[n->id]=n;function(n,owner);}
            t=functionType(n);
        } else if (k == "name") {
            if (literals.count(n->text))
                t = "lafz";
            else if (n->text == "adad" || n->text == "dec" || n->text == "lafz" || n->text == "isharo")
                t = "type";
            else if (n->text == "hisab" || n->text == "shabak" || n->text == "camera" || standardModule(n->text))
                t = "namespace";
            else if(auto symbol=findSymbol(n->text)){if(symbol->member)access(symbol->member,n,owner);t=symbol->type;}
            else if(groups.count(n->text)) {
                if(groups[n->text].size()!=1)fail(n,"An overloaded function reference needs a unique signature.","SEM-113");
                auto f=groups[n->text][0];n->id=f->id;n->attrs.insert("$function");t=functionType(f);
            }else t = lookup(n).type;
        } else if (k == "named" || k=="spread")
            t = expression(c[0]);
        else if (k == "vector") {
            for (auto &x : c)
                if (!numeric(expression(x)))
                    fail(x, "Vector components must be numbers.");
            t = c.size() == 2 ? "vec2" : "vec3";
        } else if (k == "array") {
            std::string element = "any";
            for (auto &x : c) {
                auto xt = expression(x);
                if (element == "any")
                    element = xt;
                else if (numeric(element) && numeric(xt)) {
                    if (xt == "dec")
                        element = "dec";
                } else if (!accepts(element, xt))
                    fail(x, "All qatar elements must have compatible types.");
            }
            t = "qatar " + element;
        } else if (k == "index") {
            auto base = expression(c[0]);
            if(c[0]->kind=="name"&&c[0]->text=="paan"&&c[1]->kind=="name"&&a.classes.count(c[1]->text)) {
                if(!accepts(c[1]->text,base))fail(n,"Requested type is not a base of paan.","SEM-140");
                n->kind="baseview";t=c[1]->text;n->type=t;return t;
            }
            if (base.rfind("qatar ", 0) != 0)
                fail(n, "Indexing requires a qatar array.");
            if (expression(c[1]) != "adad")
                fail(n, "An array index must be adad.");
            t = base.substr(6);
        } else if (k == "member") {
            auto base = expression(c[0]);
            if ((base.rfind("qatar ", 0) == 0 || typeHead(base)=="Map"||typeHead(base)=="Set") && (n->text == "lambai"||n->text=="size"))
                t = "adad";
            else if ((base == "vec2" || base == "vec3") &&
                     (n->text == "x" || n->text == "y" || (base == "vec3" && n->text == "z")))
                t = "dec";
            else if (entities.count(base) && entities[base].count(n->text))
                t = entities[base][n->text];
            else if (a.classes.count(base)) {
                for (auto &f : a.classes[base].fields)
                    if (f->text == n->text) {
                        access(f,n,base);
                        t = f->type;
                    }
                if(t.empty()) {
                    std::vector<N> methods;
                    for(auto &m:a.classes[base].methods)if(m->text==n->text)methods.push_back(m);
                    if(methods.size()==1) {access(methods[0],n,base);n->attrs.insert("$methodref");n->id=(methods[0]->attrs.count("virtual")||methods[0]->attrs.count("abstract"))?methods[0]->id:"$direct:"+base+"."+methods[0]->id;if(c[0]->kind=="baseview")n->id="$direct:"+base+"."+methods[0]->id;t=functionType(methods[0]);}
                }
                if (t.empty())
                    fail(n, "Type '" + base + "' has no field '" + n->text + "'.", "SEM-02");
            } else
                fail(n, "Type '" + base + "' has no field '" + n->text + "'.", "SEM-02");
        } else if (k == "binary") {
            if(n->text=="??") {
                auto left=expression(c[0]),right=expression(c[1]);
                if(!nullableType(left)||!accepts(left.substr(0,left.size()-1),right))fail(n,"?? requires nullable T and a compatible default.");
                t=left.substr(0,left.size()-1);
            }else t = binary(n, expression(c[0]), expression(c[1]), n->text);
        }
        else if (k == "unary") {
            auto xt = expression(c[0]);
            if (n->text == "!") {
                if (xt != "isharo")
                    fail(n, "Logical negation requires isharo.");
                t = "isharo";
            } else {
                if (!numeric(xt))
                    fail(n, "Unary sign requires a number.");
                t = xt;
            }
        } else if (k == "increment") {
            assignable(c[0]);t=expression(c[0]);
            if(!numeric(t))fail(n,"++ and -- require a numeric variable, field or array element.");
        } else if (k == "assign") {
            assignable(c[0]);
            auto target = expression(c[0]), value = expression(c[1]);
            if (n->text != "=")
                value = binary(n, target, value, n->text.substr(0, 1));
            if (!accepts(target, value))
                fail(n, "Cannot assign " + value + " to " + target + ". Use badal(value, " + target +
                            ") for an explicit conversion.");
            t = target;
        } else if (k == "new") {
            auto head=typeHead(n->text);
            if(head=="Map"||head=="Set") {
                gate(n,"Collections");
                if(!validType(n->text)||!c.empty())fail(n,"Use naon Map<Key,Value>() or naon Set<T>() with primitive keys and no constructor arguments.");
                n->attrs.insert("$collection");t=n->text;n->type=t;return t;
            }
            if (!a.classes.count(n->text))
                fail(n, "Unknown qism '" + n->text + "'.", "SEM-02");
            if(a.classes[n->text].attrs.count("abstract")||a.classes[n->text].attrs.count("interface"))fail(n,"Cannot instantiate an abstract class or interface.","SEM-142");
            std::vector<N> constructors;for(auto &m:a.classes[n->text].methods)if(m->text=="naon")constructors.push_back(m);
            if(!constructors.empty()) {
                auto ctor=select(n,constructors,0);n->id=ctor->id;n->attrs.insert("$constructor");t=n->text;n->type=t;return t;
            }
            std::vector<std::pair<std::string, std::string>> params;
            for (auto &f : a.classes[n->text].fields)
                params.push_back({f->type, f->text});
            auto &fields=a.classes[n->text].fields;
            size_t required=fields.size();
            while(required && !fields[required-1]->children.empty())required--;
            if(c.size()<required||c.size()>fields.size())fail(n,"Expected "+std::to_string(required)+"–"+std::to_string(fields.size())+" constructor arguments, received "+std::to_string(c.size())+".");
            params.resize(c.size());checkArgs(n,params,0);
            t = n->text;
        } else if (k == "call") {
            auto callee = c[0];
            if (callee->kind == "name") {
                auto name = callee->text;
                if(name=="budhai")fail(n,"budhai is output. Use budh(...) to read a value; put budhai on its own output statement.");
                if(auto local=findSymbol(name);local&&callableType(local->type)) {
                    auto signature=local->type;auto params=functionParameters(signature);
                    N f=local->callable;
                    if(f)argumentCost(n,f,1,true);
                    else {std::vector<std::pair<std::string,std::string>> ps;for(auto &ty:params)ps.push_back({ty,"value"});checkArgs(n,ps,1);for(size_t i=1;i<c.size();++i)if(c[i]->kind=="named"||c[i]->kind=="spread")fail(n,"Named/spread calls require a declared parameter signature.");}
                    n->attrs.insert("$indirect");t=functionResult(signature);
                } else if(groups.count(name)||templates.count(name)) {
                    std::vector<N> choices=groups[name];
                    if(templates.count(name))for(auto &g:templates[name]){auto instance=instantiate(g,n);if(instance)choices.push_back(instance);}
                    auto f=select(n,choices,1);n->id=f->id;t=f->attrs.count("async")?"Task<"+f->type+">":f->type;
                } else if (builtinResults.count(name)) {
                    t = builtinResults.at(name);
                    if (name == "budh") {
                        args(n, 0, 1);
                        if (c.size() == 2 && expression(c[1]) != "lafz")
                            fail(n, "Input prompt must be lafz text.");
                    } else if (name == "badal") {
                        args(n, 2, 2);
                        expression(c[1]);
                        if (c[2]->kind != "name" || !primitive(c[2]->text))
                            fail(n, "badal's second argument is adad, dec, lafz, or isharo.");
                        c[2]->type = "type";
                        t = c[2]->text;
                    } else {
                        if (name == "likh")
                            args(n, 2, 2);
                        else if (name == "parh" || name == "mahfooz" || name == "wapas_lao" ||
                                 name == "khatam" || name == "random_top" || name == "shoot_every" ||
                                 name == "sqrt" || name == "sin" || name == "cos" || name == "abs" ||
                                 name == "floor" || name == "round" || name == "lambai" || name == "uthao" || name == "sindhi_lafz" || name == "sindhi_adad")
                            args(n, 1, 1);
                        else if (name == "min" || name == "max" || name == "bina_tarteeb" || name == "chalao")
                            args(n, 2, 2);
                        else if (name == "chup" || name == "waqt")
                            args(n, 0, 0);
                        else if (name == "assert")
                            args(n, 1, 2);
                        for (size_t i = 1; i < c.size(); i++)
                            expression(c[i]);
                        if (name == "sindhi_lafz" && c[1]->type != "adad") fail(n, "sindhi_lafz expects an adad from 0 through 1000.");
                        if (name == "sindhi_adad" && c[1]->type != "lafz") fail(n, "sindhi_adad expects Roman Sindhi lafz text.");
                    }
                    if (name == "sqrt" || name == "sin" || name == "cos" || name == "bina_tarteeb" ||
                        name == "floor" || name == "round" || name == "min" || name == "max" ||
                        name == "abs") {
                        gate(n, "hisab");
                        for (size_t i = 1; i < c.size(); i++)
                            if (!numeric(expression(c[i])))
                                fail(n, "Math functions require numeric arguments.");
                        if ((name == "abs" || name == "min" || name == "max" || name == "bina_tarteeb") &&
                            c.size() > 1) {
                            t = expression(c[1]);
                            for (size_t i = 2; i < c.size(); i++)
                                if (expression(c[i]) == "dec")
                                    t = "dec";
                        }
                    }
                    if (name == "dhun" || name == "wajai" || name == "awaz" || name == "chup")
                        gate(n, "audio");
                    if (name == "paida" || name == "khatam" || name == "chining" || name == "dekhar" ||
                        name == "khirki" || name == "pichaan" || name == "jeet" || name == "haar" ||
                        name == "tabdeel_manzar" || name == "chalao")
                        graphics(n);
                    if (name == "waqt")
                        gate(n, "waqt");
                } else
                    fail(callee, "Unknown function '" + name + "'.", "SEM-02");
            } else if (callee->kind == "member") {
                auto base = expression(callee->children[0]);
                auto method = callee->text;
                if(typeHead(base)=="Map"||typeHead(base)=="Set") {
                    auto types=typeArguments(base);auto argc=c.size()-1;
                    for(size_t i=1;i<c.size();++i)expression(c[i]);
                    auto require=[&](size_t size){if(argc!=size)fail(n,"Wrong collection argument count.");};
                    auto arg=[&](size_t i,const std::string &type){if(!accepts(type,c[i]->type))fail(c[i],"Collection argument expects "+type+".");};
                    bool map=typeHead(base)=="Map";
                    if(method=="set"&&map){require(2);arg(1,types[0]);arg(2,types[1]);t="khali";}
                    else if((method=="get"||method=="tryGet")&&map){require(1);arg(1,types[0]);t=types[1]+(method=="tryGet"&&!nullableType(types[1])?"?":"");}
                    else if(method=="contains"||method=="has"||method=="remove"||method=="add") {require(1);arg(1,types[0]);if(method=="add"&&map)fail(n,"Map uses set(key,value).");t="isharo";}
                    else if(method=="keys"||method=="values") {require(0);t="qatar "+types[map&&method=="values"?1:0];}
                    else if(method=="clear"){require(0);t="khali";}
                    else fail(n,"Unknown collection method '"+method+"'.");
                } else if (base.rfind("qatar ", 0) == 0) {
                    auto root = callee->children[0];
                    if (root->kind == "name" && lookup(root).fixed && (method=="joryo"||method=="kadh"||method=="reverse"||method=="insert"))
                        fail(n, "Cannot mutate a pakko array.", "SEM-02");
                    if (method == "joryo") {
                        args(n, 1, 1);
                        if (!accepts(base.substr(6), expression(c[1])))
                            fail(n, "Array element type mismatch.");
                        t = "khali";
                    } else if (method == "kadh") {
                        args(n, 1, 1);
                        if (expression(c[1]) != "adad")
                            fail(n, "kadh expects an adad index.");
                        t = base.substr(6);
                    } else if(method=="map"||method=="filter"||method=="reduce") {
                        args(n,method=="reduce"?2:1,method=="reduce"?2:1);
                        auto fn=expression(c[method=="reduce"?2:1]);
                        if(!callableType(fn))fail(n,"Collection callback must be a typed kam value.");
                        auto ps=functionParameters(fn);auto result=functionResult(fn),element=base.substr(6);
                        if(method=="reduce") {auto initial=expression(c[1]);if(ps!=std::vector<std::string>{initial,element}||!accepts(initial,result))fail(n,"reduce callback expects (accumulator, element) and returns accumulator.");t=initial;}
                        else {if(ps!=std::vector<std::string>{element})fail(n,"Callback element type differs.");if(method=="filter"&&result!="isharo")fail(n,"filter callback returns isharo.");t=method=="map"?"qatar "+result:base;}
                    } else if(method=="contains"||method=="reverse"||method=="insert") {
                        args(n,method=="reverse"?0:method=="insert"?2:1,method=="reverse"?0:method=="insert"?2:1);
                        if(method=="contains"&&!accepts(base.substr(6),expression(c[1])))fail(n,"contains element type differs.");
                        if(method=="insert"&&(expression(c[1])!="adad"||!accepts(base.substr(6),expression(c[2]))))fail(n,"insert expects index and element.");
                        t=method=="contains"?"isharo":"khali";
                    } else
                        fail(n, "Unknown qatar method '" + method + "'.", "SEM-02");
                } else if (a.classes.count(base)) {
                    std::vector<N> matches;
                    for (auto &m : a.classes[base].methods)
                        if (m->text == method)
                            matches.push_back(m);
                    if (matches.empty())
                        fail(n, "Unknown method '" + method + "'.", "SEM-02");
                    auto f=select(n,matches,1);access(f,n,base);n->id=f->id;
                    if(!f->attrs.count("virtual")||callee->children[0]->kind=="baseview")n->id="$direct:"+base+"."+f->id;
                    t=f->attrs.count("async")?"Task<"+f->type+">":f->type;
                } else if (base == "namespace") {
                    auto ns = callee->children[0]->text;
                    if(standardModule(ns)) {
                        gate(n,ns);std::vector<std::string> arguments;
                        for(size_t i=1;i<c.size();++i)arguments.push_back(expression(c[i]));
                        t=standardResult(ns+"."+method,arguments,n->at);
                    } else if (ns == "hisab") {
                        auto simple = std::make_shared<Node>(*n);
                        simple->children[0] = std::make_shared<Node>(*callee);
                        simple->children[0]->kind = "name";
                        simple->children[0]->text = method;
                        t = expression(simple);
                    } else if (ns == "camera") {
                        if (method != "follow")
                            fail(n, "camera supports follow(actor).");
                        args(n, 1, 1);
                        graphics(n);
                        expression(c[1]);
                        t = "khali";
                    } else if (ns == "shabak") {
                        gate(n, "shabak");
                        if (method == "host") {
                            args(n, 1, 1);
                            t = "khali";
                        } else if (method == "connect") {
                            args(n, 2, 2);
                            t = "khali";
                        } else if (method == "send") {
                            args(n, 1, 1);
                            t = "khali";
                        } else if (method == "receive") {
                            args(n, 0, 0);
                            t = "lafz";
                        } else if (method == "close") {
                            args(n, 0, 0);
                            t = "khali";
                        } else
                            fail(n, "Unknown shabak method.");
                        for (size_t i = 1; i < c.size(); i++)
                            expression(c[i]);
                    }
                } else
                    fail(n, "This value has no callable method '" + method + "'.", "SEM-02");
            } else {
                auto fn=expression(callee);
                if(!callableType(fn))fail(n,"Call requires a typed function value.");
                std::vector<std::pair<std::string,std::string>> params;for(auto &ty:functionParameters(fn))params.push_back({ty,"value"});checkArgs(n,params,1);
                n->attrs.insert("$indirect");t=functionResult(fn);
            }
        } else
            fail(n, "Unsupported expression '" + k + "'.");
        n->type = t;
        return t;
    }
    void registerNodes(const N &n) {
        if (n->kind == "import") {
            if (n->text.find('.') == std::string::npos) {
                if (n->text != "gui" && n->text != "gui3d" && n->text != "audio" && n->text != "hisab" &&
                    n->text != "waqt" && n->text != "shabak" && !standardModule(n->text))
                    fail(n, "Unknown library '" + n->text + "'.", "SEM-01");
                a.libraries.insert(n->text);
            }
        }
        if (n->kind == "class") {
            if(!n->generics.empty())return;
            if (a.classes.count(n->text))return;
            auto &cl=a.classes[n->text];cl.parents=n->bases;cl.attrs=n->attrs;
            std::map<std::string,size_t> counts;
            for(auto &m:n->children)if(m->kind=="function")++counts[m->text];
            std::set<std::string> fields;
            for(auto &m:n->children) {
                if(m->kind=="function") {
                    m->id=m->text;
                    if(counts[m->text]>1||n->attrs.count("$hierarchy")){m->id+="$";for(auto &p:m->params)m->id+=p.first+";";}
                    cl.methods.push_back(m);
                }else {if(!fields.insert(m->text).second)fail(m,"Duplicate field.","SEM-02");cl.fields.push_back(m);}
            }
            return;
        }
        if (n->kind == "function") {
            if(n->children.empty())fail(n,"A module-level function needs a body.");
            if(!n->generics.empty()){templates[n->text].push_back(n);return;}
            if(n->attrs.count("$specialized"))return;
            auto &group=groups[n->text];
            for(auto &f:group){bool same=f->params.size()==n->params.size();for(size_t i=0;same&&i<f->params.size();++i)same=f->params[i].first==n->params[i].first;if(same)fail(n,"Duplicate function signature.","SEM-02");}
            group.push_back(n);
            for(auto &f:group){
                if(!f->id.empty())a.functions.erase(f->id);
                f->id=f->text;
                if(group.size()>1){f->id+="$";for(auto &p:f->params)f->id+=p.first+";";}
                a.functions[f->id]=f;
            }
            return;
        }
        if (n->kind == "actor" || n->kind == "mesh") {
            auto ty = "@" + n->text;
            declare(n, n->text, ty);
            auto &props = entities[ty];
            props = {{"jagah", "vec2"},  {"jagah3d", "vec3"},    {"ghumao", "vec3"},    {"paimano", "vec3"},
                     {"raftar", "dec"},  {"rang", "lafz"},       {"qabu", "lafz"},      {"wazan", "dec"},
                     {"chhal", "dec"},   {"thandho", "isharo"},  {"visible", "isharo"}, {"width", "dec"},
                     {"height", "dec"},  {"vy", "dec"},          {"tasveer", "lafz"},   {"shakal3d", "lafz"},
                     {"paida", "spawn"}, {"chal_ai", "behavior"}};
            for (auto &p : n->children)
                if (!props.count(p->text) && p->text != "harkat")
                    props[p->text] = "any";
            return;
        }
        for (auto &c : n->children)
            registerNodes(c);
    }
    bool returns(const N &n) {
        if (n->kind == "return")
            return true;
        if (n->kind == "if")
            return n->children.size() == 3 && returns(n->children[1]) && returns(n->children[2]);
        if (n->kind == "try")
            return returns(n->children[0]) && returns(n->children[1]);
        if (n->kind == "block")
            for (auto &c : n->children)
                if (returns(c))
                    return true;
        return false;
    }
    void function(const N &n, const std::string &klass = "") {
        if(n->children.empty())return;
        auto key=klass+"#"+n->id;
        if(!checked.insert(key).second)return;
        if(n->text=="naon"&&(n->type!="khali"||n->attrs.count("async")||n->variadic))fail(n,"Constructors return khali and use fixed synchronous parameters.");
        auto declared=n->returnType.empty()?n->type:n->returnType;
        if(!validType(declared))fail(n,"Unknown return type '"+declared+"'.");
        auto oldResult=result,oldOwner=owner,oldAccess=accessOwner;bool oldAsync=asynchronous;
        int oldLoops=loops,oldSwitches=switches;loops=switches=0;
        result=declared;owner=klass;accessOwner=n->origin.empty()?klass:n->origin;asynchronous=false;
        scopes.emplace_back();
        if(!klass.empty()) {
            for(auto &field:a.classes[klass].fields)scopes.back()[field->text]={field->type,field->fixed,false,{},field};
            scopes.back()["paan"]={klass,true,true};
        }
        std::set<std::string> names;bool hasDefault=false;
        for(size_t i=0;i<n->params.size();++i) {
            auto &p=n->params[i];
            if(!validType(p.first)||p.first=="khali")fail(n,"Invalid parameter type '"+p.first+"'.");
            if(!names.insert(p.second).second||p.second=="paan")fail(n,"Duplicate or reserved parameter.","SEM-02");
            auto value=i<n->defaults.size()?n->defaults[i]:N{};
            if(value){hasDefault=true;if(!accepts(p.first,expression(value)))fail(value,"Default parameter type differs.");}
            else if(hasDefault&&!(n->variadic&&i+1==n->params.size()))fail(n,"Required parameters must precede defaults.");
            scopes.back()[p.second]={n->variadic&&i+1==n->params.size()?"qatar "+p.first:p.first,false};
        }
        asynchronous=n->attrs.count("async");
        statement(n->children[0]);
        if(result!="khali"&&!returns(n->children[0]))fail(n,"Function '"+n->text+"' must return "+result+" on every path.");
        scopes.pop_back();result=oldResult;owner=oldOwner;accessOwner=oldAccess;asynchronous=oldAsync;loops=oldLoops;switches=oldSwitches;
    }
    void statement(const N &n) {
        auto k = n->kind;
        auto &c = n->children;
        const std::set<std::string> supported={"async","interface","abstract","virtual","override","final","public","private","protected"};
        for(auto &attribute:n->attrs)if(attribute[0]!='$'&&!supported.count(attribute))fail(n,"Unsupported attribute @"+attribute+".");
        if (k == "program") {
            for (auto &x : std::vector<N>(c))if(x->kind!="function")statement(x);
        } else if (k == "block") {
            scopes.emplace_back();
            for (auto &x : std::vector<N>(c))
                statement(x);
            scopes.pop_back();
        } else if (k == "var") {
            if(n->type=="auto") {
                if(c.empty())fail(n,"Inferred variables need an initializer.");
                n->type=expression(c[0]);if(n->type=="khali"||n->type=="qatar any")fail(n,"Use an explicit type for empty/null values.");
            }
            if (!validType(n->type) || n->type == "khali")
                fail(n, "Unknown variable type '" + n->type + "'.");
            if (!c.empty()) {
                auto t = expression(c[0]);
                if (!accepts(n->type, t))
                    fail(n, "Cannot initialize " + n->type + " with " + t +
                                ". Use badal for explicit conversion.");
            } else if(callableType(n->type)||typeHead(n->type)=="Task"||typeHead(n->type)=="Map"||typeHead(n->type)=="Set")fail(n,"This type needs an explicit initializer.");
            else if (n->fixed)
                fail(n, "A pakko constant needs an initial value.");
            declare(n, n->text, n->type, n->fixed);
            if(!c.empty()&&c[0]->kind=="lambda")scopes.back()[n->text].callable=c[0];
        } else if(k=="function") {
            if(!n->generics.empty())fail(n,"Local generic declarations are not supported; use a module-level generic kam.");
            if(n->id.empty()||!n->attrs.count("$local"))n->id="$local:"+std::to_string(unique++)+":"+n->text;
            n->attrs.insert("$local");declare(n,n->text,functionType(n),true);scopes.back()[n->text].callable=n;
            a.functions[n->id]=n;function(n,owner);
        } else if (k == "expression")
            expression(c[0]);
        else if (k == "print")
            expression(c[0]);
        else if (k == "if" || k == "while") {
            if (expression(c[0]) != "isharo")
                fail(c[0], "Condition must have type isharo.");
            if (k == "while")
                loops++;
            statement(c[1]);
            if (k == "while")
                loops--;
            if (c.size() > 2)
                statement(c[2]);
        } else if (k == "for") {
            scopes.emplace_back();
            if (c[0]->kind == "var")
                statement(c[0]);
            else
                expression(c[0]);
            if (expression(c[1]) != "isharo")
                fail(c[1], "gin condition must be isharo.");
            expression(c[2]);
            loops++;
            statement(c[3]);
            loops--;
            scopes.pop_back();
        } else if (k == "foreach") {
            auto t = expression(c[0]);
            if (t.rfind("qatar ", 0) != 0 && typeHead(t)!="Map" && typeHead(t)!="Set")
                fail(n, "gin andar requires a qatar, Map or Set.");
            n->type=t.rfind("qatar ",0)==0?t.substr(6):typeArguments(t)[0];
            scopes.emplace_back();
            declare(n, n->text, n->type);
            loops++;
            statement(c[1]);
            loops--;
            scopes.pop_back();
        } else if (k == "break") {
            if (!loops && !switches)
                fail(n, "rok belongs inside a loop or chundo.");
        } else if (k == "continue") {
            if (!loops)
                fail(n, "agty belongs inside a loop.");
        } else if (k == "return") {
            if (result.empty())
                fail(n, "wapas belongs inside kam.");
            auto t = c.empty() ? "khali" : expression(c[0]);
            if (!accepts(result, t))
                fail(n, "Return expects " + result + ", received " + t + ".");
        } else if (k == "try") {
            statement(c[0]);
            scopes.emplace_back();
            declare(n, n->text, "lafz");
            statement(c[1]);
            scopes.pop_back();
        } else if (k == "switch") {
            auto t = expression(c[0]);
            switches++;
            bool hasDefault = false;
            for (size_t i = 1; i < c.size(); i++) {
                if (c[i]->kind == "case") {
                    if (!accepts(t, expression(c[i]->children[0])))
                        fail(c[i], "Case type differs from chundo value.");
                } else {
                    if (hasDefault)
                        fail(c[i], "Only one aam branch is allowed.");
                    hasDefault = true;
                }
                statement(c[i]->children.back());
            }
            switches--;
        } else if (k == "game") {
            if (inGame)
                fail(n, "A game cannot be nested inside another game.");
            gate(n, n->type == "3" ? "gui3d" : "gui");
            inGame = true;
            for (auto &x : c[0]->children)
                statement(x);
            inGame = false;
        } else if (k == "scene") {
            graphics(n);
            for (auto &x : c[0]->children)
                statement(x);
        } else if (k == "actor" || k == "mesh") {
            gate(n, k == "mesh" ? "gui3d" : "gui");
            auto &props = entities["@" + n->text];
            for (auto &p : c) {
                if (p->text == "harkat") {
                    for (auto &v : p->children)
                        expression(v);
                    continue;
                }
                auto t = expression(p->children[0]);
                if (!accepts(props[p->text], t))
                    fail(p, "Property '" + p->text + "' expects " + props[p->text] + ", received " + t + ".");
                if (props[p->text] == "any")
                    props[p->text] = t;
                for (size_t i = 1; i < p->children.size(); i++)
                    if (!numeric(expression(p->children[i])))
                        fail(p, "Sprite dimensions must be numbers.");
            }
        } else if (k == "config") {
            gate(n, "gui3d");
            for (auto &p : c)
                expression(p->children[0]);
        } else if (k == "window" || k == "background") {
            graphics(n);
            for (auto &x : c)
                expression(x);
            if (k == "window" && (c[0]->type != "adad" || c[1]->type != "adad"))
                fail(n, "khirki dimensions must be adad integers.");
        } else if (k == "audio") {
            gate(n, "audio");
            expression(c[0]);
        } else if (k == "timer" || k == "event") {
            graphics(n);
            if (!inGame)
                fail(n, "Game handlers belong inside a khed or khed3d block.");
            size_t end = c.size() - 1;
            if (k == "timer") {
                if (!numeric(expression(c[0])))
                    fail(n, "har interval must be numeric.");
            } else {
                bool collision = n->text == "takkar" || n->text == "takkar3d";
                if (end != (collision ? 2u : 1u))
                    fail(n, "Wrong number of event arguments.");
                if (n->text == "takkar3d")
                    gate(n, "gui3d");
                for (size_t i = 0; i < end; i++) {
                    auto t = expression(c[i]);
                    if (collision && t.rfind("@", 0) != 0)
                        fail(c[i], "Collision arguments must name entities.");
                    if (!collision && t != "lafz")
                        fail(c[i], "Input event expects a key or button name.");
                }
            }
            statement(c.back());
        } else if (k == "tilemap") {
            gate(n, "gui");
            auto t = expression(c[0]);
            if (t != "qatar qatar adad")
                fail(n, "naqsho expects a 2D qatar adad grid.");
            declare(n, n->text, t);
        } else if (k == "shop") {
            graphics(n);
            expression(c[0]);
            for (size_t i = 1; i < c.size(); i++) {
                expression(c[i]->children[0]);
                if (!numeric(expression(c[i]->children[1])))
                    fail(c[i], "Shop price must be numeric.");
                statement(c[i]->children[2]);
            }
        } else if (k == "level") {
            graphics(n);
            expression(c[0]);
            statement(c[1]);
        } else if (k == "class" || k == "import") {
        } else
            fail(n, "Unsupported statement '" + k + "'.");
    }

  public:
    Analysis run(const N &tree) {
        root=tree;elaborate(root);
        scopes[0]["dt"]={"dec",true};scopes[0]["mouse_x"]={"adad",true};scopes[0]["mouse_y"]={"adad",true};
        registerNodes(root);statement(root);a.globals=scopes[0];
        std::set<std::string> fieldsChecked;
        bool progress=true;
        while(progress) {
            progress=false;
            for(auto &pair:a.classes) {
                if(fieldsChecked.insert(pair.first).second) {
                    progress=true;scopes.emplace_back();
                    for(auto &field:pair.second.fields) {
                        if(!validType(field->type)||field->type=="khali"||field->text=="paan")fail(field,"Invalid class field type/name.");
                        if(field->fixed)fail(field,"pakko fields require the separate readonly-field initialization contract; use a regular field.");
                        if(!field->children.empty()&&!accepts(field->type,expression(field->children[0])))fail(field,"Field initializer type differs.");
                        declare(field,field->text,field->type);
                    }
                    scopes.pop_back();
                }
                for(auto &f:pair.second.methods)if(!f->children.empty()&&!checked.count(pair.first+"#"+f->id)){progress=true;function(f,pair.first);}
            }
            auto functions=a.functions;
            for(auto &pair:functions)if(!pair.second->attrs.count("$local")&&!checked.count("#"+pair.second->id)){progress=true;function(pair.second);}
        }
        return a;
    }
};
} // namespace
Analysis analyze(const N &root) { return Checker().run(root); }
} // namespace jim
