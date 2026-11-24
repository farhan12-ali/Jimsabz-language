import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeProject, renameEdits, symbolAt, completions, formatSource, signature } from '../studio/professional/language-service.mjs';
import { RecoveryVault, FolderSync, sameFiles } from '../studio/professional/recovery.mjs';
import { professionalGenerate, numericPlan } from '../studio/professional/agent-programs.mjs';
import { readScene, updateObject, addObject, assetInventory } from '../studio/professional/scene-service.mjs';
import { discoverTests, runTestSelection, outputDifference } from '../studio/professional/test-service.mjs';
import { compile } from '../studio/core/compiler.mjs';
import { executeSnapshot } from '../studio/agent/execution.mjs';
import { build } from '../studio/agent/builders.mjs';
import { runLocalAgent } from '../studio/agent/local-agent.mjs';

const file = (text, path = 'main.jimsabz') => ({ path, text, kind: 'source' });
const project = text => ({ id: 'pro-test', name: 'Test', active: 'main.jimsabz', entry: 'main.jimsabz', files: [file(text)] });
const runner = { execute: async (request, signal) => { signal?.throwIfAborted(); return executeSnapshot(request); } };
const analyze = files => analyzeProject(files, 'main.jimsabz');

test('live diagnostics report the actual compiler code, phase and location', async () => {
  const files = [file('adad count = "wrong"\n')], expected = await compile(files, 'main.jimsabz'), actual = await analyze(files);
  assert.equal(actual.ok, false); assert.deepEqual(actual.diagnostics, expected.diagnostics);
});
test('analysis never executes source or asks for interactive input', async () => {
  const result = await analyze([file('adad value = budh("Input: ")\nbudhai value\n')]);
  assert.equal(result.ok, true); assert.ok(result.symbols.some(s => s.name === 'value'));
});
test('definition follows an imported function and reports its real signature', async () => {
  const files = [file('kharna "math.jimsabz"\nbudhai doubleValue(4)\n'), file('kam doubleValue(adad value) -> adad { wapas value*2 }\n', 'math.jimsabz')];
  const index = await analyze(files), symbol = symbolAt(index, 'main.jimsabz', files[0].text.indexOf('doubleValue'));
  assert.equal(symbol.file, 'math.jimsabz'); assert.equal(signature(symbol), 'doubleValue(adad value) -> adad');
});
test('safe rename preserves shadowed variables, comments and strings', async () => {
  const text = 'adad value = 1\nkam show() {\n adad value = 2\n budhai value\n}\n// value stays in this comment\nbudhai "value"\nbudhai value\n';
  const files = [file(text)], index = await analyze(files), next = renameEdits(index, files, 'main.jimsabz', text.lastIndexOf('value'), 'amount');
  assert.match(next[0].text, /adad amount = 1/); assert.match(next[0].text, /adad value = 2/); assert.match(next[0].text, /budhai "value"/); assert.match(next[0].text, /\/\/ value stays/); assert.ok(next[0].text.endsWith('budhai amount\n'));
  assert.equal((await compile(next, 'main.jimsabz')).ok, true);
});
test('safe function rename updates imported call sites', async () => {
  const files = [file('kharna "math.jimsabz"\nbudhai doubleValue(4)\n'), file('kam doubleValue(adad value) -> adad { wapas value*2 }\n', 'math.jimsabz')];
  const next = renameEdits(await analyze(files), files, 'main.jimsabz', files[0].text.indexOf('doubleValue'), 'twice');
  assert.match(next[0].text, /twice\(4\)/); assert.match(next[1].text, /kam twice/); assert.ok((await compile(next, 'main.jimsabz')).ok);
});
test('rename refuses collisions and invalid identifiers', async () => {
  const files = [file('adad a = 1\nadad b = 2\nbudhai a\n')], index = await analyze(files), at = files[0].text.lastIndexOf('a');
  assert.throws(() => renameEdits(index, files, 'main.jimsabz', at, 'b'), /already exists/);
  for (const name of ['budhai', 'a-b', '1name', 'adad_satt']) assert.throws(() => renameEdits(index, files, 'main.jimsabz', at, name));
});
test('rename refuses stale source, unsupported members and invalid programs', async () => {
  const files = [file('adad a = 1\nbudhai a\n')], index = await analyze(files);
  assert.throws(() => renameEdits(index, [file('adad b = 1\nbudhai b\n')], 'main.jimsabz', files[0].text.lastIndexOf('a'), 'newName'), /Source changed/);
  const broken = [file('budhai unknown\n')]; assert.throws(() => renameEdits({ ...index, ok: false }, broken, 'main.jimsabz', 0, 'name'), /valid program/);
});
test('completion returns visible local symbols with parameter signatures', async () => {
  const text = 'kam calculate(adad amount) -> adad {\n adad localValue = amount\n wapas localValue\n}\nbudhai calculate(2)\n';
  const index = await analyze([file(text)]), items = completions(index, 'main.jimsabz', text, text.indexOf('localValue\n'));
  assert.ok(items.some(x => x[0] === 'localValue'));
  const outside = completions(index, 'main.jimsabz', text, text.length); assert.ok(!outside.some(x => x[0] === 'localValue'));
});
test('class member completion uses checked receiver types', async () => {
  const text = 'qism Counter {\n adad value = 0\n kam add(adad amount) -> adad { wapas amount }\n}\nCounter counter = naon Counter()\nbudhai counter.value\n';
  const index = await analyze([file(text)]), code = text + 'counter.';
  assert.ok(index.ok); assert.ok(completions(index, 'main.jimsabz', code, code.length).some(x => x[0] === 'add' && x[2].includes('adad amount')));
});
test('formatter preserves compiler output, newline boundaries, braces in strings and comments', async () => {
  const text = 'kam show() {\nbudhai "{"\n/* a comment\n do not alter this line }\n*/\njey (ha) {\nbudhai "done"\n}\n}\nshow()\n';
  const formatted = formatSource(text); assert.match(formatted, /    budhai "\{"/); assert.match(formatted, /        budhai "done"/);
  assert.ok(formatted.includes(' do not alter this line }'));
  assert.equal(formatted.split('\n').length, text.split('\n').length);
  const a = await executeSnapshot({ action: 'run', entry: 'main.jimsabz', files: [file(text)] }), b = await executeSnapshot({ action: 'run', entry: 'main.jimsabz', files: [file(formatted)] });
  assert.equal(a.run.output, b.run.output); assert.equal(a.run.output, '{\ndone\n');
});
test('Unicode variable definitions and renaming preserve Unicode source', async () => {
  const text = 'adad نشان = 5\nbudhai نشان\n', files = [file(text)], index = await analyze(files);
  assert.equal(index.ok, true); const next = renameEdits(index, files, 'main.jimsabz', text.lastIndexOf('نشان'), 'نتيجو');
  assert.equal((await compile(next, 'main.jimsabz')).ok, true); assert.ok(next[0].text.endsWith('budhai نتيجو\n'));
});
test('rename keeps exception variables separate from outer variables', async () => {
  const text = 'lafz error = "outer"\nazmai { budhai 1 / 0 } pakar(error) { budhai error }\nbudhai error\n', files = [file(text)], index = await analyze(files);
  const next = renameEdits(index, files, 'main.jimsabz', text.lastIndexOf('error'), 'message');
  assert.match(next[0].text, /pakar\(error\) \{ budhai error \}/); assert.ok(next[0].text.endsWith('budhai message\n'));
  assert.ok((await compile(next, 'main.jimsabz')).ok);
});

