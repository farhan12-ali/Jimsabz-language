import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ChangeSet, undoChange, sameSource } from '../studio/agent/changes.mjs';
import { KnowledgeIndex, chunkDocument, terms } from '../studio/agent/retrieval.mjs';
import { executeSnapshot, SandboxRunner } from '../studio/agent/execution.mjs';
import { ToolSession, TOOL_DEFINITIONS } from '../studio/agent/tools.mjs';
import { runLocalAgent, parseRunFixture } from '../studio/agent/local-agent.mjs';
import { redactSecrets, privatePath } from '../studio/agent/safety.mjs';

let passed = 0;
async function check(name, work) { await work(); passed++; console.log('PASS ' + name); }
const project = () => ({ id: 'project-a', name: 'Test project', active: 'main.jimsabz', entry: 'main.jimsabz',
  files: [{ path: 'main.jimsabz', text: 'budhai 0\n', kind: 'source' }], madadgar: { memory: 'Use small functions.' } });
const runner = { execute: request => executeSnapshot(request) };
const chunks = JSON.parse(await readFile(new URL('../studio/agent/knowledge-index.json', import.meta.url), 'utf8'));
const session = (p = project()) => new ToolSession({ changes: new ChangeSet(p), runner, index: new KnowledgeIndex(chunks) });

