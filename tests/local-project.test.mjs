import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink, access, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalProjectApi, localPath } from '../api/local-project.mjs';
import { createStudioServer } from '../api/server.mjs';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'jimsabz-local-test-'));
  try {
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    git('init', '-q'); git('config', 'user.name', 'Release test'); git('config', 'user.email', 'test@example.invalid');
    const api = createLocalProjectApi({ workspaceRoot: root });
    const capability = await (await api(new Request('http://localhost/api/local/capabilities'))).json();
    const call = async (path, body, headers = {}) => api(new Request('http://localhost/api/local/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Jimsabz-Local-Token': capability.token, ...headers } }), body);
    await fn({ root, git, api, call, capability });
  } finally { await rm(root, { recursive: true, force: true }); }
}
test('local capabilities stay disabled until a workspace is explicitly configured', async () => {
  const api = createLocalProjectApi(); const response = await api(new Request('http://localhost/api/local/capabilities'));
  assert.equal((await response.json()).available, false); assert.equal((await api(new Request('http://localhost/api/local/git'))).status, 409);
});
test('local project API requires a session token and rejects cross-origin requests', async () => fixture(async ({ api, capability }) => {
  assert.equal((await api(new Request('http://localhost/api/local/git'))).status, 403);
  assert.equal((await api(new Request('http://localhost/api/local/git', { headers: { 'X-Jimsabz-Local-Token': capability.token, Origin: 'https://other.invalid' } }))).status, 403);
}));
test('path validation blocks traversal, Git internals, executables and Windows drives', () => {
  for (const path of ['../escape.txt', '.git/config', '/tmp/x.txt', 'C:/x.txt', 'run.exe', 'a\\b.txt', 'folder/.env', 'x\n.txt', 'CON.txt', 'aux.json', 'folder/name?.txt', 'credentials.json']) assert.throws(() => localPath(path));
});
test('disk import returns exact text, binary contents and checksums', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 42\n'); await writeFile(join(root, 'image.png'), Buffer.from([1, 2, 3])); await writeFile(join(root, '.env'), 'PRIVATE');
  const snapshot = await (await call('snapshot')).json(); assert.equal(snapshot.files.length, 2); assert.ok(!snapshot.files.some(f => f.path === '.env'));
  assert.equal(snapshot.files.find(f => f.path === 'main.jimsabz').text, 'budhai 42\n'); assert.equal(snapshot.files.find(f => f.path === 'image.png').base64, 'AQID');
}));
test('disk save refuses external changes and preserves the existing file', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 1'); const snap = await (await call('snapshot')).json();
  await writeFile(join(root, 'main.jimsabz'), 'budhai 2');
  const response = await call('save', { files: [{ path: 'main.jimsabz', text: 'budhai 3', expectedHash: snap.files[0].hash }] });
  assert.equal(response.status, 409); assert.equal(await readFile(join(root, 'main.jimsabz'), 'utf8'), 'budhai 2');
}));
test('reviewed disk save creates nested files without deleting unrelated work', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'keep.txt'), 'Keep');
  const response = await call('save', { files: [{ path: 'src/main.jimsabz', text: 'budhai 7', expectedHash: null }] });
  assert.equal(response.status, 200); assert.equal(await readFile(join(root, 'src/main.jimsabz'), 'utf8'), 'budhai 7'); assert.equal(await readFile(join(root, 'keep.txt'), 'utf8'), 'Keep');
}));
test('linked directories cannot redirect source writes outside the selected root', async () => fixture(async ({ root, call }) => {
  const other = await mkdtemp(join(tmpdir(), 'jimsabz-outside-'));
  try { await symlink(other, join(root, 'linked'), 'dir'); const response = await call('save', { files: [{ path: 'linked/secret.txt', text: 'x', expectedHash: null }] }); assert.equal(response.status, 400); await assert.rejects(access(join(other, 'secret.txt'))); }
  finally { await rm(other, { recursive: true, force: true }); }
}));
test('Git state, staging, reviewed commit and history work in a real repository', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 42\n');
  let state = await (await call('git')).json(); assert.equal(state.files[0].state, '??');
  state = await (await call('git/action', { action: 'stage', paths: ['main.jimsabz'] })).json(); assert.equal(state.files[0].staged, true);
  const diff = await (await call('diff?staged=true')).json(); assert.match(diff.diff, /budhai 42/);
  const committed = await call('git/action', { action: 'commit', message: 'Add example', stagedRevision: state.stagedRevision });
  assert.equal(committed.status, 200); const after = await committed.json(); assert.equal(after.files.length, 0); assert.equal(after.log[0].message, 'Add example');
}));
test('commit refuses a staged snapshot that changed after review', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 1'); let state = await (await call('git/action', { action: 'stage', paths: ['main.jimsabz'] })).json();
  await writeFile(join(root, 'main.jimsabz'), 'budhai 2'); await call('git/action', { action: 'stage', paths: ['main.jimsabz'] });
  assert.equal((await call('git/action', { action: 'commit', message: 'Stale', stagedRevision: state.stagedRevision })).status, 409);
}));
test('first-time users can supply a per-commit identity without changing Git configuration', async () => fixture(async ({ root, git, call }) => {
  git('config', '--unset', 'user.name'); git('config', '--unset', 'user.email');
  await writeFile(join(root, 'main.jimsabz'), 'budhai 42');
  const state = await (await call('git/action', { action: 'stage', paths: ['main.jimsabz'] })).json();
  assert.equal(state.identity.name, '');
  const response = await call('git/action', { action: 'commit', message: 'First commit', stagedRevision: state.stagedRevision, authorName: 'Project developer', authorEmail: 'developer@example.invalid' });
  assert.equal(response.status, 200); assert.equal((await response.json()).log[0].author, 'Project developer');
  assert.throws(() => git('config', '--local', '--get', 'user.email'));
}));
test('Git commits do not execute repository hooks or signing programs', async () => fixture(async ({ root, git, call }) => {
  const marker = join(root, 'hook-ran.txt'); await writeFile(join(root, '.git/hooks/pre-commit'), '#!/bin/sh\necho bad > "' + marker + '"\n'); await chmod(join(root, '.git/hooks/pre-commit'), 0o755);
  git('config', 'commit.gpgSign', 'true'); git('config', 'gpg.program', '/not/a/program');
  await writeFile(join(root, 'main.jimsabz'), 'budhai 1'); const state = await (await call('git/action', { action: 'stage', paths: ['main.jimsabz'] })).json();
  assert.equal((await call('git/action', { action: 'commit', message: 'Safe commit', stagedRevision: state.stagedRevision })).status, 200); await assert.rejects(access(marker));
}));
test('staging disables executable clean and process filters from repository configuration', async () => fixture(async ({ root, git, call }) => {
  const marker = join(root, 'filter-ran.txt');
  git('config', 'filter.evil.clean', 'sh -c \'echo bad > "' + marker + '"; cat\''); git('config', 'filter.evil.required', 'true');
  await writeFile(join(root, '.gitattributes'), '*.jimsabz filter=evil\n'); await writeFile(join(root, 'main.jimsabz'), 'budhai 1');
  const response = await call('git/action', { action: 'stage', paths: ['main.jimsabz'] }); assert.equal(response.status, 200, await response.clone().text()); await assert.rejects(access(marker));
}));
test('branch creation and switching preserve working changes', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 1'); let state = await (await call('git/action', { action: 'stage', paths: ['main.jimsabz'] })).json();
  await call('git/action', { action: 'commit', message: 'Initial', stagedRevision: state.stagedRevision });
  let response = await call('git/action', { action: 'branch', name: 'feature/new' }); assert.equal(response.status, 200); assert.equal((await response.json()).branch, 'feature/new');
  await writeFile(join(root, 'main.jimsabz'), 'budhai 2'); response = await call('git/action', { action: 'branch', name: 'feature/other' }); assert.equal(response.status, 409); assert.equal(await readFile(join(root, 'main.jimsabz'), 'utf8'), 'budhai 2');
}));
test('unstage works before the first commit and leaves source files in place', async () => fixture(async ({ root, call }) => {
  await writeFile(join(root, 'main.jimsabz'), 'budhai 1'); await call('git/action', { action: 'stage', paths: ['main.jimsabz'] });
  const response = await call('git/action', { action: 'unstage', paths: ['main.jimsabz'] }); assert.equal(response.status, 200); assert.equal((await response.json()).files[0].state, '??'); assert.equal(await readFile(join(root, 'main.jimsabz'), 'utf8'), 'budhai 1');
}));
test('HTTP local endpoints enforce origin, content type, token and workspace scope', async () => fixture(async ({ root }) => {
  const server = createStudioServer({ workspaceRoot: root }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    const cap = await (await fetch(base + '/api/local/capabilities')).json(); assert.ok(cap.available);
    assert.equal((await fetch(base + '/api/local/git')).status, 403);
    assert.equal((await fetch(base + '/api/local/git', { headers: { Origin: 'https://other.invalid', 'X-Jimsabz-Local-Token': cap.token } })).status, 403);
    assert.equal((await fetch(base + '/api/local/save', { method: 'POST', body: '{}' })).status, 415);
    assert.equal((await fetch(base + '/api/local/snapshot', { headers: { 'X-Jimsabz-Local-Token': cap.token } })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
}));
