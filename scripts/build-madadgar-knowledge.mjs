import { readFile, writeFile } from 'node:fs/promises';
import { chunkDocument } from '../studio/agent/retrieval.mjs';
const root = new URL('../', import.meta.url);
const sources = [
  ['docs/COMPILER-FACTORY-0.19.0.md', 'Studio 0.19.0 Compiler Factory — implemented Run-window guide', 1.6],
  ['docs/PROFESSIONAL-0.18.0.md', 'Studio 0.18.0 professional tools — implementation guide', 1.5],
  ['docs/MADADGAR-PROFILE.md', 'Studio 0.19.0 implementation profile', 1.4],
  ['docs/V3-LANGUAGE.md', 'v3 preview — implemented package guide', 1.15],
  ['docs/LANGUAGE.md', 'v2.6 baseline — newer v3 features supersede this baseline', 1],
  ['docs/CODE-MADADGAR.md', 'Local Code Madadgar 0.14.0', 1],
  ['studio/agent/master-prompt.txt', 'creator requirements — v2.5 brief, not compiler conformance evidence', .45],
  ['examples/agent/percentage-two-inputs.jimsabz', 'verified percentage example', 1.2],
  ['examples/agent/gaming-hub/main.jimsabz', 'verified local login and 3D hub example', 1.2],
  ['examples/agent/gaming-hub/modules/auth.jimsabz', 'verified local login example — demo only', 1.2],
  ['examples/arrays_objects.jimsabz', 'verified compiler example', 1.1],
  ['examples/functions.jimsabz', 'verified compiler example', 1.1],
  ['examples/modules_demo.jimsabz', 'verified compiler example', 1.1],
  ['examples/modules/math.jimsabz', 'verified compiler example', 1.1],
];
let chunks = [];
for (const [source, version, authority] of sources) {
  chunks.push(...chunkDocument(await readFile(new URL(source, root), 'utf8'), source, version).map(c => ({ ...c, authority })));
}
const examples = JSON.parse(await readFile(new URL('studio/core/v3-examples.json', root), 'utf8'));
for (const example of Array.isArray(examples) ? examples : examples.examples || []) {
  if (example.code) chunks.push(...chunkDocument(example.code, 'verified-examples/' + (example.id || example.title) + '.jimsabz', 'v3 preview checked example').map(c => ({ ...c, authority: 1.1 })));
}
await writeFile(new URL('studio/agent/knowledge-index.json', root), JSON.stringify(chunks, null, 2) + '\n');
console.log(`Indexed ${chunks.length} versioned documentation and example chunks.`);
