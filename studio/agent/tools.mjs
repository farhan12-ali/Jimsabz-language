import { validatePath } from '../core/files.mjs';
import { safeText, textArgument, privatePath } from './safety.mjs';

const string = { type: 'string' }, strings = { type: 'array', items: string };
const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const define = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: object(properties, required) } });
const testCase = object({ name: string, inputs: strings, expectedOutput: string, expectedError: string, ticks: { type: 'integer' } });
const cases = { type: 'array', items: testCase };
export const TOOL_DEFINITIONS = [
  define('list_files', 'List paths and sizes in the isolated project draft.'),
  define('read_file', 'Read a complete text file before editing it. Private files are excluded.', { path: string }, ['path']),
  define('search_files', 'Search a literal text fragment in nonprivate project files.', { query: string }, ['query']),
  define('create_file', 'Stage a new relative .jimsabz, .md, .txt, .json or .csv file.', { path: string, text: string }, ['path', 'text']),
  define('edit_file', 'Stage complete replacement text after read_file. Live files are unchanged.', { path: string, text: string }, ['path', 'text']),
  define('delete_file', 'Stage moving a previously read file to Trash. Requires user change review.', { path: string }, ['path']),
  define('rename_file', 'Stage a previously read file move/rename and rewrite relative module imports.', { path: string, target: string }, ['path', 'target']),
  define('set_entry', 'Set the .jimsabz entry in the isolated draft.', { path: string }, ['path']),
  define('compile_jimsabz', 'Run the real Studio compiler on the current draft, without executing the program.', { entry: string }),
  define('get_diagnostics', 'Get the most recent real compiler diagnostics and whether they are stale.'),
  define('inspect_bytecode', 'Compile this draft and inspect generated stack instructions.', { entry: string }),
  define('run_jimsabz', 'Compile/run this draft in an isolated worker with supplied inputs. Optional 0-120 headless game ticks.', { entry: string, inputs: strings, ticks: { type: 'integer' } }),
  define('get_runtime_output', 'Read actual output from the last run/test and its stale status.'),
  define('generate_tests', 'Store explicit test cases with independently reasoned expected output or expected error. This does not execute tests.', { cases }, ['cases']),
  define('execute_tests', 'Execute supplied cases (or cases from generate_tests). Exact output comparison or expected error matching.', { entry: string, cases }),
  define('analyze_project', 'Report real paths, source line counts, entry and detected asset metadata.'),
  define('generate_project_report', 'Stage a Markdown report at a new path, using factual project evidence.', { path: string, text: string }, ['path', 'text']),
  define('search_documentation', 'Hybrid local BM25 and hashed lexical vector search. Returns versioned citations and exact excerpts.', { query: string }, ['query']),
  define('retrieve_api_reference', 'Retrieve documented Jimsabz keyword/API references.', { query: string }, ['query']),
  define('search_examples', 'Retrieve verified example code snippets.', { query: string }, ['query']),
  define('list_assets', 'List actual non-source assets and byte counts.'),
  define('inspect_asset', 'Inspect an existing asset path, MIME type and byte count. Does not fabricate images/audio.', { path: string }, ['path']),
  define('validate_assets', 'Run the real compiler including asset validation.', { entry: string }),
  define('update_plan', 'Publish a short task plan and factual task states, without private reasoning.', { tasks: { type: 'array', items: object({ title: string, state: { type: 'string', enum: ['Pending', 'In Progress', 'Completed', 'Failed', 'Waiting for Approval'] } }, ['title', 'state']) } }, ['tasks']),
  define('get_project_memory', 'Inspect the current project notes.'),
  define('update_project_memory', 'Stage replacement project notes for user review. Never store credentials.', { text: string }, ['text']),
];
function validate(value, schema, label = 'arguments') {
  if (schema.type === 'object') {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(label + ' must be an object.');
    for (const key of schema.required || []) if (!(key in value)) throw new Error('Missing argument: ' + key);
    for (const [key, v] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties, key)) throw new Error('Unknown argument: ' + key);
      validate(v, schema.properties[key], key);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > 2000) throw new Error(label + ' must be a bounded array.');
    value.forEach(v => validate(v, schema.items, label));
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value)) throw new Error(label + ' must be an integer.');
  } else if (typeof value !== schema.type) throw new Error(label + ' must be ' + schema.type + '.');
  if (schema.enum && !schema.enum.includes(value)) throw new Error('Unsupported ' + label + '.');
}
export class ToolSession {
  constructor({ changes, runner, index, signal, onEvent = () => {} }) {
    Object.assign(this, { changes, runner, index, signal, onEvent });
    this.evidence = null; this.runtime = null; this.evidenceRevision = -1; this.runtimeRevision = -1;
    this.references = new Map(); this.plan = []; this.cases = [];
  }
  referencesFor(query, examplesOnly = false) {
    const found = this.index.search(query, examplesOnly ? 12 : 6).filter(c => !examplesOnly || /example|\.jimsabz/i.test(c.source)).slice(0, 6);
    return found.map(c => {
      if (!this.references.has(c.id)) this.references.set(c.id, { ...c, citation: 'K' + (this.references.size + 1) });
      const item = this.references.get(c.id);
      return { citation: `[${item.citation}]`, source: c.source, version: c.version, lines: `${c.startLine}-${c.endLine}`, text: c.text };
    });
  }
  async execute(action, args = {}) {
    const entry = args.entry ? validatePath(args.entry) : this.changes.draft.entry;
    const result = await this.runner.execute({ action, files: this.changes.draft.files, entry,
      inputs: args.inputs || [], ticks: args.ticks || 0, cases: args.cases || this.cases }, this.signal);
    this.evidence = result; this.evidenceRevision = this.changes.revision;
    if (action !== 'compile') { this.runtime = result; this.runtimeRevision = this.changes.revision; }
    return result;
  }
  async call(name, args) {
    this.signal?.throwIfAborted();
    const tool = TOOL_DEFINITIONS.find(t => t.function.name === name);
    if (!tool) throw new Error('Unknown or unavailable tool: ' + String(name).slice(0, 80));
    validate(args, tool.function.parameters);
    const c = this.changes;
    switch (name) {
      case 'list_files': return { entry: c.draft.entry, files: c.draft.files.slice(0, 1000).filter(f => !privatePath(f.path)).map(f => ({ path: f.path, kind: f.kind,
        characters: f.text?.length, bytes: f.data?.byteLength })) };
      case 'read_file': {
        const path = textArgument(args, 'path', 240), text = c.read(path);
        if (text.length > 256000) { c.reads.delete(path); throw new Error('This file exceeds the local agent file limit of 256,000 characters.'); }
        return { path, text: safeText(text, 256000) };
      }
      case 'search_files': {
        const query = textArgument(args, 'query', 300), matches = [];
        for (const file of c.draft.files) if (typeof file.text === 'string' && !privatePath(file.path)) {
          for (const [i, line] of file.text.split('\n').entries()) if (line.includes(query) && matches.length < 60)
            matches.push({ path: file.path, line: i + 1, text: safeText(line, 500) });
        }
        return { matches, limit: 60 };
      }
      case 'create_file': case 'generate_project_report': return c.create(textArgument(args, 'path', 240), textArgument(args, 'text', 256000, { empty: true }));
      case 'edit_file': return c.edit(textArgument(args, 'path', 240), textArgument(args, 'text', 256000, { empty: true }));
      case 'delete_file': return c.remove(textArgument(args, 'path', 240));
      case 'rename_file': return c.rename(textArgument(args, 'path', 240), textArgument(args, 'target', 240));
      case 'set_entry': return c.setEntry(textArgument(args, 'path', 240));
      case 'compile_jimsabz': case 'validate_assets': return this.execute('compile', args);
      case 'inspect_bytecode': { const r = await this.execute('compile', args); return { ok: r.ok, bytecodeText: r.bytecodeText, diagnostics: r.diagnostics }; }
      case 'get_diagnostics': return { status: this.evidence ? 'Available' : 'Not Run', stale: this.evidenceRevision !== c.revision,
        diagnostics: this.evidence?.diagnostics || [], stages: this.evidence?.stages || [] };
      case 'run_jimsabz': return this.execute('run', args);
      case 'get_runtime_output': return { status: this.runtime?.runtime || 'Not Run', stale: this.runtimeRevision !== c.revision, run: this.runtime?.run, tests: this.runtime?.tests };
      case 'generate_tests': {
        if (!args.cases.length || args.cases.length > 20 || args.cases.some(t => typeof t.expectedOutput !== 'string' && typeof t.expectedError !== 'string'))
          throw new Error('Provide 1-20 cases, each with expectedOutput or expectedError.');
        this.cases = structuredClone(args.cases); return { status: 'Not Run', cases: this.cases.length };
      }
      case 'execute_tests': return this.execute('tests', args);
      case 'analyze_project': return { name: c.draft.name, entry: c.draft.entry, files: c.draft.files.length,
        sources: c.draft.files.filter(f => f.path.endsWith('.jimsabz')).map(f => ({ path: f.path, lines: (f.text || '').split('\n').length })),
        pendingChanges: c.list().map(({ path, operation }) => ({ path, operation })),
        capabilities: ['built-in trained intent classifier', 'Jimsabz program generators', 'Studio compiler and VM', 'isolated draft edits', 'headless tests', 'versioned local documentation'],
        unavailable: ['arbitrary natural-language code synthesis', 'shell/OS file access', 'Git operations', 'web search', 'native execution through this agent', 'image/audio creation'] };
      case 'search_documentation': case 'retrieve_api_reference': case 'search_examples': return this.referencesFor(textArgument(args, 'query', 500), name === 'search_examples');
      case 'list_assets': return c.draft.files.filter(f => f.kind !== 'folder' && !f.path.endsWith('.jimsabz') && !privatePath(f.path))
        .map(f => ({ path: f.path, mime: f.mime || 'unknown', bytes: f.data?.byteLength, characters: f.text?.length }));
      case 'inspect_asset': { const f = c.file(textArgument(args, 'path', 240)); return { path: f.path, mime: f.mime || 'unknown', bytes: f.data?.byteLength, characters: f.text?.length }; }
      case 'update_plan': {
        if (args.tasks.length > 20 || args.tasks.some(t => t.title.length > 200)) throw new Error('Use at most 20 short task titles.');
        this.plan = args.tasks.map(t => ({ title: safeText(t.title, 200), state: t.state }));
        this.onEvent({ type: 'plan', tasks: this.plan }); return { tasks: this.plan };
      }
      case 'get_project_memory': return { text: safeText(c.memory ?? c.base.madadgar?.memory ?? '', 8000), staged: c.memory !== undefined };
      case 'update_project_memory': {
        const text = textArgument(args, 'text', 8000, { empty: true });
        if (safeText(text) !== text) throw new Error('Potential secrets are not allowed in project memory.');
        c.memory = text; return { staged: true, characters: text.length };
      }
    }
  }
}
