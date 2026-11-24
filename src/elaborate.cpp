#include "jimsabz.hpp"

namespace jim {
void elaborate(const N &root) {
    std::map<std::string,N> classes,templates;
    std::set<std::string> parameters;
    for(auto &n:root->children)if(n->kind=="class") {
        if(n->generics.empty()) {
            if(!classes.emplace(n->text,n).second)throw Fault("SEM-02",2,n->at,"Duplicate qism '"+n->text+"'.");
        } else {
            if(!templates.emplace(n->text,n).second)throw Fault("SEM-02",2,n->at,"Duplicate generic qism.");
            parameters.insert(n->generics.begin(),n->generics.end());
        }
    }
    std::function<void(const N&)> findParameters=[&](const N &n){
        parameters.insert(n->generics.begin(),n->generics.end());
        for(auto &c:n->children)findParameters(c);
    };findParameters(root);
    std::function<void(const std::string&,const Span&,int)> ensure;
    ensure=[&](const std::string &type,const Span &at,int depth) {
        if(depth>32||classes.size()>1024)throw Fault("SEM-130",2,at,"Generic type instantiation limit exceeded.");
        if(nullableType(type)){ensure(type.substr(0,type.size()-1),at,depth+1);return;}
        auto args=typeArguments(type);
        for(auto &arg:args)ensure(arg,at,depth+1);
        if(callableType(type)) {
            for(auto &arg:functionParameters(type))ensure(arg,at,depth+1);
            ensure(functionResult(type),at,depth+1);return;
        }
        if(type.rfind("qatar ",0)==0)return;
        auto head=typeHead(type);auto found=templates.find(head);
        if(found==templates.end()||classes.count(type))return;
        auto t=found->second;
        if(args.size()!=t->generics.size())throw Fault("SEM-130",2,at,"Wrong generic type argument count for '"+head+"'.");
        for(auto &arg:args) {
            for(auto &param:parameters) {
                std::map<std::string,std::string> test{{param,"$unbound"}};
                if(substituteType(arg,test)!=arg)return;
            }
        }
        for(size_t i=0;i<args.size();++i)if(t->constraints.count(t->generics[i])) {
            auto constraint=t->constraints.at(t->generics[i]);bool ok=false;
            if(constraint=="Numeric")ok=args[i]=="adad"||args[i]=="dec";
            else if(constraint=="Hashable"||constraint=="Comparable")ok=args[i]=="adad"||args[i]=="dec"||args[i]=="lafz"||args[i]=="isharo";
            else {std::set<std::string> seen;std::function<bool(const std::string&)> derives=[&](const std::string &s){if(s==constraint)return true;if(!seen.insert(s).second||!classes.count(s))return false;for(auto &base:classes.at(s)->bases)if(derives(base))return true;return false;};ok=derives(args[i]);}
            if(!ok)throw Fault("SEM-130",2,at,"Generic type argument does not satisfy '"+constraint+"'.");
        }
        std::map<std::string,std::string> binding;
        for(size_t i=0;i<args.size();++i)binding[t->generics[i]]=args[i];
        auto instance=cloneNode(t,binding);instance->text=type;instance->generics.clear();
        instance->attrs.erase("$elaborated");classes[type]=instance;root->children.push_back(instance);
        for(auto &base:instance->bases)ensure(base,at,depth+1);
        std::function<void(const N&)> visit=[&](const N &n){
            if(!n->type.empty())ensure(n->type,n->at,depth+1);
            for(auto &p:n->params)ensure(p.first,n->at,depth+1);
            if(n->kind=="new")ensure(n->text,n->at,depth+1);
            for(auto &c:n->children)visit(c);
        };visit(instance);
    };
    std::function<void(const N&)> scan=[&](const N &n) {
        if(!n->generics.empty())return;
        if(!n->type.empty())ensure(n->type,n->at,0);
        for(auto &p:n->params)ensure(p.first,n->at,0);
        if(n->kind=="new")ensure(n->text,n->at,0);
        for(auto &base:n->bases)ensure(base,n->at,0);
        auto children=n->children;for(auto &c:children)scan(c);
        for(auto &c:n->defaults)if(c)scan(c);
    };scan(root);
    std::set<std::string> active,done;
    auto signature=[](const N &m){std::string s=m->text+"(";for(auto &p:m->params)s+=p.first+",";return s+")";};
    std::function<void(const N&)> flatten=[&](const N &n) {
        if(done.count(n->text)||n->attrs.count("$elaborated"))return;
        if(!active.insert(n->text).second)throw Fault("SEM-140",2,n->at,"Inheritance cycle through '"+n->text+"'.");
        std::vector<N> fields,methods;std::map<std::string,N> bySignature;std::set<std::string> fieldNames;
        int classBases=0;
        bool interface=n->attrs.count("interface");
        for(auto &base:n->bases) {
            if(!classes.count(base))throw Fault("SEM-140",2,n->at,"Unknown base/interface '"+base+"'.");
            auto parent=classes.at(base);flatten(parent);
            if(parent->attrs.count("final"))throw Fault("SEM-142",2,n->at,"Cannot inherit final qism '"+base+"'.");
            bool parentInterface=parent->attrs.count("interface");
            if(!parentInterface && (++classBases>1||interface))throw Fault("SEM-140",2,n->at,"Use one class base and any number of interfaces.");
            for(auto &member:parent->children) {
                if(member->kind=="function"&&member->text=="naon")continue;
                auto copy=cloneNode(member);copy->origin=member->origin.empty()?base:member->origin;
                if(copy->kind=="var") {
                    if(!fieldNames.insert(copy->text).second)throw Fault("SEM-140",2,n->at,"Inherited field conflict.");
                    fields.push_back(copy);
                } else if(copy->kind=="function") {
                    auto sig=signature(copy);
                    auto old=bySignature.find(sig);
                    if(old!=bySignature.end()&&old->second->type!=copy->type)throw Fault("SEM-140",2,n->at,"Incompatible inherited method results.");
                    if(old==bySignature.end()||!copy->children.empty())bySignature[sig]=copy;
                }
            }
        }
        std::set<std::string> ownSignatures;
        for(auto &member:n->children) {
            member->origin=n->text;
            if(member->kind=="var") {
                if(interface)throw Fault("SEM-140",2,member->at,"Interfaces contain method signatures, not fields.");
                if(!fieldNames.insert(member->text).second)throw Fault("SEM-02",2,member->at,"Duplicate or hidden class field.");
                fields.push_back(member);
            } else if(member->kind=="function") {
                auto sig=signature(member);
                if(!ownSignatures.insert(sig).second)throw Fault("SEM-02",2,member->at,"Duplicate method signature.");
                if(interface) {
                    if(!member->children.empty())throw Fault("SEM-140",2,member->at,"Interface methods are signatures without bodies.");
                    member->attrs.insert("abstract");member->attrs.insert("virtual");
                }
                auto old=bySignature.find(sig);
                if(old!=bySignature.end()) {
                    auto parent=old->second;
                    if(parent->attrs.count("final")||(!parent->attrs.count("virtual")&&!parent->attrs.count("abstract")))throw Fault("SEM-140",2,member->at,"Method is not overridable.");
                    if(parent->type!=member->type)throw Fault("SEM-140",2,member->at,"Override return type must match.");
                    if(!parent->attrs.count("abstract")&&!member->attrs.count("override"))throw Fault("SEM-140",2,member->at,"Mark this method @override.");
                    member->attrs.insert("virtual");
                } else if(member->attrs.count("override"))throw Fault("SEM-140",2,member->at,"No base method matches @override.");
                bySignature[sig]=member;
            }else throw Fault("SEM-03",2,member->at,"qism contains typed fields and methods.");
        }
        for(auto &pair:bySignature) {
            auto m=pair.second;
            if(m->children.empty()&&!interface&&!n->attrs.count("abstract"))throw Fault("SEM-142",2,n->at,"Implement abstract/interface method '"+m->text+"' or mark the class @abstract.");
            methods.push_back(m);
        }
        for(auto &base:n->bases) {
            auto parent=classes.at(base);bool needs=false;
            for(auto &m:parent->children)if(m->kind=="function"&&m->text=="naon")needs=true;
            if(!needs)continue;
            bool own=false;
            for(auto &m:methods)if(m->text=="naon"&&m->origin==n->text&&!m->children.empty()) {
                own=true;auto &body=m->children[0]->children;
                bool valid=false;if(!body.empty()&&body[0]->kind=="expression") {auto call=body[0]->children[0];if(call->kind=="call") {auto target=call->children[0];if(target->kind=="member"&&target->text=="naon") {auto view=target->children[0];valid=view->kind=="index"&&view->children[0]->text=="paan"&&view->children[1]->text==base;}}}
                if(!valid)throw Fault("SEM-143",2,m->at,"Begin the derived constructor with paan["+base+"].naon(...).");
            }
            if(!own)throw Fault("SEM-143",2,n->at,"A derived qism must explicitly initialize its base constructor.");
        }
        n->children=std::move(fields);n->children.insert(n->children.end(),methods.begin(),methods.end());
        n->attrs.insert("$elaborated");active.erase(n->text);done.insert(n->text);
    };
    for(auto &pair:classes)flatten(pair.second);
    std::set<std::string> markedHierarchy;
    std::function<void(const N&)> hierarchy=[&](const N &n){if(!markedHierarchy.insert(n->text).second)return;n->attrs.insert("$hierarchy");for(auto &base:n->bases)hierarchy(classes.at(base));};
    for(auto &pair:classes)if(!pair.second->bases.empty())hierarchy(pair.second);
}
} // namespace jim
