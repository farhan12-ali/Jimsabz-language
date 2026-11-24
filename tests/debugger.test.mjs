import assert from'node:assert/strict';
import{compile}from'../studio/core/compiler.mjs';import{VM}from'../studio/core/vm.mjs';import{DebugController}from'../studio/core/debugger.mjs';
const source=`kam add(adad x)->adad {
 adad y=x+1
 wapas y
}
adad total=add(4)
budhai total
`;
const r=await compile([{path:'main.jimsabz',text:source}],'main.jimsabz');assert.ok(r.ok,JSON.stringify(r.diagnostics));
for(const mode of ['into','over','out','breakpoint']){let stops=[],out='',controller;controller=new DebugController((type,data)=>{if(type!=='debug-paused')return;stops.push(data);queueMicrotask(()=>{if(mode==='breakpoint'){controller.command({action:'breakpoints',breakpoints:['main.jimsabz:6']});controller.command({action:'continue'});}else controller.command({action:stops.length===1?'into':stops.length===2?mode:'continue'});});});
 let vm=new VM(r.program,{print:s=>out+=s,debug:(at,frames)=>controller.instruction(at,frames)});await vm.run();assert.equal(out,'5\n');assert.ok(stops.length>=2);if(mode==='breakpoint')assert.equal(stops.at(-1).at.line,6);else if(mode==='into'){assert.ok(stops.some(s=>s.frames.length===2));assert.equal(stops.at(-1).frames.at(-1).locals.x,'4');}else if(mode==='out'){assert.equal(stops.at(-1).frames.length,1);}console.log('PASS debugger',mode,'real VM frames/locals');}
