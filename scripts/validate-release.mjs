import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildApi, sha256, RUNTIME_SHA256 } from '../api/build-service.mjs';

const run = promisify(execFile), root = new URL('../', import.meta.url);
const runtime = new Uint8Array(await readFile(new URL('studio/assets/jimsabz-runtime.exe', root)));
const api = createBuildApi(() => runtime), cases = [
  { name: 'Console output', entry: 'main.jimsabz', files: [{ path: 'main.jimsabz', text: 'budhai "Jimsabz standalone"\n' }], expected: 'Jimsabz standalone\n' },
  { name: 'Interactive input, imports and functions', entry: 'main.jimsabz', files: [
    { path: 'main.jimsabz', text: 'kharna "modules/math.jimsabz"\nadad a = budh("A: ")\nadad b = budh("B: ")\nbudhai twice(a+b)\n' },
    { path: 'modules/math.jimsabz', text: 'kam twice(adad value) -> adad { wapas value*2 }\n' }], input: '12\n9\n', expected: 'A: B: 42\n' },
  { name: 'Arrays and exception handling', entry: 'main.jimsabz', files: [{ path: 'main.jimsabz', text: 'qatar adad a = [2,4,6]\nadad total = 0\ngin x andar a { total += x }\nbudhai total\nazmai { budhai a[99] } pakar(e) { budhai "caught" }\n' }], expected: '12\ncaught\n' },
  { name: 'Persistent file I/O', entry: 'main.jimsabz', files: [{ path: 'main.jimsabz', text: 'kharna FileSystem\nFileSystem.writeText("validation.txt", "Saved data")\nbudhai FileSystem.readText("validation.txt")\n' }], expected: 'Saved data\n' },
];
const checks = [], temp = await mkdtemp(join(tmpdir(), 'jimsabz-release-'));
let failed = false;
try {
  assert.equal(await sha256(runtime), RUNTIME_SHA256);
  const view = new DataView(runtime.buffer), pe = view.getUint32(0x3c, true);
  assert.equal(view.getUint16(pe + 4, true), 0x8664);
  checks.push({ name: 'Bundled PE64 runtime integrity', status: 'Passed', detail: 'SHA-256 and Windows x64 machine header matched.' });
  for (const [i, sample] of cases.entries()) {
    try {
      const response = await api(new Request('http://localhost/api/build/exe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sample, filename: 'case-' + i + '.exe' }) }));
      assert.equal(response.status, 200, await response.clone().text());
      const bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(await sha256(bytes), response.headers.get('X-Artifact-SHA256'));
      const executable = join(temp, 'case-' + i + '.exe'); await writeFile(executable, bytes);
      checks.push({ name: sample.name + ' export', status: 'Passed', detail: bytes.length + ' bytes, download checksum verified.' });
      if (process.platform !== 'win32') {
        checks.push({ name: sample.name + ' on Windows', status: 'Not Run', detail: 'Requires a Windows x64 host.' }); continue;
      }
      const empty = join(temp, 'empty-' + i); await mkdir(empty);
      const actual = await new Promise((resolveRun, reject) => {
        const child = execFile(executable, [], { cwd: empty, env: { ...process.env, LOCALAPPDATA: join(temp, 'local-appdata') }, timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolveRun(stdout.replace(/\r\n/g, '\n')));
        child.stdin.on('error', () => {}); child.stdin.end(sample.input || '');
      });
      assert.equal(actual, sample.expected);
      checks.push({ name: sample.name + ' on Windows', status: 'Passed', detail: 'Ran from an empty folder and matched exact output.' });
    } catch (error) { failed = true; checks.push({ name: sample.name, status: 'Failed', detail: error.message.slice(0, 1000) }); }
  }
} finally { await rm(temp, { recursive: true, force: true }); }
const report = { studio: '0.19.0', host: process.platform + '-' + process.arch, recorded: new Date().toISOString(), checks };
const output = process.argv.includes('--output') ? process.argv[process.argv.indexOf('--output') + 1] : null;
if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2)); process.exitCode = failed ? 1 : 0;
