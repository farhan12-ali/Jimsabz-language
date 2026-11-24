import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { compile } from '../studio/core/compiler.mjs';
import { VM } from '../studio/core/vm.mjs';
import { initialRun, updateRun, RunWindow, RUN_CHANNEL } from '../studio/core/run-window.mjs';
import { FactoryPlayback, compilationReport, sourceDocument } from '../studio/factory/model.mjs';
import { visibleTree } from '../studio/factory/tree.mjs';
import { treeSnapshot } from '../studio/core/compiler-trace.mjs';
import { packagePosition, ENTRANCE, EXECUTION, ROOM_POSITIONS, factoryCamera, project } from '../studio/factory/scene.mjs';
import { build } from '../studio/agent/builders.mjs';
const files = text => [{path:'main.jimsabz',text}], code = 'adad a=10\nadad b=20\nbudhai a+b\n';
const fixture = () => initialRun({ factory:true, file:'main.jimsabz', project:'Factory test', files:files(code), runId:'current', capturedAt:1000, revision:4 });
const result = await compile(files(code),'main.jimsabz',()=>{},{trace:true});

test('captured source and parser evidence preserve actual input and parent relationships', () => {
  const state=fixture(); assert.equal(sourceDocument(state),code);
  assert.equal(state.factory.execution.status,'Not Run');
  const tree=result.trace[1].tree, map=new Map(tree.nodes.map(n=>[n.id,n]));
  assert.equal(tree.total,result.trace[1].count); assert.equal(tree.complete,true);
  assert.ok(tree.nodes.some(n=>n.text==='a')); assert.ok(tree.nodes.some(n=>n.text==='20'));
  for(const node of tree.nodes)if(node.parent!==null)assert.equal(node.depth,map.get(node.parent).depth+1);
});
test('snapshots do not alias mutable parser nodes, locations or parameters', () => {
  const node={kind:'Function',text:'sum',at:{file:'a',line:1,col:1},params:[['adad','x']],children:[{kind:'Name',text:'x',children:[]}]};
  const snap=treeSnapshot(node); node.text='changed';node.at.line=99;node.params[0][0]='lafz';node.children[0].text='changed';
  assert.equal(snap.nodes[0].text,'sum');assert.equal(snap.nodes[0].at.line,1);assert.equal(snap.nodes[0].params[0][0],'adad');assert.equal(snap.nodes[1].text,'x');
});
test('tree capture limits retain true totals; collapse traverses actual children', () => {
  const root={kind:'Root',children:Array.from({length:20},(_,i)=>({kind:'Value',text:String(i),children:[]}))};
  const snapshot=treeSnapshot(root,10);assert.equal(snapshot.total,21);assert.equal(snapshot.nodes.length,10);assert.equal(snapshot.complete,false);
  assert.equal(visibleTree(snapshot,new Set([0])).rows.length,1);assert.equal(visibleTree(snapshot).rows.length,10);
});
test('module expansion changes AST but not the captured parser representation', async () => {
  const r=await compile([{path:'main.jimsabz',text:'kharna "math.jimsabz"\nbudhai twice(3)\n'},{path:'math.jimsabz',text:'kam twice(adad n)->adad { wapas n*2 }\n'}],'main.jimsabz',()=>{},{trace:true});
  assert.ok(r.ok);assert.ok(r.trace[2].tree.nodes.length>r.trace[1].tree.nodes.length);
  assert.ok(r.trace[2].tree.nodes.some(n=>n.at.file==='math.jimsabz'));assert.ok(r.trace[1].tree.nodes.every(n=>n.at.file!=='math.jimsabz'));
});
test('factory compilation has six genuine phases and no premature execution', async () => {
  const s=fixture();updateRun(s,{type:'factory-start',atTime:1001});
  for(const [index,stage]of result.stages.slice(0,6).entries())updateRun(s,{type:'stage',index,stage,atTime:1002+index});
  updateRun(s,{type:'compiled',result,atTime:1010});updateRun(s,{type:'execution-ready',atTime:1011});
  const report=compilationReport(s,500);assert.equal(report.compilation,'Passed');assert.equal(report.execution.status,'Not Run');assert.equal(report.execution.ms,null);
  assert.equal(report.phases.length,6);assert.ok(report.phases.every(p=>p.status==='Passed'));assert.equal(report.artifacts.length,6);
  assert.ok(report.events.some(e=>e.type==='artifact.generated'));assert.ok(!report.events.some(e=>e.type==='execution.started'));
  const v3=await compile(files('kam total(adad a, adad b = a + 2) -> adad {\n wapas a + b\n}\nbudhai total(3)\n'),'main.jimsabz',()=>{},{trace:true});
  assert.ok(v3.ok);assert.equal(v3.program.format,3);updateRun(s,{type:'compiled',result:v3});assert.equal(compilationReport(s).artifacts.find(a=>a.phase==='Code generation').format,'JBC3');
});
for(const [name,source,stage]of [['lexer','budhai "broken',0],['syntax','adad = 10\n',1],['semantic','budhai missing\n',3],['asset','kharna gui\nkhed "G" {\nkirdar Hero {\ntasveer: "missing.png"\n}\n}\n',5]])test(`${name} failure halts its room and reports all later phases unexecuted`,async()=>{
  const r=await compile(files(source),'main.jimsabz',()=>{},{trace:true});assert.equal(r.ok,false);assert.equal(r.diagnostics[0].stage,stage,JSON.stringify(r.diagnostics));
  const s=fixture();updateRun(s,{type:'compiled',result:r});updateRun(s,{type:'fault',diagnostic:r.diagnostics[0]});
  const report=compilationReport(s);assert.equal(report.execution.status,'Not Run');assert.equal(report.phases[stage].status,'Failed');assert.equal(report.phases[stage].ms,null);
  assert.ok(report.phases.slice(stage+1).every(p=>p.status==='Not Executed'));assert.equal(report.output,'');
  if(stage>1)assert.ok(report.artifacts.some(a=>a.phase==='Syntax analysis'));
  const p=new FactoryPlayback();p.update(r.stages,false);p.seek(6);assert.equal(p.position,stage);p.resume();p.tick(0);p.tick(100);assert.equal(p.playing,false);
});
test('playback pauses, waits for real phases, steps backwards and cannot reexecute a finished journey',()=>{
  let executions=0;const p=new FactoryPlayback({onExecute:()=>executions++});p.update(result.stages,true);p.tick(0);p.tick(100);const position=p.position;p.pause();p.tick(200);assert.equal(p.position,position);
  p.seek(3);assert.equal(p.position,3);p.seek(2);assert.equal(p.position,2);p.seek(6);assert.equal(executions,1);p.seek(-1);p.resume();p.seek(6);assert.equal(executions,1);
  p.reset();p.update(result.stages,false);p.seek(6);assert.equal(executions,1);p.update(result.stages,true);assert.equal(executions,2);
  const pending=result.stages.map(s=>({...s,state:'pending'}));p.reset();p.update(pending,false);p.seek(5);assert.equal(p.position,0);assert.equal(executions,2);
});
test('execution timing, warnings, input, debugger, stop and source changes are factual',()=>{
  const s=fixture();updateRun(s,{type:'execution-started',atTime:1100});updateRun(s,{type:'input-request',atTime:1200});assert.equal(s.factory.execution.status,'Waiting for input');updateRun(s,{type:'input-accepted'});
  updateRun(s,{type:'debug-paused',at:{file:'main.jimsabz',line:2},frames:[]});assert.equal(s.factory.execution.status,'Paused');updateRun(s,{type:'debug-resumed'});
  updateRun(s,{type:'warning',text:'Actual warning'});updateRun(s,{type:'source-edited'});assert.equal(s.factory.editorChanged,true);
  updateRun(s,{type:'finished',ms:14.25,atTime:1300});assert.equal(compilationReport(s).execution.ms,14.25);assert.equal(s.factory.execution.status,'Passed');assert.equal(s.factory.warnings[0].message,'Actual warning');
  const stopped=fixture();updateRun(stopped,{type:'stopped'});assert.equal(stopped.factory.execution.status,'Not Run');assert.equal(stopped.factory.execution.ms,null);
});
test('clearing visible console or input echoes cannot rewrite actual report output; buffers are bounded',()=>{
  const s=fixture();updateRun(s,{type:'output',text:'Name: '});updateRun(s,{type:'output',text:'Farhan\n',echo:true});updateRun(s,{type:'output',text:'Hello Farhan\n'});s.output='';
  assert.equal(compilationReport(s).output,'Name: Hello Farhan\n');updateRun(s,{type:'output',text:'x'.repeat(300000)});assert.equal(compilationReport(s).outputMayBeTruncated,true);assert.ok(s.factory.transcript.length<=180000);
});
test('factory execution actions reject stale sessions, run IDs, origins and windows; new-tab fallback preserves bridge',()=>{
  let receive,opened=[],actions=[];const popup={closed:false,focus(){},postMessage(){}};
  const host={crypto:{randomUUID},location:{origin:'https://studio.test'},open(...args){opened.push(args);return popup;},addEventListener(_,fn){receive=fn;},removeEventListener(){},setInterval(){return 1;},clearInterval(){}};
  const rw=new RunWindow(host,{onAction:a=>actions.push(a)});assert.ok(rw.begin({factory:true},false,{asTab:true}));assert.equal(opened[0][1],'_blank');assert.equal(opened[0][2],undefined);
  const data={channel:RUN_CHANNEL,session:rw.session,runId:rw.state.runId,type:'factory-execute'},good={origin:host.location.origin,source:popup,data};
  for(const event of [{...good,origin:'https://evil.test'},{...good,source:{}},{...good,data:{...data,session:'old'}},{...good,data:{...data,runId:'old'}}])receive(event);
  assert.equal(actions.length,0);receive(good);assert.equal(actions.length,1);rw.send({type:'theme',theme:'light'});assert.equal(rw.state.theme,'light');rw.dispose();
});
test('the physical package route visits every room and the execution platform',()=>{
  assert.deepEqual(packagePosition(-1),ENTRANCE);for(let i=0;i<6;i++)assert.deepEqual(packagePosition(i),ROOM_POSITIONS[i]);assert.deepEqual(packagePosition(6),EXECUTION);
  const a=project(ROOM_POSITIONS[0],factoryCamera(1000,550)),b=project(ROOM_POSITIONS[0],factoryCamera(1000,550,{angle:.6}));assert.notEqual(a.x,b.x);
});

