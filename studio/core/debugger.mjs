// Source-level debugger. The worker remains responsive while the VM is paused.
export class DebugController {
 constructor(send,{entry=true,breakpoints=[]}={}){this.send=send;this.breakpoints=new Set(breakpoints);this.mode=entry?'into':'continue';this.depth=Infinity;this.last='';this.resume=null;this.paused=false;this.entry=entry;}
 command(data){if(data.action==='breakpoints'){this.breakpoints=new Set(data.breakpoints||[]);return;}if(!this.resume)return;this.mode=['into','over','out'].includes(data.action)?data.action:'continue';const resume=this.resume;this.resume=null;this.paused=false;this.send('debug-resumed');resume();}
 async instruction(at,frames){const key=at.file+':'+at.line+':'+frames.length+':'+frames.at(-1)?.function;if(key===this.last)return;this.last=key;
  const stop=this.entry||this.breakpoints.has(at.file+':'+at.line)||this.mode==='into'||this.mode==='over'&&frames.length<=this.depth||this.mode==='out'&&frames.length<this.depth;
  if(!stop)return;this.entry=false;this.depth=frames.length;this.paused=true;
  const waiting=new Promise(resolve=>this.resume=resolve);this.send('debug-paused',{at,frames});await waiting;
 }
}