const journal = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }; };
test('write-ahead journal finds unsaved edits and clears already-saved source', () => {
  const vault = new RecoveryVault({ indexedDB: null, journal: journal() }), p = project('budhai 1\n');
  vault.journalEdit(p, 'main.jimsabz', 'budhai 2\n'); assert.equal(vault.pending(p).text, 'budhai 2\n');
  p.files[0].text = 'budhai 2\n'; assert.equal(vault.pending(p), null);
});
test('recovery snapshots are cloned, deduplicated and isolated by workspace', async () => {
  const vault = await new RecoveryVault({ indexedDB: null, journal: null }).open(), p = project('budhai 1\n');
  await vault.record(p); await vault.record(p); p.files[0].text = 'budhai 2\n';
  assert.equal((await vault.list(p.id)).length, 1); assert.equal((await vault.list(p.id))[0].workspace.files[0].text, 'budhai 1\n');
  await vault.record({ ...p, id: 'other' }); assert.equal((await vault.list('other')).length, 1);
});
test('history retains no more than 40 checkpoints', async () => {
  const vault = new RecoveryVault({ indexedDB: null, journal: null });
  for (let i = 0; i < 45; i++) await vault.record(project('budhai ' + i), 'Test');
  assert.equal((await vault.list('pro-test')).length, 40);
});
test('file comparison checks binary assets and source paths', () => {
  const p = project('budhai 1'); const b = structuredClone(p); assert.ok(sameFiles(p, b)); b.files.push({ path: 'image.png', bytes: [1] }); assert.equal(sameFiles(p, b), false);
});
function fakeFolder(initial = {}) {
  const map = new Map(Object.entries(initial).map(([path, text]) => [path, new TextEncoder().encode(text)]));
  const missing = () => Object.assign(new Error('Missing'), { name: 'NotFoundError' });
  const dir = prefix => ({ name: 'Test folder', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    getDirectoryHandle: async (name, { create } = {}) => { if (!create && ![...map.keys()].some(k => k.startsWith(prefix + name + '/'))) throw missing(); return dir(prefix + name + '/'); },
    getFileHandle: async (name, { create } = {}) => {
      const path = prefix + name; if (!map.has(path) && !create) throw missing();
      return { getFile: async () => ({ arrayBuffer: async () => map.get(path).slice().buffer }), createWritable: async () => ({ write: async bytes => map.set(path, bytes.slice()), close: async () => {}, abort: async () => {} }) };
    } });
  return { handle: dir(''), map };
}
test('folder synchronization writes a new project and keeps unrelated disk files', async () => {
  const { handle, map } = fakeFolder({ 'keep.txt': 'Keep' }), sync = new FolderSync(handle), p = project('budhai 1');
  const rows = await sync.plan(p); assert.equal(rows[0].state, 'Save'); assert.equal(await sync.save(p, rows), 1); assert.ok(map.has('keep.txt'));
  assert.equal((await sync.plan(p))[0].state, 'Unchanged');
});
test('folder synchronization refuses pre-existing differences and later external edits', async () => {
  const { handle, map } = fakeFolder({ 'main.jimsabz': 'budhai 9' }), sync = new FolderSync(handle), p = project('budhai 1');
  let rows = await sync.plan(p); assert.equal(rows[0].state, 'Conflict'); await assert.rejects(sync.save(p, rows), /differ on disk/);
  map.delete('main.jimsabz'); rows = await sync.plan(p); map.set('main.jimsabz', new TextEncoder().encode('external'));
  await assert.rejects(sync.save(p, rows), /differ on disk/);
});
test('folder writes reject traversal, Git internals and absolute Windows paths', async () => {
  const sync = new FolderSync(fakeFolder().handle);
  for (const path of ['../x', '.git/config', 'C:/x.txt', '/x.txt', 'a\\b.txt']) await assert.rejects(sync.file(path, true));
});