function realWorker(t){
  const url=new URL('../studio/core/worker.mjs',import.meta.url).href;
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.postMessage=d=>parentPort.postMessage(d);globalThis.onmessage=null;import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>globalThis.onmessage({data})));`,{eval:true});
  const messages=[],listeners=[];worker.on('message',m=>{messages.push(m);for(const fn of [...listeners])fn(m);});
  const wait=(type,predicate=()=>true)=>{const found=messages.find(m=>m.type===type&&predicate(m));if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Timed out waiting for '+type)),4000);const fn=m=>{if(m.type===type&&predicate(m)){clearTimeout(timer);listeners.splice(listeners.indexOf(fn),1);resolve(m);}};listeners.push(fn);});};
  t.after(()=>worker.terminate());return {worker,messages,wait,run:(text,extra={})=>worker.postMessage({type:'run',runId:'real-run',factory:true,files:files(text),entry:'main.jimsabz',...extra})};
}
test('actual Worker waits for the matching factory handoff, then executes exactly once',async t=>{
  const w=realWorker(t);w.run(code);await w.wait('execution-ready');assert.ok(!w.messages.some(m=>m.type==='output'||m.type==='execution-started'));
  w.worker.postMessage({type:'factory-execute',runId:'stale'});await delay(50);assert.ok(!w.messages.some(m=>m.type==='output'));
  w.worker.postMessage({type:'factory-execute',runId:'real-run'});const finish=await w.wait('finished');assert.equal(w.messages.filter(m=>m.type==='output').map(m=>m.text).join(''),'30\n');assert.ok(finish.ms>=0);assert.ok(w.messages.every(m=>Number.isFinite(m.atTime)));
  w.worker.postMessage({type:'factory-execute',runId:'real-run'});await delay(30);assert.equal(w.messages.filter(m=>m.type==='execution-started').length,1);
});
test('actual Worker never offers execution after a compiler failure',async t=>{
  const w=realWorker(t);w.run('budhai missing\n');const message=await w.wait('compiled');assert.equal(message.result.ok,false);w.worker.postMessage({type:'factory-execute',runId:'real-run'});await delay(30);assert.ok(!w.messages.some(m=>['execution-ready','execution-started','output','finished'].includes(m.type)));
});
test('real input and debugger remain behind the handoff, with actual VM variables',async t=>{
  const w=realWorker(t);w.run('adad n=budh("N: ")\nbudhai n*2\n',{debug:true});await w.wait('execution-ready');w.worker.postMessage({type:'factory-execute',runId:'real-run'});const paused=await w.wait('debug-paused');assert.equal(paused.at.file,'main.jimsabz');assert.ok(paused.frames.length>0);w.worker.postMessage({type:'debug-command',action:'continue'});
  await w.wait('input-request');w.worker.postMessage({type:'input',value:'21'});await w.wait('finished');assert.equal(w.messages.filter(m=>m.type==='output').map(m=>m.text).join(''),'N: 42\n');
});
test('actual game initialization and ticks use the existing renderer data after handoff',async t=>{
  const w=realWorker(t);w.run(build('player2d'));await w.wait('execution-ready');w.worker.postMessage({type:'factory-execute',runId:'real-run'});await w.wait('game-started');const before=w.messages.filter(m=>m.type==='frame').length;w.worker.postMessage({type:'tick',dt:1/60,input:{keys:['RIGHT'],mouse:[0,0]}});await w.wait('frame',m=>w.messages.filter(v=>v.type==='frame').indexOf(m)>=before);assert.ok(w.messages.some(m=>m.type==='frame'&&m.world.actors.length>0));
});
test('existing direct Worker runs continue without the factory gate',async t=>{const w=realWorker(t);w.run(code,{factory:false});await w.wait('finished');assert.equal(w.messages.filter(m=>m.type==='output').map(m=>m.text).join(''),'30\n');assert.ok(!w.messages.some(m=>m.type==='execution-ready'));});
