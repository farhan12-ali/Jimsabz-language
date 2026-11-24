#include "jimsabz.hpp"

namespace jim {
// Tracing breaks cycles in the existing shared ownership heap. Only VM roots keep
// language values alive; native embedders must pin retained values in hostRoots.
void VM::collect(bool shutdown) {
    std::set<const Env*> envs;
    std::set<const Cell*> cells;
    std::set<const Array*> arrays;
    std::set<const Object*> objects;
    std::set<const Mapping*> maps;
    std::set<const Callable*> functions;
    std::set<const Task*> seenTasks;
    std::vector<Value> values;
    std::vector<std::shared_ptr<Env>> scopes;
    std::vector<std::shared_ptr<Task>> work;
    auto frame=[&](const FrameState &f){scopes.push_back(f.env);values.insert(values.end(),f.stack.begin(),f.stack.end());values.insert(values.end(),f.transient.begin(),f.transient.end());for(auto &t:f.traps)scopes.push_back(t.env);if(f.waiting)work.push_back(f.waiting);};
    if(!shutdown) {
        scopes.push_back(globals);values=hostRoots;
        values.push_back(world.camera);values.push_back(world.light);
        for(auto &a:world.actors)values.push_back(a.data);
        for(auto &h:world.handlers)values.insert(values.end(),h.args.begin(),h.args.end());
        for(auto *f:activeFrames)frame(*f);
        work.insert(work.end(),tasks.begin(),tasks.end());
    }
    while(!values.empty()||!scopes.empty()||!work.empty()) {
        if(!scopes.empty()) {
            auto e=scopes.back();scopes.pop_back();if(!e||!envs.insert(e.get()).second)continue;
            scopes.push_back(e->parent);for(auto &p:e->values)if(cells.insert(p.second.get()).second)values.push_back(p.second->value);
        } else if(!work.empty()) {
            auto t=work.back();work.pop_back();if(!t||!seenTasks.insert(t.get()).second)continue;
            values.push_back(t->result);if(t->frame)frame(*t->frame);if(t->waiting)work.push_back(t->waiting);
        } else {
            auto v=values.back();values.pop_back();
            if((v.kind==Value::Ref||v.kind==Value::Dynamic)&&v.ref&&cells.insert(v.ref.get()).second)values.push_back(v.ref->value);
            if(v.kind==Value::List&&arrays.insert(v.array.get()).second)for(auto &c:v.array->values)if(cells.insert(c.get()).second)values.push_back(c->value);
            if(v.kind==Value::Record&&objects.insert(v.object.get()).second)for(auto &c:v.object->fields)if(cells.insert(c.second.get()).second)values.push_back(c.second->value);
            if((v.kind==Value::Dictionary||v.kind==Value::SetValue)&&maps.insert(v.mapping.get()).second)for(auto &p:v.mapping->entries){values.push_back(p.first);values.push_back(p.second);}
            if(v.kind==Value::FunctionValue&&functions.insert(v.callable.get()).second){scopes.push_back(v.callable->environment);values.push_back(v.callable->receiver);}
            if(v.kind==Value::TaskValue)work.push_back(v.task);
        }
    }
    auto sweep=[](auto &registry,const auto &marked,auto clear) {
        std::set<const void*> retained;
        registry.erase(std::remove_if(registry.begin(),registry.end(),[&](const auto &weak){auto p=weak.lock();if(!p)return true;if(!retained.insert(p.get()).second)return true;if(!marked.count(p.get()))clear(*p);return false;}),registry.end());
    };
    sweep(heapEnvs,envs,[](Env &e){e.values.clear();e.parent.reset();});
    sweep(heapObjects,objects,[](Object &o){o.fields.clear();});
    sweep(heapArrays,arrays,[](Array &a){a.values.clear();});
    sweep(heapMappings,maps,[](Mapping &m){m.entries.clear();m.index.clear();});
}
VM::~VM() {
    for(auto &t:tasks){t->state=Task::Cancelled;t->frame.reset();}
    tasks.clear();hostRoots.clear();world=World{};globals.reset();
    try{collect(true);}catch(...){}
}
}
