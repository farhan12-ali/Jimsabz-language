// Real native host smoke checks. No model service or browser dependency.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
const executable = new URL('../build/' + (process.platform === 'win32' ? 'jimsabz.exe' : 'jimsabz'), import.meta.url);
const host = spawn(fileURLToPath(executable), ['studio'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, JIMSABZ_NO_BROWSER: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
let passed = 0;
async function check(name, work) { await work(); passed++; console.log('PASS ' + name); }
try {
  const base = await new Promise((resolve, reject) => {
    let text = ''; const timer = setTimeout(() => reject(new Error('Native host did not start.')), 7000);
    host.stdout.on('data', data => { text += data; const m = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
    host.once('exit', code => { clearTimeout(timer); reject(new Error('Native host exited: ' + code)); });
  });
  await check('native launcher serves the built-in local agent interface', async () => {
    const r = await fetch(base + '/'); assert.equal(r.status, 200);
    const html = await r.text(); assert.match(html, /Jimsabz Code Madadgar/); assert.match(html, /0\.19\.0/);
    assert.match(html, /professional\/workbench.css/);
    assert.doesNotMatch(html, /Choose AI model mode|agent-mode/);
  });
  await check('the trained classifier is served from the local package', async () => {
    const r = await fetch(base + '/agent/model.json'); assert.equal(r.status, 200);
    const m = await r.json(); assert.equal(m.dataset_samples, 497); assert.equal(Object.keys(m.labels).length, 15);
  });
  await check('the local versioned knowledge index is available without an inference service', async () => {
    const r = await fetch(base + '/agent/knowledge-index.json'); assert.equal(r.status, 200);
    const chunks = await r.json(); assert.ok(chunks.some(c => /0\.19\.0/.test(c.version)));
  });
  await check('the removed model-list route is unavailable', async () => {
    assert.equal((await fetch(base + '/__madadgar/models')).status, 404);
  });
  await check('the removed inference route cannot accept chat requests', async () => {
    const r = await fetch(base + '/__madadgar/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 405);
  });
  await check('heartbeat and startup remain usable after rejected requests', async () => {
    assert.equal(await (await fetch(base + '/__heartbeat')).text(), 'ok');
    assert.deepEqual(await (await fetch(base + '/__startup')).json(), {});
  });
  const raw = text => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: Number(new URL(base).port) }); let data = '';
    socket.on('connect', () => socket.write(text)); socket.on('data', c => data += c);
    socket.on('end', () => resolve(data)); socket.on('error', reject);
  });
  await check('native host rejects a different Host and duplicate Host headers', async () => {
    assert.match(await raw('GET / HTTP/1.1\r\nHost: wrong.example\r\n\r\n'), /^HTTP\/1.1 403/);
    assert.match(await raw(`GET / HTTP/1.1\r\nHost: ${new URL(base).host}\r\nHost: ${new URL(base).host}\r\n\r\n`), /^HTTP\/1.1 400/);
  });
  await check('encoded traversal cannot read files outside the studio directory', async () => {
    assert.match(await raw(`GET /%2e%2e/README.md HTTP/1.1\r\nHost: ${new URL(base).host}\r\n\r\n`), /^HTTP\/1.1 404/);
  });
  console.log(`\n${passed} native local-only host checks passed.`);
} finally { host.kill('SIGTERM'); }
