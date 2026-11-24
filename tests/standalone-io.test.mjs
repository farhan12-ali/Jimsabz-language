import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, chmod, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../api/build-service.mjs';

test('standalone file I/O executes from the exact payload with isolated user data', { skip: process.platform !== 'linux' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'jimsabz-text-asset-'));
  try {
    const runtime = new Uint8Array(await readFile(new URL('../studio/assets/jimsabz-runtime.exe', import.meta.url)));
    const built = await buildProject({ entry: 'main.jimsabz', files: [
      { path: 'main.jimsabz', text: 'kharna FileSystem\nFileSystem.writeText("validation.txt", "Saved data")\nbudhai FileSystem.readText("validation.txt")\n' },
    ] }, runtime);
    assert.equal(built.assets, 0);
    const length = Number(new DataView(built.bytes.buffer, built.bytes.byteOffset, built.bytes.byteLength).getBigUint64(built.bytes.length - 8, true));
    const embedded = built.bytes.slice(built.bytes.length - length - 16);
    const harness = join(temp, 'native-harness'), empty = join(temp, 'empty');
    await mkdir(empty); await writeFile(harness, Buffer.concat([await readFile(new URL('../build/jimsabz', import.meta.url)), embedded])); await chmod(harness, 0o700);
    assert.equal(execFileSync(harness, [], { cwd: empty, env: { ...process.env, XDG_DATA_HOME: join(temp, 'user-data') }, encoding: 'utf8', timeout: 5000 }), 'Saved data\n');
  } finally { await rm(temp, { recursive: true, force: true }); }
});
