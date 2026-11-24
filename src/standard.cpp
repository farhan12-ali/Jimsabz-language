#include "jimsabz.hpp"
#include <fstream>
#include <thread>
#include <cstring>
#include <ctime>

namespace jim {
bool standardModule(const std::string &s) {
    static const std::set<std::string> modules={"Core","Math","String","Collections","FileSystem","IO","DateTime","Random","Logging","Testing","Async"};
    return modules.count(s);
}
std::string standardResult(const std::string &name,const std::vector<std::string> &types,const Span &at) {
    auto fail=[&](std::string s)->std::string{throw Fault("SEM-LIB",2,at,name+": "+s);};
    auto exact=[&](std::initializer_list<std::string> expected){
        if(types.size()!=expected.size())fail("wrong argument count.");size_t i=0;
        for(auto &t:expected)if(!compatible(t,types[i++]))fail("expected "+t+".");
    };
    if(name=="Core.typeName"||name=="Core.text"){if(types.size()!=1)fail("takes one value.");return "lafz";}
    if(name=="Core.unwrap"){if(types.size()!=1||!nullableType(types[0]))return fail("requires a nullable value.");return types[0].substr(0,types[0].size()-1);}
    if(name=="Math.sqrt"||name=="Math.sin"||name=="Math.cos"||name=="Math.abs"){exact({"dec"});return "dec";}
    if(name=="Math.min"||name=="Math.max"||name=="Math.pow"){exact({"dec","dec"});return "dec";}
    if(name=="Math.floor"||name=="Math.round"){exact({"dec"});return "adad";}
    if(name=="Math.clamp"){exact({"dec","dec","dec"});return "dec";}
    if(name=="String.length"){exact({"lafz"});return "adad";}
    if(name=="String.contains"||name=="String.startsWith"||name=="String.endsWith"){exact({"lafz","lafz"});return "isharo";}
    if(name=="String.trim"||name=="String.upperASCII"||name=="String.lowerASCII"){exact({"lafz"});return "lafz";}
    if(name=="String.split"){exact({"lafz","lafz"});return "qatar lafz";}
    if(name=="String.join"){exact({"qatar lafz","lafz"});return "lafz";}
    if(name=="FileSystem.readText"){exact({"lafz"});return "lafz";}
    if(name=="FileSystem.readTextAsync"){exact({"lafz"});return "Task<lafz>";}
    if(name=="FileSystem.writeText"){exact({"lafz","lafz"});return "khali";}
    if(name=="FileSystem.writeTextAsync"){exact({"lafz","lafz"});return "Task<khali>";}
    if(name=="FileSystem.exists"){exact({"lafz"});return "isharo";}
    if(name=="FileSystem.list"){exact({"lafz"});return "qatar lafz";}
    if(name=="IO.readText"){exact({"lafz"});return "lafz";}
    if(name=="IO.write"||name=="IO.writeLine"||name=="Logging.info"||name=="Logging.warn"){exact({"lafz"});return "khali";}
    if(name=="DateTime.now"){exact({});return "dec";}
    if(name=="DateTime.isoUTC"){exact({"dec"});return "lafz";}
    if(name=="Random.seed"){exact({"adad"});return "khali";}
    if(name=="Random.integer"){exact({"adad","adad"});return "adad";}
    if(name=="Random.decimal"){exact({});return "dec";}
    if(name=="Testing.truth"){exact({"isharo","lafz"});return "khali";}
    if(name=="Testing.equal"){if(types.size()!=3||types[2]!="lafz"||types[0]!=types[1])return fail("expected two values of the same type and a message.");return "khali";}
    if(name=="Async.sleep"){exact({"dec"});return "Task<khali>";}
    if(name=="Async.run"||name=="Async.cancel"||name=="Async.isDone") {
        if(types.size()!=1||typeHead(types[0])!="Task")return fail("requires Task<T>.");
        return name=="Async.run"?typeArguments(types[0])[0]:name=="Async.cancel"?"khali":"isharo";
    }
    return fail("unknown library function.");
}
std::string collectionKey(const Value &value) {
    auto v=value.raw();
    if(v.kind==Value::String)return "s:"+v.text;
    if(v.kind==Value::Integer)return "i:"+std::to_string(v.integer);
    if(v.kind==Value::Boolean)return v.integer?"b:1":"b:0";
    if(v.kind==Value::Decimal){if(!std::isfinite(v.number))throw std::runtime_error("Collection keys must be finite.");uint64_t bits=0;double n=v.number==0?0:v.number;std::memcpy(&bits,&n,8);return "d:"+std::to_string(bits);}
    throw std::runtime_error("Collection keys must be adad, dec, lafz or isharo.");
}
namespace {
std::atomic<size_t> hostJobs{0};
std::string readText(const fs::path &path) {
    std::ifstream f(path,std::ios::binary);if(!f)throw std::runtime_error("Cannot read file.");
    if(fs::file_size(path)>16*1024*1024)throw std::runtime_error("Text file exceeds 16 MiB.");
    std::string s{std::istreambuf_iterator<char>(f),{}};if(f.bad())throw std::runtime_error("File read failed.");return s;
}
void writeText(const fs::path &path,const std::string &s) {
    if(s.size()>16*1024*1024)throw std::runtime_error("Text file exceeds 16 MiB.");
    fs::create_directories(path.parent_path());std::ofstream f(path,std::ios::binary);
    if(!f||!f.write(s.data(),std::streamsize(s.size())))throw std::runtime_error("File write failed.");
}
}
Value standardCall(VM &vm,const std::string &name,const std::vector<Value> &input,const Span &at) {
    std::vector<Value> a;std::vector<std::string> types;for(auto &x:input){a.push_back(x.raw());types.push_back(a.back().type());}
    if(name=="$collection.new") {
        if(a.size()!=1)throw std::runtime_error("Invalid collection constructor.");auto type=a[0].str();auto ts=typeArguments(type);
        bool set=typeHead(type)=="Set";
        if(ts.size()!=(set?1u:2u))throw std::runtime_error("Invalid collection type.");
        Value v;v.kind=set?Value::SetValue:Value::Dictionary;v.mapping=std::make_shared<Mapping>();v.mapping->unique=set;v.mapping->keyType=ts[0];v.mapping->valueType=set?"khali":ts[1];vm.heapMappings.push_back(v.mapping);return v;
    }
    if(name.rfind("$iteration.",0)==0) {
        if(a.empty())throw std::runtime_error("Missing iterator.");auto v=a[0];
        uint64_t version=v.kind==Value::List?v.array->version:v.mapping->version;
        if(name=="$iteration.version")return Value::i(int64_t(version));
        if(name=="$iteration.check"){if(a.size()!=2||a[1].integer!=int64_t(version))throw std::runtime_error("Collection modified during iteration.");return {};}
        size_t i=size_t(a.at(1).integer);if(v.kind==Value::List){if(i>=v.array->values.size())throw std::runtime_error("Iterator out of bounds.");return v.array->values[i]->value;}
        if(i>=v.mapping->entries.size())throw std::runtime_error("Iterator out of bounds.");return v.mapping->entries[i].first;
    }
    // Core's type-erased introspection does not weaken static variable types.
    if(name=="Core.typeName")return Value::s(a.at(0).type());
    if(name=="Core.text")return Value::s(a.at(0).str());
    if(name=="Core.unwrap"){if(a.at(0).kind==Value::Null)throw Fault("RUN-NULL",5,at,"Cannot unwrap khali.");return a[0];}
    if(name=="Async.run")return vm.awaitTask(a.at(0),at);
    // A nullable has its concrete type at runtime; Core.unwrap is checked above.
    standardResult(name,types,at);
    auto s=[&](size_t i)->const std::string&{return a.at(i).text;};
    auto num=[&](size_t i){return a.at(i).numeric();};
    if(name=="Async.sleep") {
        double seconds=num(0);if(!std::isfinite(seconds)||seconds<0||seconds>86400)throw std::runtime_error("Sleep must be from 0 to 86400 seconds.");
        auto t=std::make_shared<Task>();t->kind=Task::TimerTask;t->deadline=vm.taskClock()+seconds;return vm.makeTask(t);
    }
    if(name=="Async.cancel"){auto t=a[0].task;if(t->state==Task::Pending){t->state=Task::Cancelled;t->failure=std::make_shared<Fault>("RUN-TASK-CANCEL",5,at,"Task cancelled.");t->frame.reset();}return {};}
    if(name=="Async.isDone")return Value::b(a[0].task->state!=Task::Pending);
    if(name.rfind("Math.",0)==0) {
        auto f=name.substr(5);if(f=="pow")return Value::d(std::pow(num(0),num(1)));
        if(f=="clamp"){if(num(1)>num(2))throw std::runtime_error("Invalid clamp bounds.");return Value::d(std::max(num(1),std::min(num(0),num(2))));}
        return vm.builtin(f,a,at);
    }
    if(name=="String.length") {int64_t count=0;for(unsigned char c:s(0))if((c&192)!=128)++count;return Value::i(count);}
    if(name=="String.contains")return Value::b(s(0).find(s(1))!=std::string::npos);
    if(name=="String.startsWith")return Value::b(s(0).rfind(s(1),0)==0);
    if(name=="String.endsWith")return Value::b(s(0).size()>=s(1).size()&&s(0).compare(s(0).size()-s(1).size(),s(1).size(),s(1))==0);
    if(name=="String.trim"){auto first=s(0).find_first_not_of(" \t\r\n");return Value::s(first==std::string::npos?"":s(0).substr(first,s(0).find_last_not_of(" \t\r\n")-first+1));}
    if(name=="String.upperASCII"||name=="String.lowerASCII"){auto out=s(0);for(auto &c:out)if(name=="String.upperASCII"&&c>='a'&&c<='z')c-=32;else if(name=="String.lowerASCII"&&c>='A'&&c<='Z')c+=32;return Value::s(out);}
    if(name=="String.split") {
        if(s(1).empty())throw std::runtime_error("Split delimiter cannot be empty.");std::vector<Value> out;size_t p=0,next;
        do{next=s(0).find(s(1),p);out.push_back(Value::s(s(0).substr(p,next==std::string::npos?next:next-p)));p=next==std::string::npos?next:next+s(1).size();if(out.size()>1000000)throw std::runtime_error("Split exceeds collection limit.");}while(next!=std::string::npos);
        return Value::list(out,"lafz");
    }
    if(name=="String.join"){std::string out;bool first=true;for(auto &c:a[0].array->values){if(!first)out+=s(1);first=false;out+=c->value.str();if(out.size()>16*1024*1024)throw std::runtime_error("Joined text too large.");}return Value::s(out);}
    if(name.rfind("FileSystem.",0)==0) {
        bool async=name=="FileSystem.readTextAsync"||name=="FileSystem.writeTextAsync";
        auto path=vm.safePath(s(0),at,true);
        if(async) {
            if(hostJobs.fetch_add(1)>=32){--hostJobs;throw std::runtime_error("Too many asynchronous file operations.");}
            bool read=name=="FileSystem.readTextAsync";auto text=read?"":s(1);
            std::packaged_task<Value()> job([path,text,read](){struct Finish{~Finish(){--hostJobs;}} finish;if(read)return Value::s(readText(path));writeText(path,text);return Value{};});
            auto t=std::make_shared<Task>();t->kind=Task::HostTask;t->resultType=read?"lafz":"khali";t->future=job.get_future();
            try{auto result=vm.makeTask(t);std::thread(std::move(job)).detach();return result;}catch(...){--hostJobs;t->state=Task::Rejected;throw;}
        }
        if(vm.world.active)throw std::runtime_error("Use asynchronous file operations while a game is running.");
        if(name=="FileSystem.readText")return Value::s(readText(path));
        if(name=="FileSystem.writeText"){writeText(path,s(1));return {};}
        if(name=="FileSystem.exists")return Value::b(fs::exists(path));
        if(name=="FileSystem.list"){std::vector<std::string> names;for(auto &entry:fs::directory_iterator(path)){if(names.size()>=1000000)throw std::runtime_error("Directory too large.");names.push_back(entry.path().filename().u8string());}std::sort(names.begin(),names.end());std::vector<Value> out;for(auto &n:names)out.push_back(Value::s(n));return Value::list(out,"lafz");}
    }
    if(name=="IO.readText"){if(vm.world.active)throw std::runtime_error("Console input is unavailable on the game rendering thread.");if(vm.io.print)vm.io.print(s(0));if(!vm.io.read)throw std::runtime_error("No input stream.");return Value::s(vm.io.read());}
    if(name=="IO.write"||name=="IO.writeLine"||name=="Logging.info"||name=="Logging.warn"){
        auto text=s(0)+(name=="IO.write"?"":"\n");if(name=="Logging.warn"&&vm.io.warning)vm.io.warning(text);else if(vm.io.print)vm.io.print(text);return {};
    }
    if(name=="DateTime.now")return Value::d(std::chrono::duration<double>(std::chrono::system_clock::now().time_since_epoch()).count());
    if(name=="DateTime.isoUTC"){double n=num(0);if(!std::isfinite(n)||n<0||n>253402300799.0)throw std::runtime_error("Timestamp out of range.");auto t=std::time_t(n);std::tm tm{};
#ifdef _WIN32
        if(gmtime_s(&tm,&t))throw std::runtime_error("Invalid timestamp.");
#else
        if(!gmtime_r(&t,&tm))throw std::runtime_error("Invalid timestamp.");
#endif
        std::ostringstream out;out<<std::put_time(&tm,"%Y-%m-%dT%H:%M:%SZ");return Value::s(out.str());}
    if(name=="Random.seed"){vm.random.seed(uint32_t(a[0].integer));return {};}
    if(name=="Random.integer"){auto lo=a[0].integer,hi=a[1].integer;if(lo>hi)throw std::runtime_error("Invalid random bounds.");return Value::i(std::uniform_int_distribution<int64_t>(lo,hi)(vm.random));}
    if(name=="Random.decimal")return Value::d(std::generate_canonical<double,53>(vm.random));
    if(name=="Testing.truth"){if(!a[0].truth())throw Fault("RUN-TEST",5,at,s(1));return {};}
    if(name=="Testing.equal"){auto eq=vm.builtin("$equal",{a[0],a[1]},at);if(!eq.truth())throw Fault("RUN-TEST",5,at,s(2));return {};}
    throw std::runtime_error("Unimplemented library operation: "+name);
}
}
