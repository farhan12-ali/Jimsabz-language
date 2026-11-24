import { validatePath, createItem, renameItem, trashItems } from '../core/files.mjs';
import { containsSecrets, privatePath } from './safety.mjs';

const clone = value => structuredClone(value);
function comparable(workspace) {
  return JSON.stringify({ id: workspace.id, entry: workspace.entry, files: workspace.files,
    trash: workspace.trash || [] }, (_, v) => typeof v === 'bigint' ? String(v) : v);
}
export function sameSource(left, right) { return comparable(left) === comparable(right); }
function editable(path) {
  path = validatePath(path);
  if (privatePath(path) || !/\.(?:jimsabz|md|txt|json|csv)$/i.test(path))
    throw new Error('Agent edits support Jimsabz source, Markdown, text, JSON and CSV inside the project; private files are excluded.');
  return path;
}
function validText(text) {
  if (typeof text !== 'string' || text.length > 256000) throw new Error('A draft file must contain at most 256,000 characters.');
  if (containsSecrets(text)) throw new Error('A potential secret was detected. Use a placeholder before saving this draft.');
  return text;
}
export function lineDiff(before = '', after = '') {
  const a = before.split('\n'), b = after.split('\n');
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - end - 1] === b[b.length - end - 1]) end++;
  if (before === after) return { added: 0, removed: 0, text: 'No text changes.' };
  const removed = a.slice(start, a.length - end), added = b.slice(start, b.length - end);
  return { added: added.length, removed: removed.length,
    text: `@@ line ${start + 1} @@\n` + [...a.slice(Math.max(0, start - 2), start).map(l => '  ' + l),
      ...removed.map(l => '- ' + l), ...added.map(l => '+ ' + l), ...a.slice(a.length - end, a.length - end + 2).map(l => '  ' + l)].join('\n') };
}
export class ChangeSet {
  constructor(workspace) {
    this.base = clone(workspace);
    this.draft = clone(workspace);
    this.reads = new Set();
    this.revision = 0;
    this.memory = undefined;
  }
  file(path) {
    path = validatePath(path);
    if (privatePath(path)) throw new Error('Private files cannot be read by the agent.');
    const file = this.draft.files.find(f => f.path === path && f.kind !== 'folder');
    if (!file) throw new Error('File not found: ' + path);
    return file;
  }
  read(path) {
    const file = this.file(path);
    if (typeof file.text !== 'string') throw new Error('This file is binary. Use inspect_asset for its metadata.');
    this.reads.add(file.path);
    return file.text;
  }
  requireRead(path) {
    if (!this.reads.has(path)) throw new Error('Read the complete file with read_file before changing it: ' + path);
  }
  create(path, text) {
    path = editable(path); validText(text);
    if (this.draft.files.filter(f => typeof f.text === 'string').reduce((n, f) => n + f.text.length, 0) + text.length > 2000000)
      throw new Error('The agent draft exceeds its 2 million character project limit.');
    const next = createItem(this.draft, 'file', path);
    next.files.find(f => f.path === path).text = text;
    this.draft = next; this.reads.add(path); this.revision++;
    return { staged: true, path, characters: text.length };
  }
  edit(path, text) {
    path = editable(path); this.file(path); this.requireRead(path); validText(text);
    if (this.draft.files.filter(f => f.path !== path && typeof f.text === 'string').reduce((n, f) => n + f.text.length, 0) + text.length > 2000000)
      throw new Error('The agent draft exceeds its project size limit.');
    this.draft.files.find(f => f.path === path).text = text; this.revision++;
    return { staged: true, path, characters: text.length };
  }
  remove(path) {
    path = editable(path); this.file(path); this.requireRead(path);
    this.draft = trashItems(this.draft, 'file', path); this.revision++;
    return { staged: true, path, destination: 'Trash after Apply changes' };
  }
  rename(path, target) {
    path = editable(path); target = editable(target); this.file(path); this.requireRead(path);
    this.draft = renameItem(this.draft, 'file', path, target).workspace;
    this.reads.delete(path); this.reads.add(target); this.revision++;
    return { staged: true, path, target };
  }
  setEntry(path) {
    path = editable(path); this.file(path);
    if (!path.endsWith('.jimsabz')) throw new Error('The entry must be a .jimsabz source file.');
    this.draft.entry = path; this.revision++;
    return { staged: true, entry: path };
  }
  list() {
    const before = new Map(this.base.files.map(f => [f.path, f])), after = new Map(this.draft.files.map(f => [f.path, f]));
    const paths = [...new Set([...before.keys(), ...after.keys()])];
    return paths.flatMap(path => {
      const a = before.get(path), b = after.get(path);
      if ((a?.text === b?.text && !!a === !!b) || (a?.kind === 'folder' && b?.kind === 'folder')) return [];
      return [{ path, operation: !a ? 'Create' : !b ? 'Delete' : 'Edit', before: a?.text || '', after: b?.text || '',
        ...lineDiff(a?.text || '', b?.text || '') }];
    });
  }
  get pending() { return !sameSource(this.base, this.draft) || this.memory !== undefined; }
  apply(current) {
    if (!sameSource(this.base, current)) throw new Error('The project changed after this draft was prepared. Reject it and ask again using the current files.');
    if (this.memory !== undefined && (this.base.madadgar?.memory || '') !== (current.madadgar?.memory || ''))
      throw new Error('Project notes changed after this draft was prepared. Ask again using the current notes.');
    const next = { ...current, files: clone(this.draft.files), trash: clone(this.draft.trash || []), entry: this.draft.entry };
    if (next.entry !== current.entry) next.active = next.entry;
    if (!next.files.some(f => f.path === next.active && f.kind !== 'folder')) next.active = next.entry || next.files.find(f => f.kind !== 'folder')?.path || '';
    if (this.memory !== undefined) next.madadgar = { ...current.madadgar, memory: this.memory };
    return next;
  }
}
export function undoChange(current, record) {
  if (!record || !sameSource(current, record.after)) throw new Error('The files changed after Apply. Undo is unavailable; use the reviewed changes to restore individual lines.');
  const memoryChanged = (record.before.madadgar?.memory || '') !== (record.after.madadgar?.memory || '');
  if (memoryChanged && (current.madadgar?.memory || '') !== (record.after.madadgar?.memory || '')) throw new Error('Project notes changed after Apply. Undo cannot overwrite those notes.');
  return { ...current, files: clone(record.before.files), trash: clone(record.before.trash || []), entry: record.before.entry,
    active: record.before.active, madadgar: { ...current.madadgar, memory: memoryChanged ? record.before.madadgar?.memory || '' : current.madadgar?.memory || '' } };
}