await check('staged multi-file edits compile and execute while live files remain untouched', async () => {
  const live = project(), s = session(live);
  await s.call('read_file', { path: 'main.jimsabz' });
  await s.call('create_file', { path: 'modules/math.jimsabz', text: 'kam twice(adad n) -> adad { wapas n*2 }\n' });
  await s.call('edit_file', { path: 'main.jimsabz', text: 'kharna "modules/math.jimsabz"\nbudhai twice(21)\n' });
  const r = await s.call('execute_tests', { cases: [{ expectedOutput: '42\n' }] });
  assert.equal(r.passed, 1); assert.equal(live.files.length, 1); assert.equal(live.files[0].text, 'budhai 0\n');
  assert.equal(s.changes.apply(live).files.length, 3); // Includes the inferred module folder.
});
await check('existing files must be read before replacement or deletion', () => {
  const c = new ChangeSet(project());
  assert.throws(() => c.edit('main.jimsabz', 'budhai 1'), /Read the complete/);
  assert.throws(() => c.remove('main.jimsabz'), /Read the complete/);
});
await check('absolute/traversal/executable paths and case collisions are rejected', () => {
  for (const path of ['../escape.jimsabz', '/tmp/file.jimsabz', 'C:/x.jimsabz', 'evil.exe', 'main.jimsabz', 'MAIN.jimsabz'])
    assert.throws(() => new ChangeSet(project()).create(path, 'text'), undefined, path);
});
await check('stale drafts cannot overwrite subsequent user source edits', () => {
  const p = project(), c = new ChangeSet(p); c.read('main.jimsabz'); c.edit('main.jimsabz', 'budhai 2');
  p.files[0].text = 'budhai 99'; assert.throws(() => c.apply(p), /project changed/);
});
await check('a draft from another workspace is rejected even with identical files', () => {
  const c = new ChangeSet(project()); assert.throws(() => c.apply({ ...project(), id: 'project-b' }), /project changed/);
});
await check('rename updates entry and imported module paths using the actual file adapter', async () => {
  const p = project(); p.files.push({ path: 'math.jimsabz', kind: 'source', text: 'kam twice(adad x) -> adad { wapas x*2 }\n' });
  p.files[0].text = 'kharna "math.jimsabz"\nbudhai twice(5)';
  const c = new ChangeSet(p); c.read('math.jimsabz'); c.rename('math.jimsabz', 'modules/math.jimsabz');
  assert.match(c.draft.files[0].text, /modules\/math.jimsabz/);
  const r = await executeSnapshot({ action: 'run', files: c.draft.files, entry: c.draft.entry });
  assert.equal(r.run.output, '10\n');
});
await check('deletion goes to Trash only after Apply and undo restores exact source', () => {
  const p = project(); p.files.push({ path: 'unused.txt', text: 'keep this', kind: 'source' });
  const c = new ChangeSet(p); c.read('unused.txt'); c.remove('unused.txt'); const next = c.apply(p);
  assert.equal(p.files.length, 2); assert.equal(next.trash.length, 1);
  assert.ok(sameSource(undoChange(next, { before: p, after: next }), p));
});
await check('undo refuses later file edits and preserves unrelated newer project notes', () => {
  const before = project(), c = new ChangeSet(before); c.read('main.jimsabz'); c.edit('main.jimsabz', 'budhai 2'); const after = c.apply(before);
  const live = structuredClone(after); live.madadgar.memory = 'New manual notes.';
  assert.equal(undoChange(live, { before, after }).madadgar.memory, 'New manual notes.');
  live.files[0].text = 'budhai 99'; assert.throws(() => undoChange(live, { before, after }), /files changed/);
});
await check('staged memory refuses to overwrite later manual notes', () => {
  const p = project(), c = new ChangeSet(p); c.memory = 'Agent suggestion.'; p.madadgar.memory = 'Manual update.';
  assert.throws(() => c.apply(p), /notes changed/);
});
await check('applying a new program entry selects it so Run uses the verified entry', () => {
  const p = project(), c = new ChangeSet(p);
  c.create('second.jimsabz', 'budhai 2'); c.setEntry('second.jimsabz');
  const next = c.apply(p); assert.equal(next.entry, 'second.jimsabz'); assert.equal(next.active, 'second.jimsabz');
});
await check('private paths and secret-bearing draft/memory text are blocked', async () => {
  for (const path of ['.env', '.env.local', '.git/config', 'folder/id_rsa', 'client.key']) assert.ok(privatePath(path), path);
  const s = session(), secret = 'sk-proj-' + 'Z'.repeat(25);
  assert.equal(redactSecrets(secret), '[TOKEN REDACTED]');
  await assert.rejects(s.call('create_file', { path: 'token.txt', text: secret }), /secret/i);
  await assert.rejects(s.call('update_project_memory', { text: secret }), /secrets/);
  s.changes.draft.files.push({ path: '.env', text: 'PRIVATE=do-not-read', kind: 'source' });
  await assert.rejects(s.call('read_file', { path: '.env' }), /Private files/);
  assert.ok(!(await s.call('list_files', {})).files.some(f => f.path === '.env'));
});
await check('tool registry rejects unknown actions, unknown arguments and invalid types', async () => {
  const s = session(); assert.equal(TOOL_DEFINITIONS.length, 26);
  await assert.rejects(s.call('execute_shell', { command: 'anything' }), /Unknown/);
  await assert.rejects(s.call('list_files', { hidden: true }), /Unknown argument/);
  await assert.rejects(s.call('read_file', { path: 7 }), /string/);
});
await check('retrieval returns exact versioned source lines, with current profile above old brief', () => {
  const index = new KnowledgeIndex(chunks), r = index.search('isharo Boolean input budh output budhai');
  assert.ok(r.length); assert.equal(r[0].source, 'docs/MADADGAR-PROFILE.md');
  assert.ok(r[0].text.includes('Boolean')); assert.ok(r[0].startLine >= 1);
  const parts = chunkDocument('one\ntwo\nthree', 'report.txt', 'unverified', 4);
  assert.equal(parts[0].startLine, 1); assert.equal(parts[1].startLine, 2);
  assert.equal(index.search('nonexistent_nonsense_xyz').length, 0);
});
await check('English array/function queries retrieve real Jimsabz example code', async () => {
  const result = await session().call('search_examples', { query: 'arrays functions qatar kam' });
  assert.ok(result.length); assert.ok(result.every(r => /example|\.jimsabz/.test(r.source)));
  assert.ok(result.some(r => /qatar|kam/.test(r.text)));
});
await check('retrieval treats constructor and prototype-like words as ordinary untrusted text', () => {
  assert.ok(terms('constructor __proto__ toString').every(t => typeof t === 'string'));
  assert.doesNotThrow(() => new KnowledgeIndex(chunkDocument('constructor __proto__ toString', 'report.txt')).search('constructor'));
});
await check('compile-only evidence leaves runtime Not Run and includes seven real stages', async () => {
  const s = session(), r = await s.call('compile_jimsabz', {});
  assert.ok(r.ok); assert.equal(r.runtime, 'Not Run'); assert.equal(r.stages.length, 7); assert.equal(r.stages[6].state, 'ready');
});
await check('compiler failures expose real diagnostics and block later phases', async () => {
  const p = project(); p.files[0].text = 'budhai undeclared_name';
  const r = await executeSnapshot({ action: 'compile', entry: p.entry, files: p.files });
  assert.equal(r.ok, false); assert.match(r.diagnostics[0].code, /SEM/); assert.equal(r.diagnostics[0].at.file, p.entry);
  assert.notEqual(r.stages[4].state, 'passed');
});
await check('VM consumes supplied input, compares output and reports failed expectations', async () => {
  const p = project(); p.files[0].text = 'adad n = budh("N: ")\nbudhai n*n';
  const r = await executeSnapshot({ action: 'tests', entry: p.entry, files: p.files,
    cases: [{ inputs: ['-4'], expectedOutput: 'N: 16\n' }, { inputs: ['3'], expectedOutput: 'wrong\n' }] });
  assert.equal(r.passed, 1); assert.equal(r.failed, 1); assert.equal(r.tests[0].inputsConsumed, 1);
});
await check('missing inputs and runtime faults are reported, never fabricated as successful output', async () => {
  const p = project(); p.files[0].text = 'adad n=budh("N: ")\nbudhai n';
  let r = await executeSnapshot({ action: 'run', entry: p.entry, files: p.files });
  assert.equal(r.runtime, 'Failed'); assert.match(r.run.diagnostic.message, /Input is required/);
  p.files[0].text = 'qatar adad a=[1]\nbudhai a[3]';
  r = await executeSnapshot({ action: 'tests', entry: p.entry, files: p.files, cases: [{ expectedError: 'index' }] });
  assert.equal(r.passed, 1);
});
await check('test and compiler evidence becomes stale after another edit', async () => {
  const s = session(); await s.call('run_jimsabz', {}); await s.call('read_file', { path: 'main.jimsabz' });
  await s.call('edit_file', { path: 'main.jimsabz', text: 'budhai 7' });
  assert.equal((await s.call('get_runtime_output', {})).stale, true);
  assert.equal((await s.call('get_diagnostics', {})).stale, true);
});
await check('agent run file writes are confined to cloned runtime state', async () => {
  const p = project(); p.files[0].text = 'likh("note.txt", "runtime only")\nbudhai parh("note.txt")';
  const r = await executeSnapshot({ action: 'run', files: p.files, entry: p.entry });
  assert.equal(r.runtime, 'Passed'); assert.equal(r.run.output, 'runtime only\n'); assert.ok(r.run.writes.length);
  assert.equal(p.files.length, 1);
});
await check('agent runtime rejects networking and marks game initialization as headless', async () => {
  const p = project(); p.files[0].text = 'kharna shabak\nbudhai 1';
  await assert.rejects(executeSnapshot({ action: 'run', files: p.files, entry: p.entry }), /no network access/);
  p.files[0].text = 'kharna gui\nkhed "Test" {\nkhirki 400, 300\npichaan #112233\n}';
  const r = await executeSnapshot({ action: 'run', files: p.files, entry: p.entry, ticks: 2 });
  assert.equal(r.run.game.status, 'Initialized'); assert.match(r.run.game.detail, /not measured/);
});

