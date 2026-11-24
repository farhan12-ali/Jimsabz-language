import assert from "node:assert/strict";
import { createItem, renameItem, trashItems, restoreItems, folderPaths, fileTree, validatePath } from "../studio/core/files.mjs";
import { WorkspaceStore } from "../studio/core/storage.mjs";
import { zipFiles, Reader } from "../studio/core/binary.mjs";
import { compile } from "../studio/core/compiler.mjs";
import { VM } from "../studio/core/vm.mjs";

let passed = 0;
async function check(name, action) { await action(); passed++; console.log("PASS " + name); }
const file = (path, text = "") => ({ path, text, kind: "source" });
const ws = files => ({ id: "test-workspace", name: "farhan", kind: "folder", files, active: files.find(f => f.kind !== "folder")?.path || "", entry: files.find(f => f.path.endsWith(".jimsabz"))?.path || "" });
const paths = workspace => workspace.files.map(f => f.path).sort();
async function output(workspace) {
  const result = await compile(workspace.files, workspace.entry);
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  let text = "";
  await new VM(result.program, { print: s => text += s }).run();
  return text;
}
await check("valid relative Unicode and nested paths", () => {
  for (const path of ["farhan.jimsabz", "scripts/player.jimsabz", "نالو/نام.jimsabz", "assets/car image.png"])
    assert.equal(validatePath(path), path);
});
await check("unsafe paths and Windows-reserved names are rejected", () => {
  for (const path of ["../file", "a/../file", "/abs", "C:/file", "a//b", "a/./b", "a./x", "a /x", "CON.jimsabz", "a/NUL", "LPT1.txt", "a?", "a/ b"])
    assert.throws(() => validatePath(path), undefined, path);
});
await check("explorer infers folders and sorts folders before files", () => {
  const tree = fileTree([file("z.jimsabz"), file("scripts/b.jimsabz"), file("scripts/a.jimsabz"), { path: "empty", kind: "folder" }]);
  assert.deepEqual(tree.map(n => [n.name, n.kind]), [["empty", "folder"], ["scripts", "folder"], ["z.jimsabz", "file"]]);
  assert.deepEqual(tree[1].children.map(n => n.name), ["a.jimsabz", "b.jimsabz"]);
});
await check("create files and empty folders without changing existing source", () => {
  const original = ws([file("main.jimsabz", 'budhai "saved"')]);
  let next = createItem(original, "folder", "scripts");
  next = createItem(next, "file", "scripts/farhan");
  assert.ok(next.files.some(f => f.path === "scripts" && f.kind === "folder"));
  assert.equal(next.active, "scripts/farhan.jimsabz");
  assert.deepEqual(paths(original), ["main.jimsabz"]);
  assert.equal(original.files[0].text, 'budhai "saved"');
});
await check("a folder ending in .jimsabz is never a program entry", () => {
  const next = createItem(ws([]), "folder", "notes.jimsabz");
  assert.equal(next.entry, ""); assert.equal(next.active, "");
});
await check("duplicate paths and file/folder collisions are atomic", () => {
  for (const [base, kind, path] of [
    [ws([file("main.jimsabz")]), "file", "MAIN.jimsabz"],
    [ws([file("scripts/a.jimsabz")]), "folder", "scripts"],
    [ws([file("scripts")]), "file", "scripts/a.jimsabz"],
    [ws([file("Scripts/a.jimsabz")]), "file", "scripts/b.jimsabz"],
  ]) { const before = structuredClone(base); assert.throws(() => createItem(base, kind, path)); assert.deepEqual(base, before); }
});
await check("folder rename preserves children, binary assets, active file and entry", () => {
  const base = ws([file("scripts/main.jimsabz", "budhai 7"), { path: "scripts/pixel.bin", bytes: new Uint8Array([0, 7, 255]), kind: "asset" }, { path: "scripts/empty", kind: "folder" }]);
  const { workspace: next } = renameItem(base, "folder", "scripts", "source");
  assert.equal(next.entry, "source/main.jimsabz"); assert.equal(next.active, next.entry);
  assert.deepEqual(next.files.find(f => f.path === "source/pixel.bin").bytes, new Uint8Array([0, 7, 255]));
  assert.ok(folderPaths(next.files).has("source/empty"));
  assert.ok(base.files.every(f => f.path.startsWith("scripts/")));
});
await check("renamed module imports still compile and execute", async () => {
  const base = ws([file("main.jimsabz", 'kharna "scripts/math.jimsabz"\nbudhai double(6)'), file("scripts/math.jimsabz", "kam double(adad n) -> adad { wapas n * 2 }")]);
  assert.equal(await output(base), "12\n");
  const next = renameItem(base, "folder", "scripts", "lib").workspace;
  assert.match(next.files[0].text, /kharna "lib\/math.jimsabz"/);
  assert.equal(await output(next), "12\n");
});
await check("moving an importing file recalculates its relative imports", async () => {
  const base = ws([file("main.jimsabz", 'kharna "modules/math.jimsabz"\nbudhai double(9)'), file("modules/math.jimsabz", "kam double(adad n) -> adad { wapas n * 2 }")]);
  const next = renameItem(base, "file", "main.jimsabz", "scripts/main.jimsabz").workspace;
  assert.match(next.files.find(f => f.path === next.entry).text, /"\.\.\/modules\/math.jimsabz"/);
  assert.equal(await output(next), "18\n");
});
await check("imports inside a moved folder keep working together", async () => {
  const base = ws([file("old/main.jimsabz", 'kharna "math.jimsabz"\nbudhai double(4)'), file("old/math.jimsabz", "kam double(adad n) -> adad { wapas n * 2 }")]);
  assert.equal(await output(renameItem(base, "folder", "old", "new/source").workspace), "8\n");
});
await check("rename does not rewrite normal strings, comments or built-in imports", () => {
  const source = '// kharna "math.jimsabz"\n/* kharna "math.jimsabz" */\nkharna hisab\nlfaz = "math.jimsabz"';
  const base = ws([file("main.jimsabz", source), file("math.jimsabz", "")]);
  assert.equal(renameItem(base, "file", "math.jimsabz", "lib.jimsabz").workspace.files[0].text, source);
});
await check("rename reports lexical errors without losing that file's contents", () => {
  const source = 'kharna "math.jimsabz"\n@';
  const result = renameItem(ws([file("main.jimsabz", source), file("math.jimsabz")]), "file", "math.jimsabz", "lib.jimsabz");
  assert.deepEqual(result.warnings, ["main.jimsabz"]); assert.equal(result.workspace.files[0].text, source);
});
await check("rename refuses existing destinations and moving a folder into itself", () => {
  const base = ws([file("a/main.jimsabz"), file("b/main.jimsabz"), file("root.jimsabz")]);
  const before = structuredClone(base);
  assert.throws(() => renameItem(base, "folder", "a", "a/inside"));
  assert.throws(() => renameItem(base, "folder", "a", "b"));
  assert.throws(() => renameItem(ws([file("root.txt"), file("b/main.jimsabz")]), "file", "root.txt", "b"));
  assert.throws(() => renameItem(base, "file", "root.jimsabz", "b/MAIN.jimsabz"));
  assert.deepEqual(base, before);
});
await check("case-only rename works and source extensions are convenient", () => {
  const base = ws([file("scripts/main.jimsabz")]);
  const next = renameItem(base, "folder", "scripts", "Scripts").workspace;
  assert.equal(next.entry, "Scripts/main.jimsabz");
  assert.equal(renameItem(next, "file", next.entry, "Scripts/Farhan").workspace.entry, "Scripts/Farhan.jimsabz");
});
await check("renaming the last source to a text file clears its program entry", () => {
  const next = renameItem(ws([file("main.jimsabz")]), "file", "main.jimsabz", "notes.txt").workspace;
  assert.equal(next.active, "notes.txt"); assert.equal(next.entry, "");
});
await check("moving the last file out of a folder preserves its empty parent", () => {
  const next = renameItem(ws([file("old/main.jimsabz")]), "file", "old/main.jimsabz", "main.jimsabz").workspace;
  assert.ok(next.files.some(f => f.kind === "folder" && f.path === "old"));
});
await check("delete file selects another source and keeps parent folders", () => {
  const base = ws([file("scripts/main.jimsabz", "original"), file("other.jimsabz", "other")]);
  const next = trashItems(base, "file", base.entry, "trash-one");
  assert.equal(next.entry, "other.jimsabz"); assert.equal(next.active, next.entry);
  assert.ok(folderPaths(next.files).has("scripts")); assert.equal(next.trash[0].files[0].text, "original");
  assert.equal(base.files.length, 2);
});
await check("delete folder uses a path boundary and keeps unrelated folders", () => {
  const base = ws([file("a/b/one.jimsabz"), file("a/b/two.jimsabz"), file("a/bigger/keep.jimsabz")]);
  const next = trashItems(base, "folder", "a/b", "trash-folder");
  assert.ok(next.files.some(f => f.path === "a/bigger/keep.jimsabz"));
  assert.equal(next.trash[0].files.length, 2); assert.ok(folderPaths(next.files).has("a"));
});
await check("deleting the last source leaves an empty editable workspace", () => {
  const next = trashItems(ws([file("main.jimsabz")]), "file", "main.jimsabz", "last");
  assert.equal(next.active, ""); assert.equal(next.entry, ""); assert.equal(next.files.length, 0);
  const restored = restoreItems(next, "last"); assert.equal(restored.entry, "main.jimsabz"); assert.equal(restored.active, restored.entry);
});
await check("restore folder recovers Unicode source, empty folders and binary bytes", () => {
  const base = ws([file("scripts/main.jimsabz", 'budhai "سلام"'), { path: "scripts/empty", kind: "folder" }, { path: "scripts/asset.bin", bytes: new Uint8Array([0, 255]), kind: "asset" }]);
  const restored = restoreItems(trashItems(base, "folder", "scripts", "folder"), "folder");
  assert.equal(restored.trash.length, 0); assert.equal(restored.files.find(f => f.path === base.entry).text, base.files[0].text);
  assert.deepEqual(restored.files.find(f => f.path.endsWith(".bin")).bytes, base.files[2].bytes);
  assert.ok(folderPaths(restored.files).has("scripts/empty"));
});
await check("restore refuses to overwrite a newly created path", () => {
  const deleted = trashItems(ws([file("main.jimsabz", "original")]), "file", "main.jimsabz", "original");
  const next = createItem(deleted, "file", "MAIN.jimsabz");
  const before = structuredClone(next);
  assert.throws(() => restoreItems(next, "original")); assert.deepEqual(next, before);
  assert.equal(next.trash[0].files[0].text, "original");
});
await check("invalid delete and restore targets do not change data", () => {
  const base = ws([file("main.jimsabz")]), before = structuredClone(base);
  assert.throws(() => trashItems(base, "folder", "missing"));
  assert.throws(() => restoreItems(base, "missing")); assert.deepEqual(base, before);
});
await check("ZIP export preserves empty folder entries and excludes Trash", () => {
  const deleted = trashItems(ws([file("old.jimsabz", "secret")]), "file", "old.jimsabz", "old");
  const next = createItem(deleted, "folder", "empty/nested");
  const bytes = zipFiles(next.name, next.files), reader = new Reader(bytes), names = [];
  while (reader.u32() === 0x04034b50) {
    reader.p += 14;
    const size = reader.u32(); reader.p += 4;
    const length = reader.view.getUint16(reader.p, true), extra = reader.view.getUint16(reader.p + 2, true); reader.p += 4;
    names.push(new TextDecoder().decode(bytes.slice(reader.p, reader.p + length))); reader.p += length + extra + size;
  }
  assert.ok(names.includes("farhan/empty/nested/")); assert.ok(names.includes("farhan/empty/"));
  assert.ok(!names.some(n => n.includes("old.jimsabz")));
});
await check("whole folders move out of the workspace list and restore with stable IDs", async () => {
  const store = new WorkspaceStore(), original = ws([file("main.jimsabz", "saved")]);
  await store.save(original); await store.save({ ...original, deletedAt: Date.now() });
  assert.equal((await store.list()).length, 0); assert.equal((await store.list({ includeDeleted: true })).length, 1);
  const restored = await store.restoreWorkspace(original.id); assert.equal(restored.id, original.id); assert.equal(restored.files[0].text, "saved");
  assert.equal((await store.list()).length, 1);
});
await check("a stale tab cannot silently resurrect a deleted folder", async () => {
  const store = new WorkspaceStore(), original = ws([file("main.jimsabz")]);
  await store.save(original); await store.save({ ...original, deletedAt: Date.now() });
  await assert.rejects(store.save(original), /deleted in another tab/);
  assert.equal((await store.list()).length, 0);
});
await check("Trash and saved records survive cloning without sharing mutable state", async () => {
  const store = new WorkspaceStore(), original = trashItems(ws([file("main.jimsabz", "saved")]), "file", "main.jimsabz", "old");
  await store.save(original);
  const read = await store.get(original.id); read.trash[0].files[0].text = "changed";
  assert.equal((await store.get(original.id)).trash[0].files[0].text, "saved");
});
console.log(`${passed}/${passed} file, folder, Trash, import and export checks passed.`);
