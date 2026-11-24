const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
export function visibleTree(snapshot, collapsed = new Set(), limit = 900) {
  const children = new Map(), all = new Map((snapshot?.nodes || []).map(n => [n.id, n]));
  for (const node of all.values()) { if (!children.has(node.parent)) children.set(node.parent, []); children.get(node.parent).push(node); }
  const rows = [], visit = (node, depth) => {
    if (rows.length >= limit) return;
    rows.push({ ...node, depth, x: 30 + depth * 235, y: 28 + rows.length * 58, childCount: children.get(node.id)?.length || 0 });
    if (!collapsed.has(node.id)) for (const child of children.get(node.id) || []) visit(child, depth + 1);
  };
  for (const root of children.get(null) || []) visit(root, 0);
  return { rows, all, children, truncated: rows.length >= limit && all.size > rows.length };
}
export class TreeInspector {
  constructor(host, { title, snapshot, onLocate }) {
    Object.assign(this, { host, title, snapshot, onLocate }); this.collapsed = new Set((snapshot.nodes || []).filter(n => n.depth === 2).map(n => n.id));
    this.zoom = 1; this.pan = [0, 0]; this.selected = snapshot.nodes[0]?.id;
    host.replaceChildren(); host.className = 'factory-tree-inspector';
    const tools = document.createElement('div'); tools.className = 'factory-tree-tools';
    const button = (text, fn) => { const node = document.createElement('button'); node.textContent = text; node.onclick = fn; tools.append(node); return node; };
    button('Expand all', () => { this.collapsed.clear(); this.render(); }); button('Collapse', () => { this.collapsed = new Set(snapshot.nodes.filter(n => n.depth === 1).map(n => n.id)); this.render(); });
    button('Zoom in', () => this.changeZoom(.15)); button('Zoom out', () => this.changeZoom(-.15)); button('Reset view', () => { this.zoom = 1; this.pan = [0, 0]; this.viewport(); });
    const count = document.createElement('span'); count.textContent = `${snapshot.nodes.length} of ${snapshot.total} captured nodes${snapshot.complete ? '' : ' · capture limit reached'}`; tools.append(count);
    this.svg = el('svg', { role: 'tree', 'aria-label': title, tabindex: '0' }); this.svg.classList.add('factory-tree-svg');
    this.info = document.createElement('div'); this.info.className = 'factory-node-info';
    const note = document.createElement('p'); note.className = 'factory-subtle'; note.textContent = 'Click to inspect a node; double-click or use Left/Right to collapse or expand it. Drag to pan; scroll to zoom.';
    host.append(tools, note, this.svg, this.info);
    this.svg.onwheel = event => { event.preventDefault(); this.changeZoom(event.deltaY > 0 ? -.08 : .08); };
    let drag;
    this.svg.onpointerdown = event => { if (event.target.closest('[data-tree-node]')) return; drag = [event.clientX, event.clientY, ...this.pan]; this.svg.setPointerCapture(event.pointerId); };
    this.svg.onpointermove = event => { if (!drag) return; this.pan = [drag[2] + event.clientX - drag[0], drag[3] + event.clientY - drag[1]]; this.viewport(); };
    this.svg.onpointerup = this.svg.onpointercancel = () => { drag = null; };
    this.render();
  }
  changeZoom(delta) { this.zoom = Math.max(.3, Math.min(2.5, this.zoom + delta)); this.viewport(); }
  viewport() { const r = this.svg.getBoundingClientRect(); this.svg.setAttribute('viewBox', `${-this.pan[0] / this.zoom} ${-this.pan[1] / this.zoom} ${Math.max(r.width, 300) / this.zoom} ${Math.max(r.height, 300) / this.zoom}`); }
  render() {
    const model = visibleTree(this.snapshot, this.collapsed), positions = new Map(model.rows.map(n => [n.id, n])); this.svg.replaceChildren();
    for (const node of model.rows) {
      const parent = positions.get(node.parent); if (!parent) continue;
      const x1 = parent.x + 190, y1 = parent.y + 20, x2 = node.x, y2 = node.y + 20;
      this.svg.append(el('path', { d: `M ${x1} ${y1} C ${x1 + 25} ${y1}, ${x2 - 25} ${y2}, ${x2} ${y2}`, class: 'tree-edge' }));
    }
    for (const node of model.rows) {
      const group = el('g', { transform: `translate(${node.x},${node.y})`, tabindex: 0, role: 'treeitem',
        'data-tree-node': node.id, 'aria-level': node.depth + 1, 'aria-selected': this.selected === node.id,
        'aria-label': `${node.kind} ${node.text} ${node.type}`, ...(node.childCount ? { 'aria-expanded': !this.collapsed.has(node.id) } : {}) });
      group.append(el('rect', { width: 190, height: 42, rx: 8, class: 'tree-node-bg' }));
      group.append(el('text', { x: 12, y: 16, class: 'tree-kind' }, node.kind + (node.childCount ? ' · ' + (this.collapsed.has(node.id) ? '+' : '−') + node.childCount : '')));
      group.append(el('text', { x: 12, y: 32, class: 'tree-value' }, (node.text || node.type || '(structure)').slice(0, 27)));
      group.onclick = () => { this.selected = node.id; this.describe(node); this.svg.querySelectorAll('[data-tree-node]').forEach(n => n.setAttribute('aria-selected', Number(n.dataset.treeNode) === node.id)); };
      group.ondblclick = () => { this.collapsed.has(node.id) ? this.collapsed.delete(node.id) : this.collapsed.add(node.id); this.render(); };
      group.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.selected = node.id; this.describe(node); }
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.key === 'ArrowLeft' ? this.collapsed.add(node.id) : this.collapsed.delete(node.id); this.render(); this.svg.querySelector(`[data-tree-node="${node.id}"]`)?.focus(); }
      };
      this.svg.append(group);
    }
    this.viewport(); const selected = model.all.get(this.selected); if (selected) this.describe(selected);
    if (model.truncated) { const note = document.createElement('p'); note.textContent = 'Visible node limit reached. Collapse branches to inspect other parts.'; note.className = 'factory-subtle'; this.info.append(note); }
  }
  describe(node) {
    this.info.replaceChildren(); const title = document.createElement('strong'); title.textContent = node.kind + (node.text ? ': ' + node.text : '');
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify({ type: node.type || undefined, location: node.at,
      parameters: node.params?.length ? node.params : undefined, parameterCount: node.parameterCount || undefined }, null, 2);
    this.info.append(title, pre);
    if (node.at) { const go = document.createElement('button'); go.textContent = `Show ${node.at.file}:${node.at.line}:${node.at.col} in editor`; go.onclick = () => this.onLocate(node.at); this.info.append(go); }
  }
}
