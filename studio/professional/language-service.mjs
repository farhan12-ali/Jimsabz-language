import { compile } from '../core/compiler.mjs';
import { lex, Parser } from '../core/language.mjs';
import { vocabulary } from '../core/suggestions.mjs';

export const identifier = /^[\p{L}_][\p{L}\p{M}\p{N}_]*$/u;
const reserved = new Set([...vocabulary.map(x => x[0]), ...'ha na paan andar rok agty'.split(' ')]);
const clean = text => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
export function offsetAt(text, at) {
  const lines = clean(text).split('\n');
  return lines.slice(0, Math.max(0, at.line - 1)).reduce((n, x) => n + x.length + 1, 0) + at.col - 1;
}
export function locationAt(text, offset, file) {
  const before = text.slice(0, offset).split('\n');
  return { file, line: before.length, col: before.at(-1).length + 1 };
}
export function wordAt(text, offset) {
  const part = /[\p{L}\p{M}\p{N}_]/u;
  let start = offset, end = offset;
  while (start > 0 && part.test(text[start - 1])) start--;
  while (end < text.length && part.test(text[end])) end++;
  return { start, end, text: text.slice(start, end) };
}

// Bind declarations from the real parser. Compiler results remain authoritative.
// Refactoring is deliberately restricted to unambiguous variables, parameters,
// and non-overloaded free functions; members/generics are navigation-only.
function buildIndex(files) {
  const global = { id: 0, parent: null, symbols: [], start: 0, end: Infinity };
  const scopes = [global], symbols = [], references = [], unresolved = [], parsed = [];
  const addScope = (parent, file, start, end) => {
    const scope = { id: scopes.length, parent: parent.id, file, start, end, symbols: [] };
    scopes.push(scope); return scope;
  };
  for (const file of files) {
    let tokens, tree;
    try { tokens = lex(clean(file.text), file.path); tree = new Parser(tokens).parse(); } catch { continue; }
    tokens = tokens.map(t => ({ ...t, start: offsetAt(file.text, t.at) }));
    const pairs = new Map(), stack = [];
    for (const t of tokens) {
      if (t.kind === 'symbol' && t.text === '{') stack.push(t.start);
      if (t.kind === 'symbol' && t.text === '}' && stack.length) pairs.set(stack.pop(), t.start + 1);
    }
    const tokenFor = (node, name = node.text, after = offsetAt(file.text, node.at), until = Infinity) =>
      tokens.find(t => t.kind === 'word' && t.text === name && t.start >= after && t.start < until);
    const declaration = (node, scope, kind, token, extra = {}) => {
      if (!token) return;
      const symbol = { id: symbols.length, name: token.text, kind, type: node.type || '', file: file.path,
        at: token.at, start: token.start, end: token.start + token.text.length, scope: scope.id,
        params: node.params || [], ...extra };
      symbols.push(symbol); scope.symbols.push(symbol.id);
      references.push({ symbol: symbol.id, file: file.path, at: token.at, start: symbol.start, end: symbol.end, declaration: true });
      return symbol;
    };
    const visit = (node, scope = global, owner = '') => {
      const start = offsetAt(file.text, node.at);
      if (node.kind === 'block') {
        scope = addScope(scope, file.path, start, pairs.get(start) ?? start);
      }
      if (['function', 'lambda'].includes(node.kind)) {
        const body = node.children.find(n => n.kind === 'block');
        const bodyStart = body ? offsetAt(file.text, body.at) : file.text.indexOf('\n', start);
        if (node.kind === 'function') declaration(node, scope, owner ? 'method' : 'function', tokenFor(node, node.text, start, bodyStart < 0 ? Infinity : bodyStart), { owner, generic: !!node.generics?.length });
        const fn = addScope(scope, file.path, start, body ? pairs.get(bodyStart) ?? file.text.length : (bodyStart < 0 ? file.text.length : bodyStart));
        const open = tokens.find(t => t.start >= start && t.kind === 'symbol' && t.text === '(');
        let cursor = (open?.start ?? start) + 1;
        for (const [type, name] of node.params || []) {
          const token = tokenFor(node, name, cursor, bodyStart < 0 ? Infinity : bodyStart);
          if (token) { declaration({ type }, fn, 'parameter', token); cursor = token.start + name.length; }
        }
        for (const value of node.defaults || []) if (value) visit(value, fn, owner);
        for (const child of node.children) visit(child, fn, owner);
        return;
      }
      if (node.kind === 'class') {
        declaration(node, scope, 'class', tokenFor(node));
        const open = tokens.find(t => t.start >= start && t.text === '{');
        scope = addScope(scope, file.path, start, pairs.get(open?.start) ?? file.text.length);
        owner = node.text; scope.owner = owner;
      }
      if (node.kind === 'var') { const fieldOwner = scope.owner || ''; declaration(node, scope, fieldOwner ? 'field' : node.fixed ? 'constant' : 'variable', tokenFor(node), { owner: fieldOwner }); }
      if (node.kind === 'foreach') {
        // The collection expression is evaluated before the loop variable exists.
        visit(node.children[0], scope, owner);
        const block = node.children[1], b = offsetAt(file.text, block.at);
        const loop = addScope(scope, file.path, start, pairs.get(b) ?? file.text.length);
        declaration(node, loop, 'variable', tokenFor(node)); visit(block, loop, owner); return;
      }
      if (node.kind === 'for') {
        const block = node.children.at(-1), b = offsetAt(file.text, block.at);
        scope = addScope(scope, file.path, start, pairs.get(b) ?? file.text.length);
      }
      if (node.kind === 'try') {
        visit(node.children[0], scope, owner);
        const handler = node.children[1], b = offsetAt(file.text, handler.at);
        const keyword = tokens.find(t => t.kind === 'word' && t.text === 'pakar' && t.start >= start);
        const token = tokenFor(node, node.text, keyword?.start ?? b, b);
        const caught = addScope(scope, file.path, keyword?.start ?? b, pairs.get(b) ?? file.text.length);
        declaration({ type: 'lafz' }, caught, 'parameter', token);
        visit(handler, caught, owner); return;
      }
      if (node.kind === 'name') unresolved.push({ node, scope: scope.id, file, start });
      for (const child of node.children || []) visit(child, scope, owner);
    };
    visit(tree); parsed.push(file.path);
  }
  const resolve = (name, scopeId, offset, file) => {
    for (let scope = scopes[scopeId]; scope; scope = scopes[scope.parent]) {
      const matches = scope.symbols.map(id => symbols[id]).filter(s => s.name === name &&
        (['function', 'class', 'method', 'parameter', 'field'].includes(s.kind) || s.file !== file || s.start <= offset));
      if (matches.length) return matches.length === 1 ? matches[0] : null;
    }
    return null;
  };
  for (const { node, scope, file, start } of unresolved) {
    const symbol = resolve(node.text, scope, start, file.path);
    if (symbol) references.push({ symbol: symbol.id, file: file.path, at: node.at, start, end: start + node.text.length });
  }
  return { symbols, references, scopes: scopes.map(({ symbols, ...s }) => s), parsed };
}

