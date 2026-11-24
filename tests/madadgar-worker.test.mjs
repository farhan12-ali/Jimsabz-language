// Real isolated Node worker threads exercise the same worker entry and VM.
// This is not a browser rendering test.
import assert from 'node:assert/strict';
import { Worker as Thread } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { SandboxRunner } from '../studio/agent/execution.mjs';
const workerBootstrap = `
  import { parentPort, workerData } from 'node:worker_threads';
  globalThis.self = { postMessage: data => parentPort.postMessage(data) };
  await import(workerData.url);
  parentPort.on('message', data => self.onmessage({ data }));
`;
let terminated = 0;
class WorkerAdapter {
  constructor(url) {
    this.thread = new Thread(new URL('data:text/javascript,' + encodeURIComponent(workerBootstrap)), { workerData: { url: url.href } });
    this.thread.on('message', data => this.onmessage?.({ data }));
    this.thread.on('error', error => this.onerror?.({ message: error.message }));
  }
  postMessage(value) { this.thread.postMessage(value); }
  terminate() { terminated++; this.thread.terminate(); }
}
let passed = 0;
async function check(name, work) { await work(); passed++; console.log('PASS ' + name); }
const request = (action, text) => ({ action, files: [{ path: 'main.jimsabz', text }], entry: 'main.jimsabz' });
const runner = new SandboxRunner({ WorkerClass: WorkerAdapter });
await check('real worker compiles and executes a typed function through the public runner', async () => {
  const r = await runner.execute(request('run', 'kam twice(adad n) -> adad { wapas n*2 }\nbudhai twice(11)'));
  assert.equal(r.ok, true); assert.equal(r.run.output, '22\n'); assert.equal(r.runtime, 'Passed');
});
await check('real worker returns exact compiler diagnostics without executing invalid source', async () => {
  const r = await runner.execute(request('compile', 'budhai undeclared'));
  assert.equal(r.ok, false); assert.match(r.diagnostics[0].code, /SEM/); assert.equal(r.runtime, 'Not Run');
});
await check('real worker executes independent expected-output fixtures', async () => {
  const r = await runner.execute({ ...request('tests', 'adad n=budh("N: ")\nbudhai n+1'),
    cases: [{ inputs: ['7'], expectedOutput: 'N: 8\n' }, { inputs: ['-1'], expectedOutput: 'N: 0\n' }] });
  assert.equal(r.passed, 2); assert.equal(r.failed, 0);
});
await check('real worker is terminated when its outer timeout expires', async () => {
  const before = terminated;
  await assert.rejects(new SandboxRunner({ WorkerClass: WorkerAdapter, timeout: 1 }).execute(request('run', 'wori (ha) {}')), /timed out/);
  assert.equal(terminated, before + 1);
});
await check('cancel terminates a real worker and the next request still succeeds', async () => {
  const controller = new AbortController(), before = terminated;
  const pending = runner.execute(request('run', 'wori (ha) {}'), controller.signal); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(terminated, before + 1);
  const r = await runner.execute(request('run', 'budhai "again"')); assert.equal(r.run.output, 'again\n');
});
await check('bundled file-backed knowledge excerpts match their declared source lines exactly', async () => {
  const chunks = JSON.parse(await readFile(new URL('../studio/agent/knowledge-index.json', import.meta.url), 'utf8'));
  for (const c of chunks.filter(c => !c.source.startsWith('verified-examples/'))) {
    const text = await readFile(new URL('../' + c.source, import.meta.url), 'utf8');
    assert.equal(c.text, text.split('\n').slice(c.startLine - 1, c.endLine).join('\n'), c.id);
  }
});
console.log(`\n${passed} real worker and source-evidence checks passed. Browser layout and model quality were not tested here.`);