test('test discovery validates suites and reports malformed JSON', () => {
  const p = project('budhai 1'); p.files.push(file('{bad', 'bad.tests.json')); assert.ok(discoverTests(p)[0].error);
  p.files[1].text = JSON.stringify({ version: 1, entry: 'main.jimsabz', cases: [{ inputs: [], expectedOutput: '1\n' }] }); assert.equal(discoverTests(p)[0].cases.length, 1);
});
test('test explorer executes selected cases and reports the actual mismatch', async () => {
  const p = project('budhai "Hello"\n'); p.files.push(file(JSON.stringify({ version: 1, entry: p.entry, cases: [{ name: 'Good', inputs: [], expectedOutput: 'Hello\n' }, { name: 'Bad', inputs: [], expectedOutput: 'Other\n' }] }), 'main.tests.json'));
  const one = await runTestSelection(p, 'main.tests.json:0', { runner }); assert.equal(one.length, 1); assert.equal(one[0].status, 'Passed');
  const all = await runTestSelection(p, null, { runner }); assert.equal(all[1].status, 'Failed'); assert.equal(all[1].output, 'Hello\n'); assert.equal(all[1].difference.line, 1);
});
test('test explorer reports compiler failures with navigable locations', async () => {
  const p = project('budhai missing\n'); p.files.push(file(JSON.stringify({ version: 1, entry: p.entry, cases: [{ inputs: [], expectedOutput: '' }] }), 'main.tests.json'));
  const results = await runTestSelection(p, null, { runner }); assert.equal(results[0].status, 'Failed'); assert.equal(results[0].diagnostic.at.line, 1);
});
test('test cancellation leaves unexecuted cases unreported instead of passing', async () => {
  const controller = new AbortController(); controller.abort();
  const p = project('budhai 1'); p.files.push(file(JSON.stringify({ version: 1, entry: p.entry, cases: [{ inputs: [], expectedOutput: '1\n' }] }), 'main.tests.json'));
  await assert.rejects(runTestSelection(p, null, { runner, signal: controller.signal }), { name: 'AbortError' });
});
test('output differences include final newlines', () => { assert.equal(outputDifference('a\n', 'a').offset, 1); assert.equal(outputDifference('a', 'a'), null); });

