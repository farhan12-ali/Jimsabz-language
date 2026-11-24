// Learning replay of real compiler artifacts. No simulated compiler results.
export const PHASES = [
  {name:'Lexical analysis',short:'Lexer',input:'Source text',output:'Tokens',help:'The lexer groups your characters into names, keywords, numbers and symbols.'},
  {name:'Syntax analysis',short:'Parser',input:'Tokens',output:'Parsed structure',help:'The parser checks how tokens fit together: expressions, statements and matching brackets.'},
  {name:'AST generation',short:'AST',input:'Parsed structure',output:'Abstract syntax tree',help:'The compiler expands imported source and organizes the program into a tree of meaningful nodes.'},
  {name:'Semantic analysis',short:'Semantics',input:'Syntax tree',output:'Checked names & types',help:'The analyzer resolves names and checks types, declarations and required libraries.'},
  {name:'Code generation',short:'Code generation',input:'Checked tree',output:'Bytecode instructions',help:'The compiler translates the checked tree into instructions for the Jimsabz virtual machine.'},
  {name:'Asset validation',short:'Assets',input:'Program & file references',output:'Validated assets',help:'Image, model and sound references are checked against files in your folder.'},
  {name:'Run program',short:'Runtime',input:'Compiled instructions',output:'Program behavior',help:'The virtual machine executes the instructions. Input and output appear in the separate Run window.'},
];
export const PREVIEW_LIMIT=320;
const clip = (text,limit=28000) => String(text).slice(0,limit);
export function treeRows(root,limit=PREVIEW_LIMIT) {
  const out=[],stack=[{node:root,depth:0}];let count=0;
  while(stack.length){const {node,depth}=stack.pop();if(!node)continue;count++;if(out.length<limit)out.push({kind:node.kind,text:node.text||'',type:node.type||'',depth,at:node.at});const children=node.children||[];for(let i=children.length-1;i>=0;i--)stack.push({node:children[i],depth:depth+1});}
  return {rows:out,count};
}
// Immutable parser/AST snapshots for the second-window tree inspectors.
// The bounded flat structure keeps large projects inspectable without DOM blowup.
export function treeSnapshot(root, limit = 6000) {
  const nodes = [], stack = [{ node: root, parent: null, depth: 0 }]; let total = 0;
  while (stack.length) {
    const {node, parent, depth} = stack.pop(); if (!node) continue;
    const id = total++;
    if (nodes.length < limit) nodes.push({ id, parent, depth, kind: node.kind, text: node.text || '', type: node.type || '', at: {...node.at},
      params: (node.params || []).slice(0,128).map(p => [...p]), parameterCount: node.params?.length || 0 });
    for (let i = (node.children || []).length - 1; i >= 0; i--) stack.push({ node: node.children[i], parent: id, depth: depth + 1 });
  }
  return { nodes, total, complete: total <= limit, limit };
}
export function semanticSymbolCount(analysis) {
  return Object.keys(analysis.globals).length + Object.keys(analysis.functions || {}).length +
    Object.values(analysis.classes || {}).reduce((total, cls) => total + 1 + cls.fields.length + cls.methods.length, 0);
}
export function captureEvidence(index,value,{astText,disassemble}) {
  if(index===0)return {kind:'tokens',count:value.filter(t=>t.kind!=='end').length,rows:value.filter(t=>t.kind!=='end').slice(0,PREVIEW_LIMIT).map(t=>({kind:t.kind,text:t.text,at:{...t.at}}))};
  if(index===1||index===2)return {kind:'tree',...treeRows(value),tree:treeSnapshot(value),body:clip(astText(value))};
  if (index === 3) {
    const rows = [], functions = Object.keys(value.functions || {});
    const add = row => { if (rows.length < PREVIEW_LIMIT) rows.push(row); };
    const signature = fn => `(${fn.params.map(([type, name]) => `${type} ${name}`).join(', ')}) -> ${fn.type}`;
    for (const [name, s] of Object.entries(value.globals))
      add({ name, type: s.type, fixed: !!s.fixed, kind: s.fixed ? 'Constant' : 'Variable', at: s.at });
    for (const [name, fn] of Object.entries(value.functions || {}))
      add({ name, type: signature(fn), kind: 'Function', at: fn.at });
    for (const [name, cls] of Object.entries(value.classes || {})) {
      add({ name, type: 'qism', kind: 'Class' });
      for (const field of cls.fields)
        add({ name: `${name}.${field.text}`, type: field.type, kind: 'Field', at: field.at });
      for (const method of cls.methods) {
        const qualified = `${name}.${method.text}`;
        functions.push(qualified);
        add({ name: qualified, type: signature(method), kind: 'Method', at: method.at });
      }
    }
    return { kind: 'symbols', count: semanticSymbolCount(value), rows, libraries: [...value.libraries], functions };
  }
  if(index===4)return {kind:'instructions',count:value.code.length+Object.values(value.functions).reduce((n,f)=>n+f.code.length,0),body:clip(disassemble(value)),mainCount:value.code.length,functions:Object.keys(value.functions)};
  if(index===5)return {kind:'assets',count:value.assets.size,rows:[...value.assets],warnings:[...value.warnings]};
  return null;
}
export function journeyModel(result,source,entry,stages=result?.stages) {
  const diagnostic=result?.diagnostics?.[0]||null;
  const phaseStates=PHASES.map((phase,i)=>({...phase,state:stages?.[i]?.state||'pending',ms:stages?.[i]?.ms||0,detail:stages?.[i]?.detail||'',index:i,evidence:result?.trace?.[i]||null}));
  if(diagnostic){phaseStates[diagnostic.stage].state='failed';for(let i=diagnostic.stage+1;i<7;i++)phaseStates[i].state='blocked';}
  return {entry,source:String(source||''),phases:phaseStates,diagnostic,ok:!!result?.ok,complete:!!result,stop:diagnostic?.stage??6,elapsed:phaseStates.reduce((sum,p)=>sum+(p.ms||0),0)};
}
export function canVisit(model,index){return !!model?.complete&&index>=0&&index<=model.stop;}
export class JourneyPlayback {
  constructor(onChange=()=>{}){this.onChange=onChange;this.position=0;this.end=6;this.playing=false;this.speed=1;this.last=0;}
  reset(end=6){this.end=end;this.position=0;this.playing=false;this.last=0;this.emit();}
  seek(index){this.position=Math.max(0,Math.min(this.end,index));this.playing=false;this.last=0;this.emit();}
  play(){if(this.position>=this.end)this.position=0;this.playing=this.end>0;this.last=0;this.emit();}
  pause(){this.playing=false;this.last=0;this.emit();}
  tick(now){if(!this.playing)return;if(!this.last){this.last=now;return;}const delta=Math.min(100,Math.max(0,now-this.last));this.last=now;this.position=Math.min(this.end,this.position+delta/1700*this.speed);if(this.position>=this.end)this.playing=false;this.emit();}
  emit(){this.onChange({position:this.position,index:Math.floor(this.position+0.00001),playing:this.playing});}
}
