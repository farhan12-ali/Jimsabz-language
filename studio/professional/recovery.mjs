const localJournal = () => { try { return globalThis.localStorage; } catch { return null; } };
const clone = project => structuredClone(project);
const sizeOf = project => project.files.reduce((n, f) => n + (f.text?.length * 2 || f.bytes?.byteLength || 0), 0);
export function fileFingerprint(file) {
  return typeof file.text === 'string' ? 'text:' + file.text : 'bytes:' + Array.from(file.bytes || []).join(',');
}
export function sameFiles(a, b) {
  if (a.files.length !== b.files.length || a.entry !== b.entry) return false;
  const map = new Map(b.files.map(f => [f.path, fileFingerprint(f)]));
  return a.files.every(f => map.get(f.path) === fileFingerprint(f));
}
export class RecoveryVault {
  constructor({ indexedDB = globalThis.indexedDB, journal = localJournal() } = {}) {
    this.indexedDB = indexedDB; this.journal = journal; this.memory = new Map(); this.db = null;
    this.queue = Promise.resolve(); this.last = new Map();
  }
  async open() {
    if (!this.indexedDB) return this;
    this.db = await new Promise((resolve, reject) => {
      const request = this.indexedDB.open('jimsabz-recovery-1', 1);
      request.onupgradeneeded = () => {
        const snapshots = request.result.createObjectStore('snapshots', { keyPath: 'id' });
        snapshots.createIndex('project', 'project');
        request.result.createObjectStore('links');
      };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }).catch(() => null);
    return this;
  }
  async transaction(name, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(name, mode); let value;
      const request = fn(tx.objectStore(name));
      if (request) request.onsuccess = () => { value = request.result; };
      tx.oncomplete = () => resolve(value); tx.onabort = tx.onerror = () => reject(tx.error || new Error('Recovery storage could not be updated.'));
    });
  }
  journalEdit(project, path, text) {
    // Synchronous write-ahead record covers the normal asynchronous save delay.
    if (!this.journal || text.length > 250000) return;
    try { this.journal.setItem('jimsabz-journal:' + project.id, JSON.stringify({ project: project.id, path, text, time: Date.now() })); }
    catch { /* Normal save/history still operate when the small journal is full. */ }
  }
  pending(project) {
    try {
      const entry = JSON.parse(this.journal?.getItem('jimsabz-journal:' + project.id) || 'null');
      if (!entry || typeof entry.text !== 'string' || !project.files.some(f => f.path === entry.path)) return null;
      if (project.files.find(f => f.path === entry.path).text === entry.text) { this.clearJournal(project.id); return null; }
      return entry;
    } catch { return null; }
  }
  clearJournal(id) { try { this.journal?.removeItem('jimsabz-journal:' + id); } catch {} }
  record(project, reason = 'Autosave', { force = false } = {}) {
    const value = clone(project);
    this.queue = this.queue.catch(() => {}).then(async () => {
      const last = this.last.get(value.id);
      if (!force && last && sameFiles(last, value)) return null;
      if (sizeOf(value) > 16 * 1024 * 1024) throw new Error('This project exceeds the 16 MiB history limit. Export a backup instead.');
      this.clock = Math.max(Date.now(), (this.clock || 0) + 1);
      const item = { id: crypto.randomUUID(), project: value.id, time: this.clock, reason, workspace: value, bytes: sizeOf(value) };
      if (this.db) await this.transaction('snapshots', 'readwrite', s => s.put(item));
      else this.memory.set(item.id, item);
      this.last.set(value.id, value);
      const all = await this.list(value.id); let bytes = 0;
      for (const [i, old] of all.entries()) {
        bytes += old.bytes || 0;
        if (i >= 40 || (bytes > 32 * 1024 * 1024 && i > 0)) {
          if (this.db) await this.transaction('snapshots', 'readwrite', s => s.delete(old.id));
          else this.memory.delete(old.id);
        }
      }
      return item;
    });
    return this.queue;
  }
  async list(project) {
    const all = this.db ? await this.transaction('snapshots', 'readonly', s => s.index('project').getAll(project))
      : [...this.memory.values()].filter(x => x.project === project);
    return all.sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));
  }
  async link(id, handle) {
    if (!this.db) throw new Error('Persistent browser storage is needed to remember a folder link.');
    if (handle !== undefined) await this.transaction('links', 'readwrite', s => s.put(handle, id));
    return this.transaction('links', 'readonly', s => s.get(id));
  }
}

export class FolderSync {
  constructor(handle) { this.handle = handle; this.baseline = new Map(); }
  async permission() {
    if (await this.handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
    return await this.handle.requestPermission({ mode: 'readwrite' }) === 'granted';
  }
  async file(path, create = false) {
    const parts = path.split('/');
    if (parts.some(p => !p || p === '.' || p === '..' || /[\\:\x00-\x1f]/.test(p)) || parts.some(p => p.toLowerCase() === '.git')) throw new Error('Unsafe folder path.');
    let directory = this.handle;
    for (const name of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(name, { create });
    return directory.getFileHandle(parts.at(-1), { create });
  }
  async bytes(path) {
    try { const file = await (await this.file(path)).getFile(); return new Uint8Array(await file.arrayBuffer()); }
    catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  data(file) { return typeof file.text === 'string' ? new TextEncoder().encode(file.text) : new Uint8Array(file.bytes || []); }
  key(bytes) { return bytes === null ? null : Array.from(bytes).join(','); }
  async plan(project) {
    const rows = [];
    for (const file of project.files.filter(f => f.kind !== 'folder')) {
      const disk = this.key(await this.bytes(file.path)), incoming = this.key(this.data(file)), previous = this.baseline.get(file.path);
      rows.push({ path: file.path, state: disk === incoming ? 'Unchanged' : disk !== null && (previous === undefined || disk !== previous) ? 'Conflict' : 'Save', disk });
    }
    return rows;
  }
  async save(project, reviewed) {
    if (!(await this.permission())) throw new Error('Folder write permission was not granted.');
    const fresh = await this.plan(project);
    if (fresh.some(row => row.state === 'Conflict')) throw new Error('Files differ on disk. Import or resolve those changes before saving.');
    if (fresh.some(row => reviewed.find(r => r.path === row.path)?.disk !== row.disk)) throw new Error('The folder changed after review. Review it again.');
    // Recheck immediately before each write. Never delete disk files.
    let written = 0;
    for (const row of fresh) {
      const file = project.files.find(f => f.path === row.path);
      if (this.key(await this.bytes(row.path)) !== row.disk) throw new Error('A file changed during saving. Review the folder again.');
      if (row.state === 'Save') {
        const stream = await (await this.file(row.path, true)).createWritable();
        try { await stream.write(this.data(file)); await stream.close(); written++; }
        catch (error) { await stream.abort().catch(() => {}); throw error; }
      }
      this.baseline.set(row.path, this.key(this.data(file)));
    }
    return written;
  }
}
