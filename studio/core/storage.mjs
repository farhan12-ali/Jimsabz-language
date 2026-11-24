export class WorkspaceStore {
  constructor() {
    this.db = null;
    this.memory = new Map();
    this.settings = new Map();
    this.persistent = false;
  }
  async open() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("jimsabz-studio-2", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("workspaces", { keyPath: "id" });
          request.result.createObjectStore("settings");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      this.persistent = true;
    } catch {
      this.persistent = false;
    }
    return this;
  }
  async request(store, mode, action) {
    if (!this.db) return undefined;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, mode),
        request = action(tx.objectStore(store));
      let result;
      request.onsuccess = () => (result = request.result);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error("The browser save was interrupted."));
    });
  }
  async list({ includeDeleted = false } = {}) {
    const items = this.db
      ? await this.request("workspaces", "readonly", (s) => s.getAll())
      : [...this.memory.values()].map(item => structuredClone(item));
    return items.filter(item => includeDeleted || !item.deletedAt).sort((a, b) => b.updated - a.updated);
  }
  async get(id) {
    return this.db ? this.request("workspaces", "readonly", s => s.get(id)) : structuredClone(this.memory.get(id));
  }
  async save(workspace, { restore = false } = {}) {
    workspace.updated = Date.now();
    if (!this.db) {
      if (this.memory.get(workspace.id)?.deletedAt && !workspace.deletedAt && !restore)
        throw new Error("This folder was deleted in another tab. Restore it from Trash first.");
      this.memory.set(workspace.id, structuredClone(workspace));
      return;
    }
    // Check the tombstone and write in one transaction; stale tabs cannot revive deletions.
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("workspaces", "readwrite"), objectStore = tx.objectStore("workspaces");
      let failure;
      const request = objectStore.get(workspace.id);
      request.onsuccess = () => {
        try {
          if (request.result?.deletedAt && !workspace.deletedAt && !restore)
            throw new Error("This folder was deleted in another tab. Restore it from Trash first.");
          objectStore.put(workspace);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error("The browser save was interrupted."));
    });
  }
  async restoreWorkspace(id) {
    const item = await this.get(id);
    if (!item?.deletedAt) throw new Error("That deleted folder is no longer available.");
    delete item.deletedAt;
    await this.save(item, { restore: true });
    return item;
  }
  async setting(key, value) {
    if (!this.db) {
      if (value !== undefined) this.settings.set(key, value);
      return this.settings.get(key);
    }
    if (value === undefined)
      return this.request("settings", "readonly", (s) => s.get(key));
    return this.request("settings", "readwrite", (s) => s.put(value, key));
  }
}
export function workspace(
  name,
  kind = "folder",
  code = 'budhai = "Farhan"\n',
  filename = "",
) {
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    active: filename || name + ".jimsabz",
    entry: filename || name + ".jimsabz",
    created: Date.now(),
    updated: Date.now(),
    files: [
      { path: filename || name + ".jimsabz", text: code, kind: "source" },
    ],
  };
}
