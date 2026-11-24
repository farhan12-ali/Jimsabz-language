import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
assert.equal(typeof worker.fetch, 'function');
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
await check('packaged Worker serves the IDE and executable dialog module', async () => {
  const html = await worker.fetch(new Request('https://studio.example/')); assert.equal(html.status, 200); assert.match(await html.text(), /id="download-exe"/);
  const module = await worker.fetch(new Request('https://studio.example/exe-build.mjs')); assert.equal(module.status, 200); assert.match(await module.text(), /requestExecutable/);
});
await check('packaged local agent assets remain available', async () => {
  const r = await worker.fetch(new Request('https://studio.example/agent/model.json')); assert.equal(r.status, 200); const model = await r.json(); assert.equal(Object.keys(model.labels).length, 15);
});
await check('packaged Compiler Factory serves every current module and theme without stale source', async () => {
  for (const name of ['factory/model.mjs','factory/scene.mjs','factory/tree.mjs','factory/window.mjs','factory/factory.css','run.html','run.mjs','core/worker.mjs']) {
    const response = await worker.fetch(new Request('https://studio.example/' + name));
    assert.equal(response.status,200,name);
    const expected = await readFile(new URL('../studio/' + name,import.meta.url));
    const actual = new Uint8Array(await response.arrayBuffer());
    assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(expected).digest('hex'),name);
  }
});
await check('asset conditional requests and missing paths are handled', async () => {
  const r = await worker.fetch(new Request('https://studio.example/exe-build.css')); assert.equal(r.status, 200);
  assert.equal((await worker.fetch(new Request('https://studio.example/exe-build.css', { headers: { 'If-None-Match': r.headers.get('ETag') } }))).status, 304);
  assert.equal((await worker.fetch(new Request('https://studio.example/not-a-file'))).status, 404);
});
await check('packaged API health reports the Windows build target', async () => {
  const r = await worker.fetch(new Request('https://studio.example/api/build/health')); assert.equal(r.status, 200); assert.equal((await r.json()).target, 'windows-x64');
});
await check('packaged API produces a PE download with a matching checksum', async () => {
  const r = await worker.fetch(new Request('https://studio.example/api/build/exe', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://studio.example' }, body: JSON.stringify({ source: 'budhai "Standalone"\n', filename: 'Demo.exe' }) }));
  assert.equal(r.status, 200); const bytes = new Uint8Array(await r.arrayBuffer()); assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'MZ'); assert.equal(createHash('sha256').update(bytes).digest('hex'), r.headers.get('X-Artifact-SHA256')); assert.match(r.headers.get('Content-Disposition'), /Demo\.exe/);
});
await check('packaged API preserves compiler diagnostics', async () => {
  const r = await worker.fetch(new Request('https://studio.example/api/build/exe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'budhai missing_name\n' }) })); assert.equal(r.status, 422); assert.equal((await r.json()).diagnostics[0].stage, 3);
});
await check('packaged API rejects a different origin', async () => {
  const r = await worker.fetch(new Request('https://studio.example/api/build/exe', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{}' })); assert.equal(r.status, 403);
});
await check('packaged API rejects unsupported methods', async () => {
  assert.equal((await worker.fetch(new Request('https://studio.example/api/build/exe'))).status, 405);
  assert.equal((await worker.fetch(new Request('https://studio.example/index.html', { method: 'POST' }))).status, 405);
});
console.log(`${passed} packaged Worker frontend/API checks passed.`);
