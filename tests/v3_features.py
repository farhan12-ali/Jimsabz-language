"""Acceptance tests execute source and independently reload compiled JBC3."""
import pathlib, subprocess, tempfile, json, sys
root=pathlib.Path(__file__).resolve().parents[1]
exe=root/'build/jimsabz'
case_data=json.loads((root/'tests/v3-cases.json').read_text())
cases=case_data['positive']
negative=case_data['negative']
results=[]
with tempfile.TemporaryDirectory(prefix='jim-v3-') as td:
 work=pathlib.Path(td);(work/'jimsabz.json').write_text('{}')
 for name,code,expected in cases:
  source=work/'case.jimsabz';source.write_text(code)
  for mode in ['source','bytecode']:
   target=source
   if mode=='bytecode':
    target=work/'case.jbc';r=subprocess.run([str(exe),'build',str(source),'-o',str(target)],capture_output=True,text=True)
    if r.returncode:
     results.append((name,mode,False,r.stderr));continue
   r=subprocess.run([str(exe),'run',str(target)],capture_output=True,text=True,timeout=15)
   results.append((name,mode,r.returncode==0 and r.stdout==expected,r.stdout+r.stderr))
 for name,code,error in negative:
  source=work/'case.jimsabz';source.write_text(code)
  r=subprocess.run([str(exe),'check',str(source)],capture_output=True,text=True,timeout=10)
  results.append((name,'negative',r.returncode!=0 and error in r.stderr,r.stderr))
for name,mode,ok,detail in results:
 print(('PASS' if ok else 'FAIL'),name,mode,'' if ok else repr(detail))
(root/'build/v3-results.json').write_text(json.dumps(results,indent=2))
sys.exit(any(not r[2] for r in results))
