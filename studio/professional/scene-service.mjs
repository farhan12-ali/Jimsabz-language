import { lex, Parser } from '../core/language.mjs';
import { offsetAt } from './language-service.mjs';

const editable = new Set(['jagah', 'jagah3d', 'paimano', 'ghumao', 'width', 'height', 'raftar', 'rang', 'shakal3d', 'qabu', 'tasveer']);
function literal(node) {
  if (!node) return undefined;
  if (node.kind === 'int' || node.kind === 'dec') return Number(node.text);
  if (node.kind === 'unary' && node.text === '-') { const value = literal(node.children[0]); return typeof value === 'number' ? -value : undefined; }
  if (node.kind === 'name' || node.kind === 'string') return node.text;
  if (node.kind === 'vector') { const values = node.children.map(literal); return values.every(x => typeof x === 'number') ? values : undefined; }
}
export function readScene(code, path = 'scene.jimsabz') {
  code = code.replace(/\r\n?/g, '\n');
  const tokens = lex(code, path), tree = new Parser(tokens).parse(), stack = [], closes = new Map();
  tokens.forEach(t => { if (t.kind === 'symbol' && t.text === '{') stack.push(offsetAt(code, t.at)); else if (t.kind === 'symbol' && t.text === '}' && stack.length) closes.set(stack.pop(), offsetAt(code, t.at)); });
  const scenes = [], objects = [], references = [];
  const walk = (node, scene) => {
    if (node.kind === 'game') {
      const start = offsetAt(code, node.at), open = tokens.find(t => t.kind === 'symbol' && t.text === '{' && offsetAt(code, t.at) >= start);
      scene = { title: node.text, dimension: node.type === '3d' || code.slice(start, start + 6) === 'khed3d' ? 3 : 2, end: closes.get(offsetAt(code, open.at)), at: node.at };
      scenes.push(scene);
    }
    if (['actor', 'mesh'].includes(node.kind)) {
      const start = offsetAt(code, node.at), open = tokens.find(t => t.kind === 'symbol' && t.text === '{' && offsetAt(code, t.at) >= start), properties = {};
      for (const prop of node.children.filter(n => n.kind === 'property' && editable.has(n.text))) {
        const value = literal(prop.children[0]);
        properties[prop.text] = { value, editable: value !== undefined && !node.children.some(p => p !== prop && p.at.line === prop.at.line), line: prop.at.line };
      }
      objects.push({ name: node.text, dimension: node.kind === 'mesh' ? 3 : 2, at: node.at,
        start, end: closes.get(offsetAt(code, open.at)), scene: scene?.title, properties });
    }
    if ((node.kind === 'property' && ['tasveer', 'shakal3d'].includes(node.text) || node.kind === 'audio') && node.children[0]?.kind === 'string')
      references.push({ path: node.children[0].text, at: node.at, kind: node.text });
    node.children.forEach(n => walk(n, scene));
  };
  walk(tree); return { path, code, scenes, objects, references };
}
export function updateObject(scene, name, changes) {
  const object = scene.objects.find(o => o.name === name);
  if (!object) throw new Error('The object no longer exists. Reopen the scene.');
  const lines = scene.code.split('\n'), inserts = [];
  for (const [property, value] of Object.entries(changes)) {
    if (!editable.has(property)) throw new Error('That property is not supported by this editor.');
    const old = object.properties[property];
    if (old && !old.editable) throw new Error(property + ' uses an expression. Edit it in source to preserve its behavior.');
    let text;
    if (['jagah', 'jagah3d', 'paimano', 'ghumao'].includes(property)) {
      const expected = property === 'jagah' ? 2 : 3;
      if (!Array.isArray(value) || value.length !== expected || value.some(n => !Number.isFinite(n) || Math.abs(n) > 100000)) throw new Error('Use a finite position/scale vector.');
      text = '(' + value.map(n => Number.isInteger(n) && expected === 3 ? n.toFixed(1) : String(n)).join(', ') + ')';
    } else if (['width', 'height', 'raftar'].includes(property)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000) throw new Error('Dimensions and speed must be between 0 and 10,000.');
      text = String(value);
    } else if (property === 'rang') {
      if (!/^#[\da-f]{6}$/i.test(value) && !/^(violet|cyan|lime|amber|white|black|red|blue|green|gray|yellow|orange)$/.test(value)) throw new Error('Choose a supported color name or #RRGGBB.');
      text = value;
    } else if (property === 'tasveer') {
      if (!/\.(png|jpe?g|bmp|gif|webp)$/i.test(value) || /[\\\x00-\x1f]/.test(value)) throw new Error('Choose an image asset path.');
      text = JSON.stringify(value);
    } else if (property === 'shakal3d') {
      if (!['cube', 'sphere', 'plane', 'pyramid'].includes(value)) throw new Error('Choose a supported primitive.');
      text = value;
    } else {
      if (!['arrows', 'wasd', 'wasd_3d', 'none'].includes(value)) throw new Error('Choose supported controls.');
      text = value;
    }
    if (old) {
      const line = lines[old.line - 1], comment = line.match(/\s+\/\/.*$/)?.[0] || '';
      lines[old.line - 1] = (line.match(/^\s*/)?.[0] || '') + property + ': ' + text + comment;
    } else inserts.push('        ' + property + ': ' + text);
  }
  if (inserts.length) {
    const endLine = scene.code.slice(0, object.end).split('\n').length - 1;
    lines.splice(endLine, 0, ...inserts);
  }
  return lines.join('\n');
}
export function addObject(scene, name, dimension = 2) {
  if (!/^[A-Za-z_][\w]*$/.test(name) || scene.objects.some(o => o.name === name)) throw new Error('Choose a unique object name using letters, digits and underscores.');
  const target = scene.scenes.find(s => s.dimension === dimension);
  if (!target) throw new Error('Open a matching 2D or 3D game source file first.');
  const body = dimension === 3 ? `\n    mujassamo ${name} {\n        shakal3d: cube\n        jagah3d: (0.0, 0.0, 0.0)\n        paimano: (1.0, 1.0, 1.0)\n        rang: violet\n    }\n`
    : `\n    kirdar ${name} {\n        jagah: (100, 100)\n        width: 40\n        height: 40\n        rang: violet\n    }\n`;
  return scene.code.slice(0, target.end) + body + scene.code.slice(target.end);
}
export function assetInventory(project) {
  const refs = [], parseErrors = [];
  for (const file of project.files.filter(f => f.path.endsWith('.jimsabz'))) {
    try { refs.push(...readScene(file.text, file.path).references); } catch (e) { parseErrors.push({ path: file.path, message: e.message }); }
  }
  const assets = project.files.filter(f => /\.(png|jpe?g|bmp|webp|gif|obj|wav|mp3|ogg)$/i.test(f.path));
  const missing = refs.filter(r => !project.files.some(f => f.path === r.path));
  return { assets: assets.map(file => ({ ...file, references: refs.filter(r => r.path === file.path),
    status: refs.some(r => r.path === file.path) ? 'Referenced' : parseErrors.length ? 'Usage unknown' : 'Unreferenced' })), missing, parseErrors };
}
