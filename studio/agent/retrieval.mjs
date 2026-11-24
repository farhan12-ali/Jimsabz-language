import { safeText } from './safety.mjs';
const synonyms = { array: 'qatar', arrays: 'qatar', input: 'budh', output: 'budhai', integer: 'adad', integers: 'adad',
  string: 'lafz', strings: 'lafz', boolean: 'isharo', function: 'kam', functions: 'kam', class: 'qism', classes: 'qism' };
export function terms(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [];
  return words.flatMap(word => [word, ...(word.includes('_') ? word.split('_').filter(p => p.length > 1) : []), ...(Object.hasOwn(synonyms, word) ? [synonyms[word]] : [])]);
}
const dimensions = 256;
// Signed feature hashing is a local lexical vector, not a trained semantic embedding.
function vector(words) {
  const v = new Float64Array(dimensions);
  for (const word of words) {
    let h = 2166136261;
    for (const c of word) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    v[(h >>> 0) % dimensions] += h & 256 ? 1 : -1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
}
export function chunkDocument(text, source, version = 'project report', maximum = 1800) {
  const lines = safeText(text, 240000).split('\n'), out = [];
  let start = 0;
  while (start < lines.length) {
    let end = start, size = 0;
    while (end < lines.length && (size < maximum || end === start)) size += lines[end++].length + 1;
    const body = lines.slice(start, end).join('\n');
    if (body.trim()) out.push({ id: `${source}:${start + 1}`, source, version, startLine: start + 1, endLine: end, text: body });
    start = end;
  }
  return out;
}
export class KnowledgeIndex {
  constructor(chunks = []) {
    this.documents = chunks.map(c => ({ ...c, words: terms(c.source + ' ' + c.text) }));
    this.df = new Map();
    for (const d of this.documents) {
      d.count = new Map(); d.vec = vector(d.words);
      for (const w of d.words) d.count.set(w, (d.count.get(w) || 0) + 1);
      for (const w of d.count.keys()) this.df.set(w, (this.df.get(w) || 0) + 1);
    }
    this.average = this.documents.reduce((n, d) => n + d.words.length, 0) / (this.documents.length || 1);
  }
  search(query, limit = 6) {
    const words = [...new Set(terms(query))], q = vector(words), n = this.documents.length;
    return this.documents.map(d => {
      let lexical = 0;
      for (const w of words) {
        const tf = d.count.get(w) || 0, df = this.df.get(w) || 0;
        lexical += Math.log(1 + (n - df + .5) / (df + .5)) * tf * 2.2 / (tf + 1.2 * (.25 + .75 * d.words.length / this.average));
      }
      const similarity = d.vec.reduce((s, x, i) => s + x * q[i], 0);
      return { ...d, score: (lexical + .2 * Math.max(0, similarity)) * (d.authority || 1), lexical };
    }).filter(d => d.lexical > 0).sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(12, limit))).map(({ words, count, vec, lexical, ...d }) => d);
  }
}
let bundled;
export async function loadKnowledge() {
  return bundled ??= fetch(new URL('./knowledge-index.json', import.meta.url)).then(r => {
    if (!r.ok) throw new Error('Bundled Jimsabz documentation could not be loaded.');
    return r.json();
  }).catch(e => { bundled = null; throw e; });
}
