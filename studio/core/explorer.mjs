import { fileTree } from "./files.mjs";

export class FileExplorer {
  constructor(tree, menu, icon, actions) {
    Object.assign(this, { tree, menu, icon, actions });
    this.collapsed = new Set();
    document.addEventListener("pointerdown", event => {
      if (!menu.contains(event.target) && !event.target.closest("[data-explorer-actions]")) this.closeMenu();
    });
    menu.addEventListener("keydown", event => {
      const buttons = [...menu.querySelectorAll("button")], at = buttons.indexOf(document.activeElement);
      if (event.key === "Escape" || event.key === "Tab") { this.closeMenu(true); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    });
  }
  closeMenu(focus = false) {
    this.menu.hidden = true;
    this.anchor?.setAttribute("aria-expanded", "false");
    if (focus) this.anchor?.focus();
  }
  toggleMenu(kind, path, anchor) {
    if (!this.menu.hidden && this.anchor === anchor) this.closeMenu(true);
    else this.showMenu(kind, path, anchor);
  }
  showMenu(kind, path, anchor, point) {
    this.closeMenu();
    this.anchor = anchor;
    anchor?.setAttribute("aria-expanded", "true");
    this.menu.replaceChildren();
    const add = (label, action, danger = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      if (danger) button.className = "danger-text";
      button.onclick = () => { this.closeMenu(); action(); };
      this.menu.append(button);
    };
    if (kind !== "file") {
      add("New file", () => this.actions.createFile(kind === "workspace" ? "" : path));
      add("New subfolder", () => this.actions.createFolder(kind === "workspace" ? "" : path));
    }
    add(kind === "file" ? "Rename file" : "Rename folder", () => this.actions.rename(kind, path));
    add(kind === "file" ? "Delete file" : "Delete folder", () => this.actions.delete(kind, path), true);
    const rect = anchor?.getBoundingClientRect();
    this.menu.hidden = false;
    this.menu.style.left = Math.max(8, Math.min(point?.x ?? rect?.left ?? 8, window.innerWidth - 216)) + "px";
    this.menu.style.top = Math.max(8, Math.min(point?.y ?? rect?.bottom ?? 8, window.innerHeight - this.menu.offsetHeight - 8)) + "px";
    this.menu.querySelector("button")?.focus();
  }
  render(workspace) {
    this.tree.replaceChildren();
    const build = (nodes, parent, level = 1) => {
      for (const node of nodes) {
        const item = document.createElement("div"), row = document.createElement("div"), open = document.createElement("button"), more = document.createElement("button");
        item.setAttribute("role", "treeitem");
        item.setAttribute("aria-label", node.path);
        item.setAttribute("aria-level", String(level));
        item.setAttribute("aria-selected", String(node.kind === "file" && node.path === workspace.active));
        row.className = "explorer-row";
        row.classList.toggle("active", node.kind === "file" && node.path === workspace.active);
        row.style.setProperty("--level", level - 1);
        open.type = more.type = "button";
        open.className = "file-item";
        open.innerHTML = this.icon(node.kind === "folder" ? "folder" : "file");
        const text = document.createElement("span");
        text.textContent = node.name;
        open.append(text);
        open.title = node.path;
        if (node.kind === "folder") {
          const collapsed = this.collapsed.has(workspace.id + "/" + node.path);
          item.setAttribute("aria-expanded", String(!collapsed));
          open.setAttribute("aria-label", (collapsed ? "Expand" : "Collapse") + " folder " + node.path);
          open.classList.toggle("folder-collapsed", collapsed);
          const toggle = () => { const key = workspace.id + "/" + node.path; this.collapsed.has(key) ? this.collapsed.delete(key) : this.collapsed.add(key); this.render(workspace); this.tree.querySelectorAll(".file-item").forEach(button => { if (button.title === node.path) button.focus(); }); };
          open.onclick = toggle;
          open.onkeydown = event => {
            if ((event.key === "ArrowRight" && collapsed) || (event.key === "ArrowLeft" && !collapsed)) { event.preventDefault(); toggle(); }
          };
          const group = document.createElement("div");
          group.setAttribute("role", "group");
          group.hidden = collapsed;
          build(node.children, group, level + 1);
          item.append(row, group);
        } else {
          open.setAttribute("aria-label", "Open file " + node.path);
          open.onclick = () => this.actions.open(node.path);
          item.append(row);
        }
        more.className = "icon-button explorer-actions";
        more.innerHTML = this.icon("more");
        more.dataset.explorerActions = "true";
        more.setAttribute("aria-label", "Actions for " + node.kind + " " + node.path);
        more.setAttribute("aria-haspopup", "menu");
        more.setAttribute("aria-expanded", "false");
        more.onclick = () => this.toggleMenu(node.kind, node.path, more);
        row.oncontextmenu = event => { event.preventDefault(); this.showMenu(node.kind, node.path, more, { x: event.clientX, y: event.clientY }); };
        row.append(open, more);
        parent.append(item);
      }
    };
    build(fileTree(workspace.files), this.tree);
    if (!workspace.files.length) {
      const empty = document.createElement("p");
      empty.className = "explorer-empty";
      empty.textContent = "This folder is empty. Create a file or subfolder to begin.";
      this.tree.append(empty);
    }
  }
}
