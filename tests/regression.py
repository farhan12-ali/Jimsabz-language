"""End-to-end tests against the actual native compiler/VM. Python is test-only."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
EXE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / 'build' / ('jimsabz.exe' if os.name == 'nt' else 'jimsabz')
results = []


def call(*args, stdin='', timeout=12):
    return subprocess.run([str(EXE), *map(str, args)], input=stdin, text=True,
                          encoding='utf-8', capture_output=True, cwd=ROOT, timeout=timeout)


def record(name, passed, detail=''):
    results.append({'test': name, 'passed': bool(passed), 'detail': detail})
    print(('PASS ' if passed else 'FAIL ') + name + (': ' + detail if not passed else ''))


with tempfile.TemporaryDirectory(prefix='jimsabz-regression-') as tmp:
    work = Path(tmp)
    (work / 'jimsabz.json').write_text('{}')
    source = work / 'test.jimsabz'

    def run(name, code, expected='', stdin='', error=None):
        source.write_text(code, encoding='utf-8')
        r = call('run', source, stdin=stdin)
        if error:
            record(name, r.returncode == 1 and error in r.stderr, r.stderr.strip())
        else:
            record(name, r.returncode == 0 and r.stdout == expected and not r.stderr,
                   repr(r.stdout) + ' / ' + r.stderr.strip())

    run('beginner output shorthand', 'budhai = "Farhan"\n', 'Farhan\n')
    run('plain output', 'budhai "Farhan"\n', 'Farhan\n')
    run('operator-looking strings remain strings', 'budhai "!"\nbudhai "-"\nbudhai "jey"\n', '!\n-\njey\n')
    run('left operand is evaluated before side effects', 'adad n = 1\nbudhai n + (n = 2)\n', '3\n')
    run('arguments are evaluated left to right', 'kam add(adad a, adad b) -> adad {\n wapas a+b\n}\nadad n = 1\nbudhai add(n, n = 2)\n', '3\n')
    run('compound target value is read before right side', 'adad n = 1\nn += (n = 4)\nbudhai n\n', '5\n')
    run('interactive string', 'lafz n = budh("Name: ")\nbudhai n\n', 'Name: Farhan\n', 'Farhan\n')
    run('sum of two inputs', 'adad a = budh("A: ")\nadad b = budh("B: ")\nbudhai a + b\n', 'A: B: 42\n', '19\n23\n')
    run('report input and output compatibility', 'lafz n = budh("Name: ")\nbudhai n\n', 'Name: Ali\n', 'Ali\n')
    run('EOF reports input failure', 'adad n = budh("N: ")\n', error='Input stream closed')
    run('recover invalid input', 'azmai {\n adad n = budh("")\n} pakar (e) {\n budhai "caught"\n}\n', 'caught\n', 'oops\n')
    run('decimal input', 'dec n = budh("")\nbudhai n + 0.5\n', '3\n', '2.5\n')
    run('boolean input', 'isharo yes = budh("")\nbudhai yes\n', 'ha\n', 'ha\n')
    run('operator precedence', 'budhai 2 + 3 * 4\nbudhai (2 + 3) * 4\n', '14\n20\n')
    run('integer division', 'budhai 7 / 2\nbudhai 7 % 2\n', '3\n1\n')
    run('decimal promotion', 'dec d = 3\nbudhai d + 0.25\n', '3.25\n')
    run('dual comparisons', 'budhai 3 wado_barabar 3\nbudhai 3 >= 3\nbudhai 2 na_barabar 1\nbudhai 2 != 1\n', 'ha\nha\nha\nha\n')
    run('logical precedence', 'budhai ha ya na ain na\n', 'ha\n')
    run('short circuit', 'budhai na && (1 / 0 > 1)\nbudhai ha || (1 / 0 > 1)\n', 'na\nha\n')
    run('explicit casts', 'adad n = badal(3.8, adad)\nbudhai n\nbudhai badal(ha, lafz)\n', '3\nha\n')
    run('typed arrays and methods', 'qatar adad a = [1, 2]\na.joryo(3)\na[0] = 9\nbudhai a[0]\nbudhai a.kadh(1)\nbudhai a.lambai\n', '9\n2\n2\n')
    run('nested arrays', 'qatar qatar adad a = [[1, 2], [3, 4]]\na[1][0] = 8\nbudhai a[1][0]\n', '8\n')
    run('empty typed arrays', 'qatar adad a = []\na.joryo(7)\nbudhai a[0]\n', '7\n')
    run('array bound exception', 'qatar adad a = [1]\nazmai {\n budhai a[-1]\n} pakar (e) {\n budhai "safe"\n}\n', 'safe\n')
    run('objects and field mutation', 'qism Person {\n lafz name\n adad age\n}\nPerson p = naon Person("Ali", 20)\np.age += 1\nbudhai p.name + " " + p.age\n', 'Ali 21\n')
    run('object method mutation', 'qism Counter {\n adad count\n kam add(adad n) -> adad {\n count += n\n wapas count\n }\n}\nCounter c = naon Counter(4)\nbudhai c.add(3)\nbudhai c.count\n', '7\n7\n')
    run('recursive functions', 'kam fact(adad n) -> adad {\n jey (n <= 1) {\n wapas 1\n } na_ta {\n wapas n * fact(n-1)\n }\n}\nbudhai fact(7)\n', '5040\n')
    run('for break continue', 'adad sum = 0\ngin (adad i = 0; i < 10; i += 1) {\n jey (i == 2) {\n agty\n }\n jey (i == 5) {\n rok\n }\n sum += i\n}\nbudhai sum\n', '8\n')
    run('foreach loop', 'qatar adad a = [2,4,6]\nadad total = 0\ngin v andar a {\n total += v\n}\nbudhai total\n', '12\n')
    run('while and block scope', 'adad i = 0\nwori (i < 3) {\n adad temp = i * 2\n budhai temp\n i += 1\n}\n', '0\n2\n4\n')
    run('switch and break', 'adad n = 2\nchundo(n) {\n halat 1:\n budhai "one"\n rok\n halat 2:\n budhai "two"\n rok\n aam:\n budhai "other"\n}\n', 'two\n')
    run('default switch', 'chundo(9) {\n halat 1:\n budhai "one"\n aam:\n budhai "other"\n}\n', 'other\n')
    run('nested exception handling', 'azmai {\n azmai {\n uthao("inner")\n } pakar (e) {\n uthao("outer")\n }\n} pakar (e) {\n budhai "caught"\n}\n', 'caught\n')
    run('try scope unwind with break', 'gin (adad i = 0; i < 2; i += 1) {\n azmai {\n rok\n } pakar (e) {\n budhai "bad"\n }\n}\nbudhai "ok"\n', 'ok\n')
    run('integer overflow trapped', 'azmai {\n adad n = 9223372036854775807\n n += 1\n} pakar (e) {\n budhai "overflow caught"\n}\n', 'overflow caught\n')
    run('Unicode identifiers and aliases', 'عدد نمبر = 7\nجي (نمبر > 5) {\n budhai "سلام"\n}\n', 'سلام\n')
    run('comments and escapes', '/* before\n after */\nbudhai "A\\nB" // comment\n', 'A\nB\n')
    run('strict narrowing rejected', 'adad n = 2.5\n', error='SEM-03')
    run('undeclared name rejected', 'budhai missing\n', error='SEM-02')
    run('constant mutation rejected', 'pakko adad n = 1\nn = 2\n', error='SEM-02')
    run('constant array mutation rejected', 'pakko qatar adad n = [1]\nn[0] = 2\n', error='SEM-02')
    run('constant method mutation rejected', 'pakko qatar adad n = [1]\nn.joryo(2)\n', error='SEM-02')
    run('constant aliases cannot mutate backing array', 'pakko qatar adad a = [1]\nqatar adad b = a\nazmai {\n b.joryo(2)\n} pakar (e) {\n budhai "immutable"\n}\nbudhai a.lambai\n', 'immutable\n1\n')
    run('missing library rejected in semantic stage', 'khed "Game" {\n khirki 800, 600\n}\n', error='SEM-01')
    run('unclosed block rejected', 'jey (ha) {\n budhai 1\n', error='SYN-02')
    run('unterminated string rejected', 'budhai "hello', error='LEX-01')
    run('illegal symbol rejected', 'budhai ha & na\n', error='LEX-02')
    run('semicolon outside for rejected', 'adad n = 1;\n', error='SYN-01')
    run('loop control outside loop rejected', 'rok\n', error='SEM-03')
    run('missing return rejected', 'kam f() -> adad {\n budhai 1\n}\n', error='SEM-03')
    run('wrong constructor arity rejected', 'qism P {\n adad n\n}\nP p = naon P()\n', error='SEM-03')
    run('math library functions', 'kharna hisab\nbudhai sqrt(81)\nbudhai hisab.abs(-12)\n', '9\n12\n')
    run('math library guard', 'budhai sqrt(81)\n', error='SEM-01')
    run('file round trip', 'likh("notes.txt", "Saved by Jimsabz")\nbudhai parh("notes.txt")\n', 'Saved by Jimsabz\n')
    run('file traversal caught', 'azmai {\n likh("../escape.txt", "bad")\n} pakar (e) {\n budhai "blocked"\n}\n', 'blocked\n')
    run('persistent state round trip', 'adad score = 19\nqatar adad values = [4,5]\nmahfooz("state.jimsave")\nscore = 0\nvalues[0] = 9\nwapas_lao("state.jimsave")\nbudhai score\nbudhai values[0]\n', '19\n4\n')
    (work / 'module.jimsabz').write_text('kam square(adad n) -> adad {\n wapas n*n\n}\n')
    run('module import', 'kharna "module.jimsabz"\nbudhai square(9)\n', '81\n')
    (work / 'model.jimsabz').write_text('qism Student {\n lafz name\n}\n')
    run('imported class declaration', 'kharna "model.jimsabz"\nStudent s = naon Student("Ali")\nbudhai s.name\n', 'Ali\n')
    (work / 'cycle.jimsabz').write_text('kharna "test.jimsabz"\n')
    run('circular import rejected', 'kharna "cycle.jimsabz"\n', error='SEM-01')
    run('missing sprite rejected', 'kharna gui\nkhed "G" {\n kirdar Hero {\n tasveer: "no.bmp"\n }\n}\n', error='ASSET-01')

    source.write_text('adad n = 17\nbudhai n * 3\n')
    artifact = work / 'compiled.jbc'
    build = call('build', source, '-o', artifact)
    compiled = call('run', artifact)
    record('binary bytecode compile and execution', build.returncode == 0 and compiled.stdout == '51\n' and artifact.read_bytes().startswith(b'JIMJBC2\n'), build.stderr + compiled.stderr)
    alias = work / 'compiled.jjimsa'
    alias.write_bytes(artifact.read_bytes())
    record('jjimsa executable bytecode alias', call('run', alias).stdout == '51\n')
    tampered = bytearray(artifact.read_bytes())
    tampered[-1] ^= 1
    artifact.write_bytes(tampered)
    record('corrupt bytecode rejected', 'checksum' in call('run', artifact).stderr)
    standalone = work / ('standalone.exe' if os.name == 'nt' else 'standalone.exe')
    result = call('build', source, '-o', standalone)
    r = subprocess.run([str(standalone)], cwd=work, capture_output=True, text=True, timeout=12)
    record('standalone executable has embedded bytecode', result.returncode == 0 and r.returncode == 0 and r.stdout == '51\n', result.stderr + r.stderr)
    source.write_text('adad count = 0\nazmai {\n count = badal(parh("counter.txt"), adad)\n} pakar (e) {\n}\ncount += 1\nlikh("counter.txt", badal(count, lafz))\nbudhai count\n')
    result = call('build', source, '-o', standalone)
    env = dict(os.environ, XDG_DATA_HOME=str(work/'data'), LOCALAPPDATA=str(work/'data'))
    first = subprocess.run([str(standalone)], cwd=work, capture_output=True, text=True, env=env, timeout=12)
    second = subprocess.run([str(standalone)], cwd=work, capture_output=True, text=True, env=env, timeout=12)
    record('standalone data persists between launches', first.stdout == '1\n' and second.stdout == '2\n', first.stderr + second.stderr)

    for example in ['salam', 'sum', 'functions', 'arrays_objects', 'modules_demo']:
        r = call('check', ROOT / 'examples' / (example + '.jimsabz'))
        record('example compiles: ' + example, r.returncode == 0, r.stderr)
    for dimension in [2, 3]:
        source.write_text('kharna gui' + ('3d' if dimension == 3 else '') + '\n' +
                          ('khed3d' if dimension == 3 else 'khed') + ' "Render test" {\n' +
                          ' khirki 640, 480\n' +
                          (' mujassamo Test {\n shakal3d: cube\n rang: cyan\n }\n' if dimension == 3 else
                           ' kirdar Test {\n jagah: (100,100)\n rang: cyan\n }\n') + '}\n')
        frame = work / ('synthetic-' + str(dimension) + 'd.ppm')
        r = call('run', source, '--headless', '120', '--frame', frame, timeout=30)
        record('synthetic renderer: ' + str(dimension) + 'D', r.returncode == 0 and frame.exists() and frame.stat().st_size > 100000, r.stderr)

report = {'executable': EXE.name, 'passed': sum(r['passed'] for r in results), 'total': len(results), 'results': results}
(ROOT / 'build' / 'test-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(f"\n{report['passed']}/{report['total']} tests passed")
sys.exit(0 if report['passed'] == report['total'] else 1)
