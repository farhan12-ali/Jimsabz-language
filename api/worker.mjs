import { createBuildApi } from './build-service.mjs';
import { embeddedAssets } from './embedded-assets.generated.mjs';

async function readAsset(path) {
  const item = embeddedAssets[path];
  if (!item) return null;
  const raw = Uint8Array.from(atob(item.gzip), ch => ch.charCodeAt(0));
  return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
const api = createBuildApi(() => readAsset('/assets/jimsabz-runtime.exe'));
let building = false;
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/build/exe' && request.method === 'POST') {
      if (building) return new Response(JSON.stringify({ error: 'A build is in progress. Try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '2' } });
      building = true;
      try { return await api(request); } finally { building = false; }
    }
    if (url.pathname.startsWith('/api/')) return api(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const item = embeddedAssets[path];
    if (!item) return new Response('Not found', { status: 404 });
    const headers = { 'Content-Type': item.type, 'Cache-Control': 'no-cache', 'ETag': item.etag, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (request.headers.get('If-None-Match') === item.etag) return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(await readAsset(path), { headers });
  },
};
