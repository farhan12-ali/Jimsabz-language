import { privatePath } from '../studio/agent/safety.mjs';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { realpath, readFile, readdir, stat, lstat, mkdtemp, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, sep, dirname, basename, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { jsonResponse } from './build-service.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const allowed = /\.(jimsabz|json|md|txt|csv|png|jpe?g|bmp|gif|webp|obj|wav|ogg|mp3)$/i;
export function localPath(path) {
  if (typeof path !== 'string' || path.length > 240 || isAbsolute(path) || path.split('/').some(p => !p || p === '..' || p === '.' || p.startsWith('.') || /[\\:\x00-\x1f<>\"|?*]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) || !allowed.test(path) || privatePath(path)) throw bad('Choose a project source, test, document or asset path.');
  return path;
}
const textFile = path => /\.(jimsabz|json|md|txt|csv|obj)$/i.test(path);
export function createLocalProjectApi({ workspaceRoot, git = 'git' } = {}) {
  const token = randomBytes(32).toString('hex'); let busy = false, rootPromise, hooksPromise;
  const root = async () => {
    if (!workspaceRoot) throw bad('Start the local server with --workspace followed by your project folder.', 409);
    rootPromise ||= realpath(resolve(workspaceRoot));
    return rootPromise;
  };
  const safeFile = async (path, create = false) => {
    localPath(path); const base = await root(), target = resolve(base, path);
    if (!target.startsWith(base + sep)) throw bad('Path is outside the selected project.');
    let current = base;
    for (const part of path.split('/').slice(0, -1)) {
      current = resolve(current, part);
      if (create) await mkdir(current, { recursive: true });
      const info = await lstat(current);
      if (info.isSymbolicLink() || !(await realpath(current)).startsWith(base + sep)) throw bad('Linked project directories are not supported.');
    }
    const info = await lstat(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (info?.isSymbolicLink() || info && !info.isFile()) throw bad('Choose a regular project file.');
    return target;
  };
  const command = async (args, input = '') => {
    const base = await root(); hooksPromise ||= mkdtemp(resolve(tmpdir(), 'jimsabz-no-hooks-'));
    const hooks = await hooksPromise;
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    const invoke = (arguments_, extra = [], stdin = '') => new Promise((resolveCommand, reject) => {
      const child = execFile(git, ['-c', 'core.hooksPath=' + hooks, '-c', 'core.fsmonitor=false', '-c', 'commit.gpgSign=false', '-c', 'core.pager=cat', ...extra, '-C', base, ...arguments_],
        { env, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => error ? reject(bad(error.code === 'ENOENT' ? 'Git is not installed or is not on PATH.' : (stderr || error.message).trim().slice(0, 2000), 409)) : resolveCommand(stdout));
      child.stdin.on('error', () => {}); child.stdin.end(stdin);
    });
    // Disable repository-defined clean/smudge/process filters as well as hooks.
    // Adding/switching source must not execute arbitrary repository commands.
    const filters = await invoke(['config', '--null', '--name-only', '--get-regexp', '^filter\\.']).catch(() => '');
    const extra = [];
    for (const key of filters.split('\0').filter(key => /^filter\.[^=\x00-\x1f]+\.(clean|smudge|process|required)$/.test(key)))
      extra.push('-c', key + '=' + (key.endsWith('.required') ? 'false' : ''));
    return invoke(args, extra, input);
  };
  const repository = async () => {
    const top = (await command(['rev-parse', '--show-toplevel'])).trim();
    if (await realpath(top) !== await root()) throw bad('The configured folder must be the repository root.', 409);
  };
  const gitState = async () => {
    await repository();
    const status = await command(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const staged = await command(['diff', '--cached', '--raw', '--full-index', '-z', '--no-ext-diff', '--no-textconv']);
    const head = await command(['rev-parse', '--verify', 'HEAD']).catch(() => 'unborn');
    const branch = (await command(['branch', '--show-current'])).trim() || 'Detached HEAD';
    const parts = status.split('\0'), files = [];
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      const state = parts[i].slice(0, 2), path = parts[i].slice(3), oldPath = /R|C/.test(state) ? parts[++i] : undefined;
      files.push({ path, oldPath, state, staged: state[0] !== ' ' && state !== '??', supported: allowed.test(path) && !path.split('/').some(p => p.startsWith('.')) });
    }
    const branches = (await command(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])).trim().split('\n').filter(Boolean);
    const authorName = (await command(['config', '--get', 'user.name']).catch(() => '')).trim();
    const authorEmail = (await command(['config', '--get', 'user.email']).catch(() => '')).trim();
    const log = await command(['log', '-15', '--format=%h%x09%an%x09%aI%x09%s']).catch(() => '');
    return { identity: { name: authorName, email: authorEmail }, branch, branches, files, log: log.trim().split('\n').filter(Boolean).map(line => { const [id, author, date, ...message] = line.split('\t'); return { id, author, date, message: message.join('\t') }; }), stagedRevision: hash(head + staged), root: await root() };
  };
  async function snapshot() {
    const files = [], base = await root(); let size = 0;
    const visit = async (dir, prefix = '') => {
      for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') || ['node_modules', 'build', 'dist', 'vendor'].includes(entry.name) || entry.isSymbolicLink() || privatePath(prefix + entry.name)) continue;
        const path = prefix + entry.name;
        if (entry.isDirectory()) { if (path.split('/').length < 10) await visit(resolve(dir, entry.name), path + '/'); }
        else if (entry.isFile() && allowed.test(path)) {
          if (files.length >= 256) throw bad('The project import is limited to 256 supported files.', 413);
          const target = await safeFile(path), info = await stat(target);
          if (info.size > 4 * 1024 * 1024 || size + info.size > 12 * 1024 * 1024) throw bad('The project import exceeds the 12 MiB total / 4 MiB file limit.', 413);
          const bytes = await readFile(target); size += bytes.length;
          files.push({ path, hash: hash(bytes), ...(textFile(path) ? { text: bytes.toString('utf8') } : { base64: bytes.toString('base64') }) });
        }
      }
    };
    await visit(base); return { name: basename(base), root: base, files };
  }
  return async (request, body) => {
    const path = new URL(request.url).pathname;
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return jsonResponse({ error: 'Use local project tools from this Studio origin.' }, 403);
    if (path === '/api/local/capabilities' && request.method === 'GET') return jsonResponse({ available: !!workspaceRoot, token: workspaceRoot ? token : undefined, root: workspaceRoot ? await root().catch(() => null) : null, instructions: 'node api/server.mjs --workspace "C:\\path\\to\\project"' });
    if (!workspaceRoot) return jsonResponse({ error: 'Configure --workspace on the local server to enable disk and Git tools.' }, 409);
    if (request.headers.get('X-Jimsabz-Local-Token') !== token) return jsonResponse({ error: 'Open local project tools again to establish a session.' }, 403);
    const routes = { '/api/local/git': 'GET', '/api/local/diff': 'GET', '/api/local/snapshot': 'GET', '/api/local/git/action': 'POST', '/api/local/save': 'POST' };
    if (!routes[path]) return jsonResponse({ error: 'Unknown local project endpoint.' }, 404);
    if (routes[path] !== request.method) return jsonResponse({ error: 'Method not allowed.' }, 405);
    if (busy) return jsonResponse({ error: 'A local project operation is already running.' }, 429);
    busy = true;
    try {
      if (path === '/api/local/git') return jsonResponse(await gitState());
      if (path === '/api/local/snapshot') return jsonResponse(await snapshot());
      if (path === '/api/local/diff') {
        await repository(); const selected = new URL(request.url).searchParams.get('path'), cached = new URL(request.url).searchParams.get('staged') === 'true';
        if (selected) localPath(selected);
        const diff = await command(['diff', ...(cached ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--', ...(selected ? [selected] : [])]);
        return jsonResponse({ diff, staged: cached });
      }
      if (path === '/api/local/save') {
        if (!Array.isArray(body?.files) || body.files.length > 256) throw bad('Provide up to 256 reviewed files.');
        let bytesTotal = 0; const writes = [], seen = new Set();
        for (const file of body.files) {
          localPath(file.path);
          if (seen.has(file.path.toLowerCase())) throw bad('Duplicate save path.'); seen.add(file.path.toLowerCase());
          if (typeof file.text !== 'string' && typeof file.base64 !== 'string') throw bad('Provide text or base64 file data.');
          const bytes = typeof file.text === 'string' ? Buffer.from(file.text) : Buffer.from(file.base64, 'base64');
          bytesTotal += bytes.length;
          if (bytes.length > 4 * 1024 * 1024 || bytesTotal > 8 * 1024 * 1024) throw bad('The save exceeds the 8 MiB / 4 MiB file limit.', 413);
          let target;
          try { target = await safeFile(file.path); }
          catch (e) { if (e.code !== 'ENOENT') throw e; target = resolve(await root(), file.path); }
          const disk = await readFile(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
          if ((disk === null ? null : hash(disk)) !== (file.expectedHash ?? null)) throw bad(file.path + ' changed on disk. Import and resolve it first.', 409);
          writes.push({ ...file, bytes, target, hash: hash(bytes) });
        }
        const saved = [];
        for (const file of writes) {
          const target = await safeFile(file.path, true);
          const latest = await readFile(target).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
          if ((latest === null ? null : hash(latest)) !== (file.expectedHash ?? null)) throw bad(file.path + ' changed during saving. Earlier files may already be saved.', 409);
          const temporary = target + '.jimsabz-' + randomBytes(6).toString('hex');
          try { await writeFile(temporary, file.bytes, { flag: 'wx' }); await rename(temporary, target); }
          finally { await unlink(temporary).catch(() => {}); }
          saved.push({ path: file.path, hash: file.hash });
        }
        return jsonResponse({ saved });
      }
      const action = body?.action;
      if (action === 'init') { await command(['init']); return jsonResponse(await gitState()); }
      await repository();
      if (['stage', 'unstage'].includes(action)) {
        if (!Array.isArray(body.paths) || !body.paths.length || body.paths.length > 100) throw bad('Select between 1 and 100 files.');
        body.paths.forEach(localPath);
        if (action === 'stage') await command(['add', '--', ...body.paths]);
        else {
          const hasHead = await command(['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
          await command(hasHead ? ['restore', '--staged', '--', ...body.paths] : ['rm', '--cached', '--', ...body.paths]);
        }
      } else if (action === 'commit') {
        if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1000) throw bad('Write a commit message up to 1,000 characters.');
        const state = await gitState();
        if (!state.files.some(f => f.staged)) throw bad('Stage files and review the staged diff before committing.');
        if (body.stagedRevision !== state.stagedRevision) throw bad('The staged changes changed after review. Review them again.', 409);
        const identity = [];
        if (body.authorName !== undefined || body.authorEmail !== undefined) {
          if (typeof body.authorName !== 'string' || !body.authorName.trim() || body.authorName.length > 120 || /[<>\x00-\x1f]/.test(body.authorName) || typeof body.authorEmail !== 'string' || body.authorEmail.length > 254 || !/^[^\s<>@]+@[^\s<>@]+$/.test(body.authorEmail)) throw bad('Provide a name and email for this local commit.');
          identity.push('-c', 'user.name=' + body.authorName.trim(), '-c', 'user.email=' + body.authorEmail.trim());
        }
        await command([...identity, 'commit', '--no-verify', '--no-gpg-sign', '--file=-'], body.message.trim() + '\n');
      } else if (action === 'branch' || action === 'switch') {
        const name = body.name;
        if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(name) || name.includes('..')) throw bad('Use a valid branch name.');
        await command(['check-ref-format', '--branch', name]);
        const state = await gitState();
        if (state.files.length) throw bad('Commit or resolve working changes before switching branches. Studio never discards them.', 409);
        await command(['switch', ...(action === 'branch' ? ['-c'] : []), name]);
      } else throw bad('Choose stage, unstage, commit, branch or switch.');
      return jsonResponse(await gitState());
    } catch (error) { return jsonResponse({ error: error.message }, error.status || 500); }
    finally { busy = false; }
  };
}