export async function analyzeProject(files, entry) {
  const normalized = files.filter(f => typeof f.text === 'string').map(f => ({ ...f, text: clean(f.text) }));
  const result = await compile(files, entry);
  const linked = new Set((result.tokens || []).map(t => t.at.file)); linked.add(entry);
  const index = buildIndex(normalized.filter(f => linked.has(f.path)));
  return { ok: result.ok, diagnostics: result.diagnostics, ...index,
    signatures: Object.values(result.analysis?.functions || {}).map(f => ({ name: f.text, params: f.params, type: f.type, at: f.at })),
    classes: Object.entries(result.analysis?.classes || {}).map(([name, c]) => ({ name,
      fields: c.fields.map(f => ({ name: f.text, type: f.type })), methods: c.methods.map(m => ({ name: m.text, params: m.params, type: m.type })) })),
    elapsed: result.stages.reduce((n, s) => n + (s.ms || 0), 0) };
}
export function symbolAt(index, file, offset) {
  const ref = index.references.find(r => r.file === file && r.start <= offset && offset <= r.end);
  return ref ? index.symbols.find(s => s.id === ref.symbol) : null;
}
export function signature(symbol) {
  return ['function', 'method'].includes(symbol.kind)
    ? `${symbol.name}(${symbol.params.map(([t, n]) => t + ' ' + n).join(', ')}) -> ${symbol.type}`
    : `${symbol.type || symbol.kind} ${symbol.name}`;
}
export function completions(index, file, code, offset) {
  const before = code.slice(0, offset), prefix = before.match(/[\p{L}_][\p{L}\p{M}\p{N}_]*$/u)?.[0] || '';
  const member = before.match(/([\p{L}_][\p{L}\p{M}\p{N}_]*)\.([\p{L}\p{M}\p{N}_]*)$/u);
  if (member) {
    const base = index.symbols.find(s => s.name === member[1] && s.file === file);
    const cls = index.classes.find(c => c.name === base?.type);
    const items = cls ? [...cls.fields.map(f => ({ ...f, kind: 'field' })), ...cls.methods.map(f => ({ ...f, kind: 'method' }))] : [];
    return items.filter(s => s.name.startsWith(member[2])).map(s => [s.name, s.name, signature(s)]);
  }
  const inside = index.scopes.filter(s => s.file === file && s.start <= offset && offset <= s.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  const valid = new Set([0]); let cursor = inside;
  while (cursor) { valid.add(cursor.id); cursor = index.scopes.find(s => s.id === cursor.parent); }
  const seen = new Set(), items = [];
  for (const s of [...index.symbols].reverse()) {
    if (seen.has(s.name) || !valid.has(s.scope) || s.owner || !s.name.startsWith(prefix)) continue;
    if (['variable', 'constant'].includes(s.kind) && s.file === file && s.start > offset) continue;
    seen.add(s.name); items.push([s.name, s.name, signature(s)]);
  }
  for (const item of vocabulary) if (item[0].startsWith(prefix) && !seen.has(item[0])) items.push(item);
  return items.slice(0, 40);
}

export function renameEdits(index, files, file, offset, name) {
  if (!index.ok) throw new Error('Build a valid program before renaming symbols.');
  if (!identifier.test(name) || reserved.has(name) || name.startsWith('adad_')) throw new Error('Use a new Jimsabz identifier that is not a keyword.');
  const symbol = symbolAt(index, file, offset);
  if (!symbol || !['variable', 'constant', 'parameter', 'function'].includes(symbol.kind) || symbol.owner || symbol.generic)
    throw new Error('Safe rename supports variables, parameters, and non-generic free functions. Select one of those names.');
  if (name === symbol.name) throw new Error('Choose a different name.');
  // A conservative project-wide collision check avoids introducing capture.
  if (index.symbols.some(s => s.name === name)) throw new Error('That name already exists in this program. Choose another to avoid changing bindings.');
  if (index.symbols.filter(s => s.name === symbol.name && s.scope === symbol.scope).length !== 1)
    throw new Error('Overloaded or ambiguous declarations cannot be safely renamed.');
  if (files.some(f => typeof f.text === 'string' && (/\r|^\uFEFF/.test(f.text))))
    throw new Error('Format the files to normalize line endings before renaming.');
  const refs = index.references.filter(r => r.symbol === symbol.id);
  // Named arguments carry parameter names outside ordinary name-expression nodes.
  if (symbol.kind === 'parameter' && files.some(f => typeof f.text === 'string' && new RegExp('\\b' + symbol.name + '\\s*:').test(f.text)))
    throw new Error('This parameter may be used as a named argument. Rename it manually with the call sites.');
  return files.map(f => {
    const edits = refs.filter(r => r.file === f.path).sort((a, b) => b.start - a.start);
    if (!edits.length) return f;
    let text = f.text;
    for (const r of edits) {
      if (text.slice(r.start, r.end) !== symbol.name) throw new Error('Source changed. Refresh the analysis and try again.');
      text = text.slice(0, r.start) + name + text.slice(r.end);
    }
    return { ...f, text };
  });
}

// Reindent only: preserve every newline/token and comment/string contents.
export function formatSource(source) {
  source = clean(source);
  const tokens = lex(source), byLine = new Map();
  for (const t of tokens) {
    if (!byLine.has(t.at.line)) byLine.set(t.at.line, []);
    byLine.get(t.at.line).push(t);
  }
  let depth = 0, blockComment = false;
  const lines = source.split('\n').map((line, i) => {
    const ts = (byLine.get(i + 1) || []).filter(t => !['nl', 'end', 'string'].includes(t.kind));
    const startsInComment = blockComment;
    let quote = false;
    for (let p = 0; p < line.length; p++) {
      if (blockComment) { if (line.slice(p, p + 2) === '*/') { blockComment = false; p++; } continue; }
      if (!quote && line.slice(p, p + 2) === '//') break;
      if (!quote && line.slice(p, p + 2) === '/*') { blockComment = true; p++; continue; }
      if (line[p] === '\\' && quote) { p++; continue; }
      if (line[p] === '"') quote = !quote;
    }
    let leadingClose = 0;
    for (const t of ts) { if (t.kind === 'symbol' && t.text === '}') leadingClose++; else break; }
    const formatted = startsInComment ? line : line.trim() ? '    '.repeat(Math.max(0, depth - leadingClose)) + line.trimStart().trimEnd() : '';
    for (const t of ts) { if (t.kind === 'symbol' && t.text === '{') depth++; else if (t.kind === 'symbol' && t.text === '}') depth = Math.max(0, depth - 1); }
    return formatted;
  });
  return lines.join('\n');
}
