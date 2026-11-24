import { lex, normalizePath, resolveModule } from "./language.mjs";

const key = path => path.toLocaleLowerCase("en-US");
export const inside = (path, folder) => path === folder || path.startsWith(folder + "/");
export const isFile = item => item.kind !== "folder";
export function validateName(value) {
  const name = String(value).trim();
  if (!name || /[<>:"|?*\x00-\x1f/\\]/.test(name) || /^\.+$/.test(name) ||
      /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    throw new Error("Choose a valid file or folder name without reserved characters or a trailing dot.");
  return name;
}
export function validatePath(value) {
  const path = String(value).trim().replaceAll("\\", "/");
  if (!path || path.length > 240 || path.startsWith("/") || path.split("/").some(p => !p || p !== p.trim()))
    throw new Error("Use a relative path inside this folder, up to 240 characters.");
  path.split("/").forEach(validateName);
  return normalizePath(path);
}
export function folderPaths(files) {
  const folders = new Set();
  for (const item of files) {
    const parts = item.path.split("/");
    if (isFile(item)) parts.pop();
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }
  return folders;
}
function withFolders(files, folders = folderPaths(files)) {
  const explicit = new Set(files.filter(f => !isFile(f)).map(f => f.path));
  return [...files, ...[...folders].filter(path => !explicit.has(path)).map(path => ({ path, kind: "folder" }))];
}
function validateLayout(files) {
  const names = new Set(), regular = new Set(files.filter(isFile).map(f => key(f.path)));
  for (const item of files) {
    validatePath(item.path);
    const name = key(item.path);
    if (names.has(name)) throw new Error("A file or folder already uses that name: " + item.path);
    names.add(name);
    const parts = item.path.split("/");
    parts.pop();
    for (let i = 1; i <= parts.length; i++)
      if (regular.has(key(parts.slice(0, i).join("/"))))
        throw new Error("A file blocks that folder path: " + item.path);
  }
  // Windows folder names are case-insensitive, including inferred directories.
  const folders = new Map();
  for (const name of folderPaths(files)) {
    const previous = folders.get(key(name));
    if (previous && previous !== name) throw new Error("Use the existing folder spelling: " + previous);
    folders.set(key(name), name);
  }
}
export function fileTree(files) {
  const root = { children: new Map() };
  for (const item of files) {
    let parent = root;
    const parts = item.path.split("/");
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join("/");
      const kind = i < parts.length - 1 || !isFile(item) ? "folder" : "file";
      if (!parent.children.has(name)) parent.children.set(name, { name, path, kind, children: new Map() });
      parent = parent.children.get(name);
    });
  }
  const sorted = node => [...node.children.values()]
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1))
    .map(child => ({ ...child, children: sorted(child) }));
  return sorted(root);
}
export function createItem(workspace, kind, input) {
  let path = validatePath(input);
  if (kind === "file" && !path.split("/").at(-1).includes(".")) path += ".jimsabz";
  if (folderPaths(workspace.files).has(path) || workspace.files.some(f => key(f.path) === key(path)))
    throw new Error("A file or folder already uses that name.");
  const files = withFolders([...workspace.files, kind === "folder" ? { path, kind: "folder" } : { path, kind: "source", text: "" }]);
  validateLayout(files);
  return { ...workspace, files, active: kind === "file" ? path : workspace.active,
    entry: workspace.entry || (kind === "file" && path.endsWith(".jimsabz") ? path : "") };
}
function relativePath(from, target) {
  const a = from.split("/").slice(0, -1), b = target.split("/");
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return [...a.slice(common).map(() => ".."), ...b.slice(common)].join("/");
}
function rewriteImports(text, from, to, moved) {
  const source = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let tokens;
  try { tokens = lex(source, from); } catch { return { text, warning: from }; }
  const offsets = [0], edits = [];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") offsets.push(i + 1);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i].kind !== "word" || !["kharna", "acha"].includes(tokens[i].text) || tokens[i + 1].kind !== "string") continue;
    const token = tokens[i + 1];
    let target;
    try { target = resolveModule(from, token.text); } catch { continue; }
    const replacement = relativePath(to, moved.get(target) || target);
    if (replacement === token.text || (!moved.has(target) && from === to)) continue;
    let start = offsets[token.at.line - 1] + token.at.col - 1, end = start + 1;
    if (source[start] !== '"') continue;
    while (end < source.length) {
      if (source[end] === "\\") { end += 2; continue; }
      if (source[end++] === '"') break;
    }
    edits.push({ start, end, text: JSON.stringify(replacement) });
  }
  let result = source;
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return { text: edits.length ? result : text };
}
export function renameItem(workspace, kind, path, input) {
  let next = validatePath(input);
  if (kind === "file" && path.endsWith(".jimsabz") && !next.split("/").at(-1).includes(".")) next += ".jimsabz";
  const found = kind === "folder" ? folderPaths(workspace.files).has(path) : workspace.files.some(f => f.path === path && isFile(f));
  if (!found) throw new Error("That file or folder is no longer available.");
  if (kind === "folder" && next !== path && inside(next, path)) throw new Error("A folder cannot be moved inside itself.");
  if (next === path) return { workspace, warnings: [] };
  const affected = item => kind === "folder" ? inside(item.path, path) : item.path === path;
  const moved = new Map(workspace.files.filter(affected).map(f => [f.path, next + f.path.slice(path.length)]));
  const existingFolders = folderPaths(workspace.files.filter(f => !affected(f)));
  if ([...existingFolders].some(name => key(name) === key(next))) throw new Error("A folder already uses that name.");
  const warnings = [];
  let files = workspace.files.map(item => {
    const destination = moved.get(item.path) || item.path;
    const rewritten = item.path.endsWith(".jimsabz") && typeof item.text === "string"
      ? rewriteImports(item.text, item.path, destination, moved) : { text: item.text };
    if (rewritten.warning) warnings.push(rewritten.warning);
    return { ...item, path: destination, ...(typeof item.text === "string" ? { text: rewritten.text } : {}) };
  });
  files = withFolders(files, new Set([...folderPaths(workspace.files)].map(folder => kind === "folder" && inside(folder, path) ? next + folder.slice(path.length) : folder)));
  validateLayout(files);
  const entry = moved.get(workspace.entry) || workspace.entry;
  return { workspace: { ...workspace, files, active: moved.get(workspace.active) || workspace.active,
    entry: entry.endsWith(".jimsabz") ? entry : files.find(f => isFile(f) && f.path.endsWith(".jimsabz"))?.path || "" }, warnings };
}
export function trashItems(workspace, kind, path, id = crypto.randomUUID()) {
  const removed = workspace.files.filter(f => kind === "folder" ? inside(f.path, path) : f.path === path && isFile(f));
  if (!removed.length) throw new Error("That file or folder is no longer available.");
  const files = withFolders(workspace.files.filter(f => !removed.includes(f)), new Set([...folderPaths(workspace.files)].filter(folder => kind !== "folder" || !inside(folder, path))));
  const source = files.find(f => isFile(f) && f.path.endsWith(".jimsabz"))?.path || "";
  const live = name => files.some(f => isFile(f) && f.path === name);
  const entry = live(workspace.entry) ? workspace.entry : source;
  const active = live(workspace.active) ? workspace.active : entry || files.find(isFile)?.path || "";
  return { ...workspace, files, entry, active, trash: [...(workspace.trash || []),
    { id, kind, path, deletedAt: Date.now(), files: removed, active: workspace.active, entry: workspace.entry }] };
}
export function restoreItems(workspace, id) {
  const item = workspace.trash?.find(t => t.id === id);
  if (!item) throw new Error("That deleted item is no longer available.");
  const files = [...workspace.files, ...item.files];
  validateLayout(files);
  const restoredSource = item.files.find(f => isFile(f) && f.path.endsWith(".jimsabz"))?.path;
  return { ...workspace, files, entry: workspace.entry || restoredSource || "",
    active: item.files.find(f => f.path === item.active && isFile(f))?.path || restoredSource || item.files.find(isFile)?.path || workspace.active,
    trash: workspace.trash.filter(t => t.id !== id) };
}
