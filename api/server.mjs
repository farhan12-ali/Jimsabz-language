import { createLocalProjectApi } from './local-project.mjs';
import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { BUILD_PATH, HEALTH_PATH, MAX_REQUEST_BYTES, createBuildApi, jsonResponse } from './build-service.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.csv': 'text/csv; charset=utf-8', '.zip': 'application/zip', '.exe': 'application/vnd.microsoft.portable-executable' };
const defaultRoot = fileURLToPath(new URL('../studio/', import.meta.url));
function collectBody(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0, settled = false; const chunks = [];
    const fail = error => { if (settled) return; settled = true; reject(error); };
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) { fail(Object.assign(new Error('The build request exceeds 12 MiB.'), { status: 413 })); return; }
      chunks.push(chunk);
    });
    request.on('end', () => { if (!settled) { settled = true; resolveBody(Buffer.concat(chunks)); } });
    request.on('error', fail); request.on('aborted', () => fail(new Error('Request cancelled.')));
  });
}
export function createStudioServer({ root = defaultRoot, jobTimeoutMs = 15000, workspaceRoot } = {}) {
  let active = false;
  const localProject = createLocalProjectApi({ workspaceRoot });
  const health = createBuildApi(() => { throw new Error('Health requests do not load a runtime.'); });
  return http.createServer({ requestTimeout: 20000, headersTimeout: 10000, maxHeaderSize: 16384 }, async (incoming, outgoing) => {
    const send = async response => {
      if (outgoing.destroyed) return;
      outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), Connection: 'close' });
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    };
    try {
      const host = incoming.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) return send(jsonResponse({ error: 'Invalid local host.' }, 403));
      const url = new URL(incoming.url, `http://${host}`);
      if (url.pathname.startsWith('/api/local/')) {
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(incoming.socket.remoteAddress)) return send(jsonResponse({ error: 'Local project tools accept loopback connections only.' }, 403));
        if (incoming.headers.origin && incoming.headers.origin !== url.origin) return send(jsonResponse({ error: 'Use the local Studio origin.' }, 403));
        let body;
        if (incoming.method === 'POST') {
          if (!/^application\/json(?:\s*;|$)/i.test(incoming.headers['content-type'] || '')) return send(jsonResponse({ error: 'Send application/json.' }, 415));
          try { body = JSON.parse((await collectBody(incoming)).toString('utf8')); } catch (error) { return send(jsonResponse({ error: error.status ? error.message : 'Invalid JSON.' }, error.status || 400)); }
        }
        return send(await localProject(new Request(url, { method: incoming.method, headers: incoming.headers }), body));
      }
      if (url.pathname === HEALTH_PATH) return send(await health(new Request(url, { method: incoming.method })));
      if (url.pathname === BUILD_PATH) {
        if (incoming.method !== 'POST') return send(jsonResponse({ error: 'Use POST to build a Windows executable.' }, 405, { Allow: 'POST' }));
        if (incoming.headers.origin && incoming.headers.origin !== url.origin) return send(jsonResponse({ error: 'Use the build API from the same origin as Studio.' }, 403));
        if (!/^application\/json(?:\s*;|$)/i.test(incoming.headers['content-type'] || '')) return send(jsonResponse({ error: 'Send application/json.' }, 415));
        const length = incoming.headers['content-length'];
        if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) return send(jsonResponse({ error: 'The build request exceeds 12 MiB.' }, 413));
        if (active) return send(jsonResponse({ error: 'A build is in progress. Try again shortly.' }, 429, { 'Retry-After': '2' }));
        active = true;
        try {
          const body = await collectBody(incoming);
          const result = await new Promise((resolveJob, reject) => {
            const job = new Worker(new URL('./build-job.mjs', import.meta.url), { execArgv: [], workerData: { url: url.href, method: incoming.method, headers: incoming.headers, body }, resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 } });
            let settled = false;
            const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); outgoing.off('close', disconnected); job.terminate(); error ? reject(error) : resolveJob(value); };
            const disconnected = () => { if (!outgoing.writableEnded) finish(new Error('Request cancelled.')); };
            const timer = setTimeout(() => finish(Object.assign(new Error('The build exceeded its 15 second limit.'), { status: 504 })), jobTimeoutMs);
            outgoing.on('close', disconnected);
            job.once('message', result => result.error ? finish(new Error(result.error)) : finish(null, result));
            job.once('error', error => finish(error));
            job.once('exit', code => { if (!settled) finish(new Error('The build worker stopped before returning a result.')); });
          });
          return send(new Response(result.body, { status: result.status, headers: result.headers }));
        } finally { active = false; }
      }
      if (url.pathname.startsWith('/api/')) return send(jsonResponse({ error: 'API endpoint not found.' }, 404));
      if (!['GET', 'HEAD'].includes(incoming.method)) return send(jsonResponse({ error: 'Method not allowed.' }, 405));
      const decoded = decodeURIComponent(url.pathname);
      if (/[\\\x00-\x1f]/.test(decoded) || decoded.split('/').some(part => part === '..')) return send(new Response('Not found', { status: 404 }));
      const base = await realpath(root), path = await realpath(resolve(base, '.' + (decoded === '/' ? '/index.html' : decoded))).catch(() => '');
      if (!path.startsWith(base + sep) || !(await stat(path)).isFile()) return send(new Response('Not found', { status: 404 }));
      return send(new Response(await readFile(path), { headers: { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' } }));
    } catch (error) { return send(jsonResponse({ error: error.status ? error.message : 'The request could not be completed.' }, error.status || 500)); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const port = Number(option('--port', process.env.PORT || process.env.JIMSABZ_BUILD_PORT || '45426'));
  const host = option('--host', '127.0.0.1');
  if (!Number.isInteger(port) || port < 0 || port > 65535 || !['127.0.0.1', 'localhost', '0.0.0.0'].includes(host)) throw new Error('Choose a valid host and port.');
  const server = createStudioServer({ workspaceRoot: option('--workspace', process.env.JIMSABZ_WORKSPACE) });
  server.listen(port, host, () => console.log(`Jimsabz Studio + Windows build API: http://127.0.0.1:${server.address().port}/`));
}
