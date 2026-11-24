export const nullable=t=>t.endsWith('?')&&!t.startsWith('kam(');
export const callable=t=>t.startsWith('kam(');
export function splitTypes(s){let a=0,r=0,start=0,out=[];for(let i=0;i<=s.length;i++){let c=s[i]??',';if(c===','&&!a&&!r){if(i>start)out.push(s.slice(start,i));start=i+1;}else if(c==='<')a++;else if(c==='>'&&a)a--;else if(c==='(')r++;else if(c===')')r--;}return out;}
export function typeHead(t){return t.startsWith('qatar ')?'qatar':callable(t)?'kam':t.split('<')[0].replace(/\?$/,'');}
export function typeArgs(t){if(t.startsWith('qatar '))return[t.slice(6)];let a=t.indexOf('<'),b=t.lastIndexOf('>');return a<0||b<a?[]:splitTypes(t.slice(a+1,b));}
function end(t){let d=0;for(let i=3;i<t.length;i++){if(t[i]==='(')d++;if(t[i]===')'&&!--d)return i;}return -1;}
export function fnParams(t){let e=end(t);return e<0?[]:splitTypes(t.slice(4,e));}
export function fnResult(t){let e=end(t);return e<0?'':t.slice(e+3);}
export const has=(n,a)=>n.attrs?.includes(a);
export function attr(n,a){n.attrs??=[];if(!n.attrs.includes(a))n.attrs.push(a);}
export function fnType(n){let r=n.returnType||n.type;return 'kam('+n.params.map(([t],i)=>n.variadic&&i===n.params.length-1?'qatar '+t:t).join(',')+')->'+(has(n,'async')?'Task<'+r+'>':r);}
export function substitute(t,bindings){return t.replace(/[\p{L}_][\p{L}\p{M}\p{N}_]*/gu,x=>bindings[x]??x);}
export function clone(n,bindings={}){let out={...n,type:substitute(n.type,bindings),fnid:'',params:n.params.map(([t,k])=>[substitute(t,bindings),k]),bases:(n.bases||[]).map(t=>substitute(t,bindings)),attrs:[...(n.attrs||[])],children:n.children.map(x=>clone(x,bindings)),defaults:(n.defaults||[]).map(x=>x?clone(x,bindings):null)};if(['new','class','name'].includes(n.kind))out.text=substitute(n.text,bindings);return out;}
