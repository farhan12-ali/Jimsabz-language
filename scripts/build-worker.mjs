import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'studio'), assets = {};
const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv; charset=utf-8', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable' };
async function collect(directory, prefix = '') {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + '/' + entry.name, path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path, name);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      assets[name] = { gzip: gzipSync(bytes, { level: 9, mtime: 0 }).toString('base64'), type: mime[extname(name)] || 'application/octet-stream', etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"' };
    }
  }
}
await collect(source);
await writeFile(resolve(root, 'api/embedded-assets.generated.mjs'), 'export const embeddedAssets = ' + JSON.stringify(assets) + ';\n');
await mkdir(resolve(root, 'dist/server'), { recursive: true });
await build({ entryPoints: [resolve(root, 'api/worker.mjs')], outfile: resolve(root, 'dist/server/index.js'), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none' });
const manifest = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8'));
if (manifest.static) throw new Error('Remove static from the hosting manifest for the Worker build.');
await mkdir(resolve(root, 'dist/.openai'), { recursive: true });
await writeFile(resolve(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ assets: Object.keys(assets).length, workerBytes: (await readFile(resolve(root, 'dist/server/index.js'))).length }));
