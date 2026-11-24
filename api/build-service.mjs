import { compile } from '../studio/core/compiler.mjs';
import { bundleExecutable } from '../studio/core/binary.mjs';

export const BUILD_VERSION = '0.19.0';
export const BUILD_PATH = '/api/build/exe';
export const HEALTH_PATH = '/api/build/health';
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
export const RUNTIME_SHA256 = '956dece489b53d78e7a4208f8448478fbc6247e37aa867d5cbaa1ec199921bf7';
const MAX_CONTENT = 8 * 1024 * 1024;
const MAX_SOURCE = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const securityHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
export class BuildError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export const jsonResponse = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function pathName(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || /[\\:\x00-\x1f\x7f<>"|?*]/.test(value)) throw new BuildError('Use a relative project file path.');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new BuildError('Project paths cannot leave the project or use reserved Windows names.');
  return value;
}
export function outputName(value, entry) {
  const name = value === undefined ? entry.split('/').at(-1).replace(/\.jimsabz$/i, '') + '.exe' : value;
  if (typeof name !== 'string' || name.length > 120 || name.includes('/') || pathName(name) !== name || !/\.exe$/i.test(name) || name === '.exe') throw new BuildError('Choose a Windows filename ending in .exe, without a directory.');
  return name;
}
export function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BuildError('Send a JSON project object.');
  if (input.target !== undefined && input.target !== 'windows-x64') throw new BuildError('This build target is Windows 10/11 x64.');
  const entry = pathName(input.entry ?? 'main.jimsabz');
  if (!/\.jimsabz$/i.test(entry)) throw new BuildError('The program entry must be a .jimsabz source file.');
  const sourceFiles = input.files ?? (typeof input.source === 'string' ? [{ path: entry, text: input.source }] : null);
  if (!Array.isArray(sourceFiles) || !sourceFiles.length || sourceFiles.length > 128) throw new BuildError('Send between 1 and 128 project files.');
  const seen = new Set(); let total = 0, source = 0;
  const files = sourceFiles.map(file => {
    if (!file || typeof file !== 'object') throw new BuildError('Invalid project file.');
    const path = pathName(file.path), key = path.toLowerCase();
    if (seen.has(key)) throw new BuildError('Project file paths must be unique on Windows.');
    seen.add(key);
    if ((typeof file.text === 'string') === (typeof file.base64 === 'string')) throw new BuildError('Each file needs either text or base64 content.');
    let item;
    if (typeof file.text === 'string') {
      const length = encoder.encode(file.text).byteLength; total += length;
      if (/\.jimsabz$/i.test(path)) {
        source += length;
        if (length > 512 * 1024) throw new BuildError('A source file exceeds 512 KiB.', 413);
      }
      item = { path, text: file.text, kind: /\.jimsabz$/i.test(path) ? 'source' : 'text' };
    } else {
      if (/\.jimsabz$/i.test(path)) throw new BuildError('Send Jimsabz source as text.');
      const value = file.base64;
      if (value.length > Math.ceil(MAX_CONTENT / 3) * 4) throw new BuildError('An asset exceeds the build limit.', 413);
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new BuildError('Asset content is not valid base64.');
      const raw = atob(value), bytes = Uint8Array.from(raw, ch => ch.charCodeAt(0)); total += bytes.length;
      item = { path, bytes, kind: 'binary' };
    }
    if (total > MAX_CONTENT || source > MAX_SOURCE) throw new BuildError('The API accepts up to 8 MiB of project content, including at most 2 MiB of source.', 413);
    return item;
  });
  if (!files.some(f => f.path === entry && typeof f.text === 'string')) throw new BuildError('The entry source file is missing.');
  return { files, entry, filename: outputName(input.filename, entry) };
}
export function validateRuntime(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 256 || bytes[0] !== 77 || bytes[1] !== 90) throw new BuildError('The Windows runtime is unavailable.', 503);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), pe = view.getUint32(0x3c, true);
  if (pe + 28 > bytes.length || view.getUint32(pe, true) !== 0x00004550 || view.getUint16(pe + 4, true) !== 0x8664 || view.getUint16(pe + 24, true) !== 0x20b) throw new BuildError('The configured runtime is not a Windows x64 executable.', 503);
  return bytes;
}
async function parseRequest(request) {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) throw new BuildError('The build request exceeds 12 MiB.', 413);
  const reader = request.body?.getReader(); if (!reader) throw new BuildError('The build request has no body.');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new BuildError('The build request exceeds 12 MiB.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new BuildError('The build request must contain valid UTF-8 JSON.'); }
}
async function compileProject({ files, entry, filename }, runtime) {
  const started = performance.now();
  const result = await compile(files, entry);
  if (!result.ok) throw new BuildError('Compilation failed. Fix the reported source error and build again.', 422, { diagnostics: result.diagnostics, stages: result.stages });
  const instructions = result.program.code.length + Object.values(result.program.functions).reduce((n, f) => n + f.code.length, 0);
  if (instructions > 100000) throw new BuildError('The program exceeds the API instruction limit.', 413);
  const bytes = bundleExecutable(validateRuntime(runtime), result.program, files);
  return { bytes, filename, stages: result.stages, assets: result.program.assets.length, buildMs: performance.now() - started };
}
export async function buildProject(input, runtime) { return compileProject(validateProject(input), runtime); }
export function createBuildApi(getRuntime) {
  let trustedRuntime;
  const runtime = () => trustedRuntime ??= Promise.resolve().then(getRuntime).then(async bytes => {
    validateRuntime(bytes);
    if (await sha256(bytes) !== RUNTIME_SHA256) throw new BuildError('The Windows runtime does not match this build service version.', 503);
    return bytes;
  }).catch(error => { trustedRuntime = undefined; throw error; });
  return async request => {
    const url = new URL(request.url);
    if (url.pathname === HEALTH_PATH && request.method === 'GET') return jsonResponse({ ok: true, version: BUILD_VERSION, target: 'windows-x64', compiler: 'Existing Jimsabz Studio compiler', runtime: 'Native C++ runtime', runtimeSha256: RUNTIME_SHA256, maxRequestBytes: MAX_REQUEST_BYTES });
    if (url.pathname !== BUILD_PATH) return jsonResponse({ error: 'API endpoint not found.' }, 404);
    if (request.method !== 'POST') return jsonResponse({ error: 'Use POST to build a Windows executable.' }, 405, { Allow: 'POST' });
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return jsonResponse({ error: 'Use the build API from the same origin as Studio.' }, 403);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) return jsonResponse({ error: 'Send application/json.' }, 415);
    try {
      const input = await parseRequest(request);
      // Validate before loading a multi-megabyte native template.
      const project = validateProject(input);
      const built = await compileProject(project, await runtime());
      const filenameAscii = built.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const encoded = encodeURIComponent(built.filename).replaceAll("'", '%27').replaceAll('(', '%28').replaceAll(')', '%29');
      return new Response(built.bytes, { headers: { ...securityHeaders, 'Content-Type': 'application/vnd.microsoft.portable-executable', 'Content-Length': String(built.bytes.length), 'Content-Disposition': `attachment; filename="${filenameAscii}"; filename*=UTF-8''${encoded}`, 'X-Artifact-SHA256': await sha256(built.bytes), 'X-Build-Target': 'windows-x64', 'X-Build-Version': BUILD_VERSION, 'X-Build-Assets': String(built.assets), 'X-Build-Milliseconds': built.buildMs.toFixed(1) } });
    } catch (error) {
      if (error instanceof BuildError) return jsonResponse({ error: error.message, ...error.extra }, error.status);
      return jsonResponse({ error: 'The project could not be built. Reduce its size or nesting and check its source.' }, 422);
    }
  };
}
