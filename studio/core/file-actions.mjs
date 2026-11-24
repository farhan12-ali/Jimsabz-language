import { createItem, renameItem, trashItems, restoreItems, validateName, isFile } from "./files.mjs";

export class FileActions {
  constructor(options) { Object.assign(this, options); this.busy = false; }
  guard() {
    if (this.busy) return false;
    if (this.isWriting()) { this.toast("Stop writing before changing files or folders."); return false; }
    return true;
  }
  async perform(operation, button, close = true) {
    if (!this.guard()) return false;
    this.busy = true;
    if (button) button.disabled = true;
    try {
      await operation();
      if (close) document.querySelector("#modal").close();
      return true;
    } catch (error) {
      const target = document.querySelector("#file-operation-error");
      if (target) target.textContent = error.message;
      else this.toast(error.message);
      return false;
    } finally {
      this.busy = false;
      if (button?.isConnected) button.disabled = false;
    }
  }
  prompt(title, label, value, submit, handler) {
    if (!this.guard()) return;
    this.modal(title, `<form id="file-operation-form"><label for="file-operation-name">${this.escape(label)}</label><input id="file-operation-name" maxlength="240" required autocomplete="off"><p>Changes apply to this Studio workspace. Original disk files stay unchanged; export the folder to save its updated structure.</p><p id="file-operation-error" class="operation-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" id="file-operation-cancel">Cancel</button><button type="submit" class="button primary" id="file-operation-submit">${this.escape(submit)}</button></div></form>`, "FILES & FOLDERS");
    const input = document.querySelector("#file-operation-name");
    input.value = value;
    document.querySelector("#file-operation-cancel").onclick = () => document.querySelector("#modal").close();
    document.querySelector("#file-operation-form").onsubmit = event => {
      event.preventDefault();
      this.perform(() => handler(input.value), document.querySelector("#file-operation-submit"));
    };
    input.focus(); input.select();
  }
  create(kind, parent = "") {
    this.prompt(kind === "file" ? "Add a file" : "Add a subfolder", kind === "file" ? "File path, including .jimsabz" : "Folder path",
      (parent ? parent + "/" : "") + (kind === "file" ? "new-file.jimsabz" : "new-folder"), kind === "file" ? "Create file" : "Create folder", async value => {
        const next = createItem(this.getWorkspace(), kind, value);
        await this.commit(next);
        this.toast(kind === "file" ? "File created." : "Folder created.");
      });
  }
  rename(kind, path) {
    const workspace = this.getWorkspace();
    if (kind === "file" && !path) return;
    this.prompt(kind === "file" ? "Rename file" : "Rename folder", kind === "workspace" ? "Folder name" : kind === "file" ? "File path" : "Folder path",
      kind === "workspace" ? workspace.name : path, "Rename", async value => {
        let next, warnings = [];
        if (kind === "workspace") next = { ...this.getWorkspace(), name: validateName(value) };
        else ({ workspace: next, warnings } = renameItem(this.getWorkspace(), kind, path, value));
        await this.commit(next);
        this.toast(warnings.length ? "Renamed. Check imports in files with lexical errors: " + warnings.join(", ") : "Renamed. Jimsabz import paths updated where needed; check any asset paths in your code.");
      });
  }
  delete(kind, path) {
    if (!this.guard()) return;
    const workspace = this.getWorkspace(), name = kind === "workspace" ? workspace.name : path;
    const affected = workspace.files.filter(item => kind === "workspace" || item.path === path || (kind === "folder" && item.path.startsWith(path + "/")));
    const count = affected.filter(isFile).length;
    this.modal(`Delete ${kind === "file" ? "file" : "folder"}?`, `<p>Move <strong>${this.escape(name)}</strong> to Trash?</p><p>${count} ${count === 1 ? "file" : "files"}${kind === "file" ? "" : " and its contained subfolders"} will be removed from this workspace. You can restore ${kind === "file" ? "it" : "them"} from Trash.</p><p>Original disk files stay unchanged. Code that uses deleted files may need updating.</p><p id="file-operation-error" class="operation-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" id="delete-cancel">Cancel</button><button class="button danger-button" id="delete-confirm">Move to Trash</button></div>`, "REVIEW DELETION");
    document.querySelector("#delete-cancel").onclick = () => document.querySelector("#modal").close();
    const button = document.querySelector("#delete-confirm");
    button.onclick = () => this.perform(async () => {
      const latest = this.getWorkspace();
      if (latest.id !== workspace.id) throw new Error("The active folder changed. Select the item again.");
      await this.commit(kind === "workspace" ? { ...latest, deletedAt: Date.now() } : trashItems(latest, kind, path));
      this.toast("Moved to Trash. Open Trash to restore it.");
    }, button);
    document.querySelector("#delete-cancel").focus();
  }
  async showTrash() {
    if (!this.guard()) return;
    try {
      const workspaces = await this.store.list({ includeDeleted: true }), entries = [];
      for (const workspace of workspaces) {
        if (workspace.deletedAt) entries.push({ workspace, kind: "workspace", name: workspace.name, count: workspace.files.filter(isFile).length });
        else for (const item of workspace.trash || []) entries.push({ workspace, item, kind: item.kind, name: item.path, count: item.files.filter(isFile).length });
      }
      this.modal("Trash", `<p>Deleted files and folders stay here until you restore them. Restoring never overwrites an existing path.</p><div class="trash-list">${entries.map((entry, index) => `<div class="trash-item"><div><strong>${this.escape(entry.name)}</strong><span>${entry.kind === "workspace" ? "Whole folder" : entry.kind === "folder" ? "Subfolder" : "File"} · ${entry.count} ${entry.count === 1 ? "file" : "files"} · ${this.escape(entry.workspace.name)}</span></div><button class="button secondary" data-restore="${index}" aria-label="Restore ${this.escape(entry.name)} in ${this.escape(entry.workspace.name)}">Restore</button></div>`).join("") || '<p class="trash-empty">Trash is empty.</p>'}</div><p id="file-operation-error" class="operation-error" role="alert"></p><div class="modal-actions"><button class="button secondary" id="trash-close">Close</button></div>`, "RESTORE YOUR WORK");
      document.querySelector("#trash-close").onclick = () => document.querySelector("#modal").close();
      document.querySelectorAll("[data-restore]").forEach(button => {
        button.onclick = async () => {
          const entry = entries[Number(button.dataset.restore)];
          const ok = await this.perform(async () => {
            if (entry.kind === "workspace") {
              await this.select(await this.store.restoreWorkspace(entry.workspace.id));
            } else {
              const latest = entry.workspace.id === this.getWorkspace().id ? this.getWorkspace() : await this.store.get(entry.workspace.id);
              if (!latest || latest.deletedAt) throw new Error("Restore the containing folder first.");
              const next = restoreItems(latest, entry.item.id);
              if (latest.id === this.getWorkspace().id) await this.commit(next);
              else await this.store.save(next);
            }
            this.toast("Restored " + entry.name + ".");
          }, button, false);
          if (ok) await this.showTrash();
        };
      });
      document.querySelector("#trash-close").focus();
    } catch (error) { this.toast(error.message); }
  }
}