const localModel = JSON.parse(await readFile(new URL('../studio/agent/model.json', import.meta.url), 'utf8'));
const local = (prompt, workspace = project(), extra = {}) => runLocalAgent({ prompt, workspace, chunks, model: localModel, runner, ...extra });
await check('local greeting and language answers require no model service configuration', async () => {
  const greeting = await local('salam'); assert.match(greeting.message, /local Jimsabz assistant/); assert.equal(greeting.changes.pending, false);
  const help = await local('Explain arrays in Jimsabz'); assert.match(help.message, /qatar/); assert.ok(help.references.length);
});
await check('the included trained classifier generates compiler-verified source locally', async () => {
  const live = project(), r = await local('Write a simple program that prints "Farhan"', live);
  assert.ok(r.local); assert.ok(r.canApply); assert.ok(r.evidence.ok); assert.equal(live.files[0].text, 'budhai 0\n');
  const output = await executeSnapshot({ action: 'run', entry: r.changes.draft.entry, files: r.changes.draft.files });
  assert.equal(output.run.output, 'Farhan\n');
});
await check('generation never contacts an external service when the local model is supplied', async () => {
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try { const r = await local('Write a marksheet for 7 subjects with average'); assert.equal(r.evidence.ok, true); }
  finally { globalThis.fetch = fetchBefore; }
});
await check('local programs use reusable arrays/functions for 1000 numeric inputs', async () => {
  const r = await local('Write a function to sum 1000 numbers and calculate their average using an array');
  assert.ok(r.canApply); const file = r.changes.draft.files.find(f => f.path === r.changes.draft.entry);
  assert.match(file.text, /qatar/); assert.match(file.text, /kam /);
  const result = await executeSnapshot({ action: 'run', entry: r.changes.draft.entry, files: r.changes.draft.files, inputs: Array(1000).fill('1') });
  assert.equal(result.runtime, 'Passed'); assert.match(result.run.output, /Kul: 1000\nAusat: 1\n$/);
});
await check('follow-up counts reuse the previous generator request without overwriting source', async () => {
  const first = await local('Write a marksheet for 7 subjects with average');
  const p = first.changes.apply(project()); p.madadgar = { ...p.madadgar, lastRequest: first.request, topic: first.topic };
  const old = p.files.map(f => ({ path: f.path, text: f.text }));
  const second = await local('Change to 12 subjects with average', p);
  assert.equal(second.evidence.ok, true); assert.notEqual(second.changes.draft.entry, first.changes.draft.entry);
  for (const f of old) assert.equal(second.changes.draft.files.find(x => x.path === f.path).text, f.text);
  assert.match(second.changes.draft.files.find(f => f.path === second.changes.draft.entry).text, /adad_barahn|12/);
});
await check('check current source reports actual phases and leaves runtime Not Run', async () => {
  const r = await local('Check my code'); assert.equal(r.evidence.ok, true); assert.equal(r.evidence.runtime, 'Not Run');
  assert.equal(r.changes.pending, false); assert.match(r.message, /Runtime: Not Run/);
});
await check('run and test requests consume explicit fixtures through the real VM', async () => {
  const p = project(); p.files[0].text = 'adad a=budh("")\nadad b=budh("")\nbudhai a+b';
  const r = await local('Run my code with inputs: [7,5]', p); assert.equal(r.runtime.run.output, '12\n');
  const test = await local(String.raw`Test my code with inputs: [7,5] expected output: "12\n"`, p);
  assert.equal(test.runtime.passed, 1); assert.equal(test.runtime.failed, 0);
});
await check('a test without expectations is Not Run and requests a concrete fixture', async () => {
  const r = await local('Test my code'); assert.equal(r.runtime, null); assert.match(r.message, /expected result/);
});
await check('input parsing rejects malformed arrays and never invents missing inputs', async () => {
  assert.throws(() => parseRunFixture('Run my code with inputs: [not json]'), /JSON input list/);
  const p = project(); p.files[0].text = 'adad a=budh("Number: ")\nbudhai a';
  const r = await local('Run my code', p); assert.equal(r.runtime.runtime, 'Failed'); assert.match(r.message, /Input is required/);
});
await check('fixture input strings preserve brackets, quotes, backslashes and Unicode', () => {
  const values = ['a]b', 'quote" and \\slash', 'سلام'];
  assert.deepEqual(parseRunFixture('Run my code with inputs: ' + JSON.stringify(values)).inputs, values);
});
await check('the local agent repairs a missing library import and verifies the complete draft', async () => {
  const p = project(); p.files[0].text = 'budhai sqrt(81)';
  const r = await local('Fix my code', p); assert.equal(r.canApply, true); assert.equal(r.evidence.ok, true);
  assert.match(r.changes.draft.files[0].text, /kharna hisab/); assert.equal(p.files[0].text, 'budhai sqrt(81)');
  const output = await executeSnapshot({ action: 'run', entry: r.changes.draft.entry, files: r.changes.draft.files });
  assert.equal(output.run.output, '9\n');
});
await check('lexer-based block repair ignores braces in strings and comments', async () => {
  const p = project(); p.files[0].text = 'jey (ha) {\nbudhai "}"\n// } is a comment\n';
  const r = await local('Fix my code', p); assert.equal(r.evidence.ok, true); assert.equal(r.canApply, true);
  const output = await executeSnapshot({ action: 'run', entry: r.changes.draft.entry, files: r.changes.draft.files });
  assert.equal(output.run.output, '}\n');
});
await check('legacy input repair changes only the diagnosed input spelling', async () => {
  const p = project(); p.files[0].text = 'adad n=budhai("N: ")\nbudhai n';
  const r = await local('Fix my code', p); assert.equal(r.evidence.ok, true); assert.equal(r.canApply, true);
  assert.match(r.changes.draft.files[0].text, /n=budh\("N: "\)/);
  assert.match(r.changes.draft.files[0].text, /\nbudhai n/);
});
await check('a module diagnostic repairs its own file while preserving its importer', async () => {
  const p = project(); p.files[0].text = 'kharna "math.jimsabz"\nbudhai squareRoot()';
  p.files.push({ path: 'math.jimsabz', text: 'kam squareRoot() -> dec { wapas sqrt(81) }', kind: 'source' });
  const r = await local('Fix my code', p); assert.equal(r.evidence.ok, true);
  assert.equal(r.changes.draft.files[0].text, p.files[0].text); assert.match(r.changes.draft.files[1].text, /kharna hisab/);
});
await check('unsupported repairs explain the actual error without changing files', async () => {
  const p = project(); p.files[0].text = 'budhai unknown_name';
  const r = await local('Fix my code', p); assert.equal(r.changes.pending, false); assert.match(r.message, /outside the local automatic fixes/);
});
await check('analyze and explain requests report real source structure without edits', async () => {
  const p = project(); p.files[0].text = 'kam twice(adad n)->adad { wapas n*2 }\nbudhai twice(7)';
  const r = await local('Explain this code', p); assert.match(r.message, /kam defines reusable functions/); assert.equal(r.changes.pending, false);
  const info = await local('Analyze my project', p); assert.match(info.message, /main.jimsabz/); assert.match(info.message, /1 Jimsabz source files/);
});
await check('project notes are retrievable as unverified context and stay separate by project', async () => {
  const p = project(); p.madadgar.memory = 'semester_policy_xyz uses a 75 point passing threshold.';
  const r = await local('Search documentation for semester_policy_xyz', p);
  assert.match(r.message, /75 point/); assert.ok(r.references.some(x => x.source === 'workspace/project-notes'));
  const other = await local('Search documentation for semester_policy_xyz', { ...project(), id: 'project-b' });
  assert.ok(!other.references.some(x => x.source === 'workspace/project-notes'));
});
await check('supplied Jimsabz code can use language features beyond the built-in generator intents', async () => {
  const source = 'kam identity<T>(T x) -> T { wapas x }\nbudhai identity(42)';
  const r = await local('Use this source as generic.jimsabz:\n```jimsabz\n' + source + '\n```');
  assert.equal(r.evidence.ok, true); const run = await executeSnapshot({ action: 'run', files: r.changes.draft.files, entry: r.changes.draft.entry });
  assert.equal(run.run.output, '42\n');
});
await check('invalid provided source remains an unapplied draft with Apply disabled', async () => {
  const r = await local('Use this:\n```jimsabz\nbudhai missing_identifier\n```');
  assert.equal(r.evidence.ok, false); assert.equal(r.canApply, false); assert.equal(r.changes.pending, true);
});
await check('an explicitly requested current-file replacement still needs review', async () => {
  const p = project(), r = await local('Replace my current program with this:\n```jimsabz\nbudhai 12\n```', p);
  assert.equal(r.changes.draft.files.filter(f => f.path.endsWith('.jimsabz')).length, 1);
  assert.equal(p.files[0].text, 'budhai 0\n'); assert.equal(r.changes.draft.files[0].text, 'budhai 12\n');
});
await check('reports are read locally and prepare an isolated folder with explicit remaining work', async () => {
  const r = await local('Build from this report', project(), { attachments: [{ name: 'Student System.txt', text: 'Create a marksheet for 7 subjects. Calculate percentage and grades. Add a database and authentication later.' }] });
  assert.ok(r.evidence.ok); assert.ok(r.changes.draft.entry.startsWith('Student-System/'));
  assert.ok(r.changes.draft.files.some(f => f.path.endsWith('PROJECT-PLAN.md'))); assert.match(r.message, /Remaining|Database|Authentication/i);
});
await check('repeated report generation chooses a new folder and preserves all old report files', async () => {
  const attachments = [{ name: 'Report.txt', text: 'Create a marksheet for 7 subjects and average.' }];
  const first = await local('Build from this report', project(), { attachments });
  const p = first.changes.apply(project()), before = structuredClone(p.files);
  const second = await local('Build from this report', p, { attachments });
  assert.ok(second.changes.draft.entry.startsWith('Report-2/'));
  for (const f of before) assert.deepEqual(second.changes.draft.files.find(x => x.path === f.path), f);
});
await check('unsupported game generation is honest about the available local builders', async () => {
  const r = await local('Build a complete football game'); assert.equal(r.changes.pending, false); assert.match(r.message, /outside my current code builders/);
});
await check('cancellation before local generation leaves the source untouched', async () => {
  const p = project(), before = structuredClone(p), c = new AbortController(); c.abort();
  await assert.rejects(local('Write a sum program', p, { signal: c.signal }), { name: 'AbortError' }); assert.deepEqual(p, before);
});
await check('agent source and native launcher contain no external model connection code', async () => {
  const panel = await readFile(new URL('../studio/agent/panel.mjs', import.meta.url), 'utf8');
  const app = await readFile(new URL('../studio/app.mjs', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/studio_win32.cpp', import.meta.url), 'utf8');
  assert.doesNotMatch(panel + app + host, /OllamaProvider|11434|__madadgar\/chat|agent-mode|madadgar-model/);
});
console.log(`\n${passed} built-in local agent checks passed with the real included classifier and compiler/VM.`);
