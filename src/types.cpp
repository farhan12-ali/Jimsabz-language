#include "jimsabz.hpp"
#include <cctype>

namespace jim {
namespace {
std::vector<std::string> splitTypes(const std::string &s) {
    std::vector<std::string> result;
    int angle=0, round=0; size_t start=0;
    for(size_t i=0;i<=s.size();++i) {
        char c=i<s.size()?s[i]:',';
        if(c==',' && !angle && !round) {
            auto part=s.substr(start,i-start);
            if(!part.empty())result.push_back(part);
            start=i+1;
        } else if(c=='<')++angle;
        else if(c=='>' && angle)--angle;
        else if(c=='(')++round;
        else if(c==')')--round;
    }
    return result;
}
size_t closeFunction(const std::string &s) {
    int depth=0;
    for(size_t i=3;i<s.size();++i) {
        if(s[i]=='(')++depth;
        if(s[i]==')' && !--depth)return i;
    }
    return std::string::npos;
}
}
bool nullableType(const std::string &s) { return !s.empty() && s.back()=='?' && !callableType(s); }
bool callableType(const std::string &s) { return s.rfind("kam(",0)==0; }
std::string typeHead(const std::string &s) {
    if(s.rfind("qatar ",0)==0)return "qatar";
    if(callableType(s))return "kam";
    auto end=s.find('<');auto out=s.substr(0,end);
    if(!out.empty() && out.back()=='?')out.pop_back();
    return out;
}
std::vector<std::string> typeArguments(const std::string &s) {
    if(s.rfind("qatar ",0)==0)return {s.substr(6)};
    auto begin=s.find('<'),end=s.rfind('>');
    if(begin==std::string::npos||end==std::string::npos||end<begin)return {};
    return splitTypes(s.substr(begin+1,end-begin-1));
}
std::vector<std::string> functionParameters(const std::string &s) {
    auto end=closeFunction(s);
    return end==std::string::npos?std::vector<std::string>{}:splitTypes(s.substr(4,end-4));
}
std::string functionResult(const std::string &s) {
    auto end=closeFunction(s);
    return end==std::string::npos||s.substr(end+1,2)!="->"?"":s.substr(end+3);
}
std::string functionType(const N &n) {
    std::string out="kam(";
    for(size_t i=0;i<n->params.size();++i) {
        if(i)out+=",";
        out+=n->variadic&&i+1==n->params.size()?"qatar "+n->params[i].first:n->params[i].first;
    }
    auto result=n->returnType.empty()?n->type:n->returnType;
    return out+")->"+(n->attrs.count("async")?"Task<"+result+">":result);
}
std::string substituteType(const std::string &type,const std::map<std::string,std::string> &binding) {
    std::string out;
    for(size_t i=0;i<type.size();) {
        if(std::isalpha(static_cast<unsigned char>(type[i]))||type[i]=='_'||static_cast<unsigned char>(type[i])>=128) {
            size_t end=i+1;
            while(end<type.size()&&(std::isalnum(static_cast<unsigned char>(type[end]))||type[end]=='_'||static_cast<unsigned char>(type[end])>=128))++end;
            auto word=type.substr(i,end-i);auto it=binding.find(word);
            out+=it==binding.end()?word:it->second;i=end;
        }else out+=type[i++];
    }
    return out;
}
N cloneNode(const N &n,const std::map<std::string,std::string> &binding) {
    if(!n)return {};
    auto out=std::make_shared<Node>(*n);
    out->type=substituteType(n->type,binding);
    if(n->kind=="class"||n->kind=="new"||n->kind=="name")out->text=substituteType(n->text,binding);
    out->params.clear();for(auto &p:n->params)out->params.push_back({substituteType(p.first,binding),p.second});
    out->children.clear();for(auto &c:n->children)out->children.push_back(cloneNode(c,binding));
    out->defaults.clear();for(auto &c:n->defaults)out->defaults.push_back(cloneNode(c,binding));
    for(auto &base:out->bases)base=substituteType(base,binding);
    for(auto &type:out->typeArgs)type=substituteType(type,binding);
    out->id.clear();
    return out;
}
} // namespace jim
