"""Rebuild Windows console/Studio from one shared set of C++ objects.
Usage: python scripts/build-cross.py --compiler /path/to/x86_64-w64-mingw32-g++
"""
import argparse, concurrent.futures, hashlib, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--compiler',required=True);p.add_argument('--jobs',type=int,default=2);args=p.parse_args()
out=root/'build/windows-objects';out.mkdir(parents=True,exist_ok=True)
flags=['-std=c++17','-O2','-pthread','-DUNICODE','-D_UNICODE','-I'+str(root/'include')]
sources=['gc','types','elaborate','standard','verify','frontend','semantic','compiler','bytecode','vm','graphics','network','platform','studio_win32']
header=(root/'include/jimsabz.hpp').read_bytes()
def build(name):
 source=root/'src'/(name+'.cpp');target=out/(name+'.o');fingerprint=hashlib.sha256(source.read_bytes()+header+str(flags).encode()).hexdigest();stamp=out/(name+'.sha256')
 if target.exists() and stamp.exists() and stamp.read_text()==fingerprint:return
 subprocess.run([args.compiler,*flags,'-c',str(source),'-o',str(target)],check=True,stdout=subprocess.DEVNULL)
 stamp.write_text(fingerprint);print('Built',name,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(args.jobs,4))) as pool:list(pool.map(build,[*sources,'main','studio_entry']))
libs=['-l'+x for x in ['user32','gdi32','comdlg32','comctl32','ole32','uuid','windowscodecs','winmm','sapi','ws2_32','shell32']]
for target,entry,extra in [('jimsabz.exe','main',[]),('Jimsabz-Studio.exe','studio_entry',['-municode','-mwindows'])]:
 subprocess.run([args.compiler,'-static','-pthread',*extra,*[str(out/(s+'.o'))for s in [*sources,entry]],'-o',str(root/'build'/target),*libs],check=True)
 print('Linked',target,flush=True)
