#include "jimsabz.hpp"
#include <iostream>
#include <fstream>
using namespace jim;
int main(){
    std::string code=R"(kam make(adad n)->kam()->adad {
 kam captured()->adad {
 n+=1
 wapas n
 }
 wapas captured
}
kam()->adad saved=make(40)
qism Link {
 qatar Link children=[]
}
adad i=0
wori(i<3000) {
 Link link=naon Link()
 link.children.joryo(link)
 kam()->adad discarded=make(i)
 i+=1
}
budhai saved()
budhai saved()
)";
    auto b=compile(code,fs::temp_directory_path()/"gc.jimsabz");if(!b.ok){for(auto&e:b.errors)std::cerr<<e.describe()<<"\n";return 1;}
    std::string output;std::vector<std::weak_ptr<Env>> scopes;std::vector<std::weak_ptr<Object>> objects;
    {RuntimeIO io;io.print=[&](const auto&s){output+=s;};VM vm(b.program,io);vm.run();vm.collect();scopes=vm.heapEnvs;objects=vm.heapObjects;}
    if(output!="41\n42\n")return 2;
    for(auto&w:scopes)if(!w.expired()){std::cerr<<"Environment cycle survived VM destruction\n";return 3;}
    for(auto&w:objects)if(!w.expired()){std::cerr<<"Object cycle survived VM destruction\n";return 4;}
    auto g=compile(R"(kharna gui
kharna Async
adad ready=0
@async kam updateLater() {
 @await Async.sleep(0.05)
 ready=7
}
khed "Async tick" {
 khirki 160,120
}
Task<khali> work=updateLater()
)",fs::temp_directory_path()/"tick.jimsabz");if(!g.ok){for(auto&e:g.errors)std::cerr<<e.describe()<<"\n";return 5;}
    VM vm(g.program);vm.run();auto start=std::chrono::steady_clock::now();for(int i=0;i<20;i++){vm.instructions=0;vm.tick(0.01);}
    if(vm.globals->find("ready")->value.integer!=7)return 6;
    if(std::chrono::duration<double>(std::chrono::steady_clock::now()-start).count()>0.5)return 7;
    std::cout<<"PASS closure lifetime, cycle collection, task ticks without wall-clock blocking\n";
}