test('new agent plans compile into multiple source files for unseen combinations', async () => {
  const prompts = ['Create a program for 7 numbers with smallest, largest and mean', 'Build a numeric array [9, 3, 7, 1] with median and descending sorting', 'Write a separate module for 12 values with average and maximum', 'Make a program that asks how many numbers then finds their minimum and searches for 42'];
  for (const prompt of prompts) { const g = await professionalGenerate(prompt); assert.ok(g.files?.length >= 2, prompt); const c = await compile(g.files, g.name); assert.ok(c.ok, JSON.stringify(c.diagnostics)); }
});
test('compositional numeric planner executes total, average, min, max, median, sorting and search', async () => {
  const g = await professionalGenerate('Create a program with numbers [4, 1, 9, 2] total average minimum maximum median sort and search for 9');
  const r = await executeSnapshot({ action: 'run', entry: g.name, files: g.files }); assert.equal(r.runtime, 'Passed');
  assert.equal(r.run.output, 'Total: 16\nAverage: 4\nMinimum: 1\nMaximum: 9\nMedian: 3\nSearch index: 3\nValue: 1\nValue: 2\nValue: 4\nValue: 9\n\n');
});
test('numeric follow-up preserves previous operations and changes count', async () => {
  const first = 'Write a program for 4 numbers with total and median';
  const g = await professionalGenerate('Change to 12 numbers and add maximum', { lastRequest: first });
  assert.match(g.code, /count = 12/); assert.match(g.code, /totalValues/); assert.match(g.code, /medianValue/); assert.match(g.code, /maximumValue/);
});
test('runtime count is validated before array access', async () => {
  const g = await professionalGenerate('Write a program taking numbers at runtime with minimum and maximum');
  const r = await executeSnapshot({ action: 'run', entry: g.name, files: g.files, inputs: ['0'] }); assert.equal(r.runtime, 'Passed'); assert.match(r.run.output, /Choose between 1 and 1000/);
});
test('calculator fixtures execute and division by zero is handled', async () => {
  const g = await professionalGenerate('Write a simple calculator');
  const r = await executeSnapshot({ action: 'tests', entry: g.name, files: [file(g.code, g.name)], cases: g.fixtures }); assert.equal(r.passed, 2);
});
test('agent integration stages compiler-verified numeric modules for review', async () => {
  const p = project('budhai 0'), result = await runLocalAgent({ prompt: 'Write a program with numbers [3, 6, 9] median and maximum', workspace: p, chunks: [], runner });
  assert.ok(result.canApply); assert.ok(result.changes.pending); assert.equal(p.files.length, 1);
  assert.ok(result.changes.list().filter(f => f.path.endsWith('.jimsabz')).length >= 2);
});
test('follow-up edits update both known generated source files without duplicating the project', async () => {
  const first = await runLocalAgent({ prompt: 'Write a program for 7 numbers with total and median', workspace: project('budhai 0'), chunks: [], runner });
  const live = first.changes.apply(project('budhai 0')); live.madadgar = { topic: first.topic, lastRequest: first.request };
  const second = await runLocalAgent({ prompt: 'Add minimum and search for 42', workspace: live, chunks: [], runner });
  assert.ok(second.canApply); const sourceChanges = second.changes.list().filter(f => f.path.endsWith('.jimsabz'));
  assert.equal(sourceChanges.length, 2); assert.ok(sourceChanges.every(f => f.operation === 'Edit'));
  const next = second.changes.apply(live); assert.equal(next.entry, live.entry); assert.equal(next.files.length, live.files.length);
});
test('follow-up generation preserves user-modified modules by making a separate draft', async () => {
  const p = project('budhai 0'), first = await runLocalAgent({ prompt: 'Write a program for 4 numbers with total and median', workspace: p, chunks: [], runner });
  const live = first.changes.apply(p); live.madadgar = { topic: first.topic, lastRequest: first.request };
  live.files.find(f => f.path.endsWith('modules/numeric.jimsabz')).text += '// my custom logic\n';
  const second = await runLocalAgent({ prompt: 'Add maximum', workspace: live, chunks: [], runner });
  assert.ok(second.canApply); assert.ok(second.changes.list().filter(f => f.path.endsWith('.jimsabz')).every(f => f.operation === 'Create'));
  assert.ok(second.changes.apply(live).files.some(f => f.text?.includes('// my custom logic')));
});
test('existing marks and percentage routing remains outside the new numeric planner', () => {
  assert.equal(numericPlan('Write a program taking marks for 8 subjects and calculate percentage'), null);
});
test('find their median does not add an unrequested search prompt', async () => {
  const g = await professionalGenerate('Write a program to sort 1000 numbers and find their median');
  assert.doesNotMatch(g.code, /Search value/);
  const result = await executeSnapshot({ action: 'tests', entry: g.name, files: g.files, cases: g.fixtures });
  assert.equal(result.passed, 1); assert.equal(result.tests[0].inputsConsumed, 1000);
});

