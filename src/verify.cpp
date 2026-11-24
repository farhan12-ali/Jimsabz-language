#include "jimsabz.hpp"
#include <deque>

namespace jim {
void verifyBytecode(const Program &p) {
    auto fail=[](const Ins &i,const std::string &s){throw Fault("RUN-JBC",5,i.at,"Invalid bytecode: "+s);};
    auto code=[&](const std::vector<Ins> &v,bool async) {
        // Verify control-flow stack heights before executing untrusted bytecode.
        std::vector<int> height(v.size()+1,-1);std::deque<size_t> work;
        height[0]=0;work.push_back(0);
        auto edge=[&](size_t pc,int h,const Ins &i){if(pc>v.size())fail(i,"jump out of range.");if(height[pc]!=-1&&height[pc]!=h)fail(i,"inconsistent operand stack at branch.");if(height[pc]==-1){height[pc]=h;work.push_back(pc);}};
        // Validate even unreachable instructions; stack analysis follows reachable paths.
        for(auto &i:v) {
            if(int(i.op)>int(p.format>=3?Op::Await:Op::Read))fail(i,"unknown opcode.");
            if(i.op==Op::Await&&!async)fail(i,"await outside an async function.");
            if(i.a<0&&(i.op==Op::Call||i.op==Op::CallNamed||i.op==Op::Invoke||i.op==Op::Method||i.op==Op::New||i.op==Op::Array||i.op==Op::Vector||i.op==Op::Entity||i.op==Op::Bind||i.op==Op::Unwind))fail(i,"negative operand count.");
            if((i.op==Op::Jump||i.op==Op::JumpFalse||i.op==Op::JumpTrue||i.op==Op::Try)&&(i.a<0||size_t(i.a)>v.size()))fail(i,"jump out of range.");
            if(i.op==Op::Closure&&(i.a<0||i.a>2))fail(i,"invalid closure mode.");
            if(i.op==Op::Push&&(i.a<0||i.a>4))fail(i,"invalid literal tag.");
        }
        while(!work.empty()) {
            size_t pc=work.front();work.pop_front();if(pc==v.size())continue;
            auto &i=v[pc];int h=height[pc],need=0,delta=0;
            switch(i.op) {
            case Op::Push:case Op::Load:delta=1;break;
            case Op::Closure:need=i.a==2?1:0;delta=1-need;break;
            case Op::Declare:case Op::Pop:case Op::Print:case Op::Throw:need=1;delta=-1;break;
            case Op::Dup:need=1;delta=1;break;
            case Op::Member:case Op::Read:case Op::Unary:case Op::Await:need=1;break;
            case Op::Index:case Op::Binary:case Op::Store:need=2;delta=-1;break;
            case Op::Array:case Op::Vector:case Op::Call:case Op::CallNamed:case Op::New:need=i.a;delta=1-need;break;
            case Op::Method:case Op::Invoke:need=i.a+1;delta=1-need;break;
            case Op::Entity:need=i.a*2;delta=-need;break;
            case Op::Bind:need=i.a;delta=-need;break;
            case Op::JumpFalse:case Op::JumpTrue:need=1;delta=-1;break;
            default:break;
            }
            if(h<need)fail(i,"operand stack underflow.");
            if(i.op==Op::Try)edge(size_t(i.a),h+1,i);
            if(i.op==Op::Return||i.op==Op::Halt||i.op==Op::Throw)continue;
            if(i.op==Op::Jump){edge(size_t(i.a),h,i);continue;}
            if(i.op==Op::JumpTrue||i.op==Op::JumpFalse)edge(size_t(i.a),h+delta,i);
            edge(pc+1,h+delta,i);
        }
    };
    code(p.code,false);
    for(auto &kv:p.functions) {
        auto &f=kv.second;
        if(f.variadic&&f.params.empty())throw std::runtime_error("Invalid variadic function metadata.");
        if(!f.defaults.empty()&&f.defaults.size()!=f.params.size())throw std::runtime_error("Invalid function defaults metadata.");
        std::set<std::string> names;for(auto &a:f.params)if(!names.insert(a.second).second)throw std::runtime_error("Duplicate bytecode parameter.");
        code(f.code,f.asynchronous);for(auto &d:f.defaults)if(!d.empty())code(d,false);
    }
    for(auto &c:p.parents)for(auto &base:c.second)if(!p.classes.count(base)||base==c.first)throw std::runtime_error("Invalid base type metadata.");
}
}