test('scene reader uses actual parser positions and primitive properties', () => {
  const scene = readScene(build('scene3d')); assert.equal(scene.scenes[0].dimension, 3); assert.equal(scene.objects[0].name, 'Player'); assert.deepEqual(scene.objects[0].properties.jagah3d.value, [0, 0, 0]);
});
test('scene edits preserve gameplay logic and compile', async () => {
  const source = build('player2d') + '\n// retain custom code\n', scene = readScene(source);
  const text = updateObject(scene, 'Player', { jagah: [42, 80], width: 50, rang: '#123456' });
  assert.match(text, /retain custom code/); assert.match(text, /jagah: \(42, 80\)/); assert.ok((await compile([file(text)], 'main.jimsabz')).ok);
});
test('3D placement and scale edits compile without changing camera controls', async () => {
  const scene = readScene(build('scene3d')), text = updateObject(scene, 'Player', { jagah3d: [1, 2, -3], paimano: [2, 1, 2], shakal3d: 'sphere' });
  assert.match(text, /follow3d: Player/); assert.ok((await compile([file(text)], 'main.jimsabz')).ok);
});
test('visual object creation inserts into the correct game block', async () => {
  const text = addObject(readScene(build('player2d')), 'Enemy', 2); assert.ok(readScene(text).objects.some(o => o.name === 'Enemy')); assert.ok((await compile([file(text)], 'main.jimsabz')).ok);
});
test('scene editor rejects expression rewrites and unsafe properties', () => {
  const scene = readScene(build('player2d').replace('jagah: (440, 280)', 'jagah: (100 + 2, 280)'));
  assert.throws(() => updateObject(scene, 'Player', { jagah: [0, 0] }), /expression/);
  assert.throws(() => updateObject(scene, 'Player', { unknown: 5 }));
  assert.throws(() => addObject(scene, 'Player'), /unique/);
});
test('asset inventory separates existing, missing and unreferenced resources', () => {
  const p = project('kharna gui\nkhed "Game" {\nkirdar Hero {\ntasveer: "hero.png"\n}\n}\n'); p.files.push({ path: 'unused.png', bytes: [1] });
  const inventory = assetInventory(p); assert.equal(inventory.missing[0].path, 'hero.png'); assert.equal(inventory.assets[0].status, 'Unreferenced');
});
test('UI exposes all eight additions and retains separate Run window', async () => {
  const html = await readFile(new URL('../studio/index.html', import.meta.url), 'utf8'), app = await readFile(new URL('../studio/app.mjs', import.meta.url), 'utf8');
  for (const id of ['overview', 'tests', 'history', 'git', 'scene']) assert.ok(html.includes(`data-pro-open="${id}"`));
  assert.match(app, /new RunWindow/); assert.match(app, /new ProfessionalWorkbench/); assert.ok(html.includes('aria-describedby="code-intel"'));
});
