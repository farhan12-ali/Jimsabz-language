import { bundleExecutable } from './core/binary.mjs';
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function buildFilename(value) {
  let name = String(value).trim();
  if (!/\.exe$/i.test(name)) name += '.exe';
  if (name === '.exe' || name.length > 120 || /[\\/:\x00-\x1f\x7f<>"|?*]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('Choose a Windows filename, such as MyGame.exe.');
  return name;
}
export function buildPayload(project, filename) {
  return { target: 'windows-x64', entry: project.entry, filename: buildFilename(filename), files: project.files.filter(f => f.kind !== 'folder').map(file => {
    if (typeof file.text === 'string') return { path: file.path, text: file.text };
    if (!file.bytes) throw new Error('A project asset is missing its content: ' + file.path);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { path: file.path, base64: btoa(binary) };
  }) };
}
export async function requestExecutable(payload, { fetcher = fetch, signal } = {}) {
  const response = await fetcher('/api/build/exe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const message = [404, 405].includes(response.status) ? 'The build API is unavailable here. Open Start-Build-Server.cmd, or choose Build on this device.' : error?.error || 'The build API could not complete the request.';
    const failure = new Error(message); failure.diagnostics = error?.diagnostics; throw failure;
  }
  if (!/application\/vnd\.microsoft\.portable-executable/i.test(response.headers.get('Content-Type') || '')) throw new Error('The build API returned an unexpected response. No executable was downloaded.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 256 || bytes[0] !== 77 || bytes[1] !== 90) throw new Error('The build API returned an invalid Windows executable.');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (digest !== response.headers.get('X-Artifact-SHA256')) throw new Error('The download checksum did not match. Please build again.');
  return { bytes, sha256: digest, assets: Number(response.headers.get('X-Build-Assets') || 0), filename: payload.filename };
}
export class WindowsExecutableBuilder {
  constructor(host) { this.host = host; this.controller = null; this.objectUrl = null; }
  open() {
    if (this.controller) return this.host.toast('An executable build is already in progress.');
    const project = this.host.snapshot();
    if (!project.entry) return this.host.toast('Open a Jimsabz source file first.');
    const filename = project.entry.split('/').at(-1).replace(/\.jimsabz$/i, '') + '.exe';
    this.host.modal('Build a Windows executable', `<p class="exe-intro">Turn <strong>${esc(project.entry)}</strong> into a standalone Windows app. The native runtime and referenced assets are included.</p><div class="exe-target"><svg><use href="#i-cube"/></svg><div><strong>Windows 10 / 11</strong><span>64-bit · single .exe · no Jimsabz installation needed</span></div></div><label class="exe-label" for="exe-filename">Output filename</label><input id="exe-filename" class="exe-filename" value="${esc(filename)}" maxlength="120" autocomplete="off"><p class="exe-transfer">API build sends this project's files to the build service. Build on this device keeps the existing local export.</p><div class="exe-actions"><button id="exe-build-api" class="button primary"><svg><use href="#i-export"/></svg>Build &amp; download .exe</button><button id="exe-build-local" class="button secondary">Build on this device</button></div><p id="exe-build-status" class="exe-build-status" role="status"></p><pre id="exe-build-errors" class="exe-build-errors" hidden></pre><a id="exe-download-link" class="button primary exe-download-link" hidden>Download .exe again</a><p id="exe-build-details" class="exe-build-details"></p>`, 'STANDALONE WINDOWS APP');
    const dialog = document.querySelector('#modal');
    const nodes = Object.fromEntries(['exe-filename', 'exe-build-api', 'exe-build-local', 'exe-build-status', 'exe-build-errors', 'exe-download-link', 'exe-build-details'].map(id => [id, document.getElementById(id)]));
    const onClose = () => { this.controller?.abort(); if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; };
    dialog.addEventListener('close', onClose, { once: true });
    nodes['exe-build-api'].onclick = () => this.build('api', nodes);
    nodes['exe-build-local'].onclick = () => this.build('local', nodes);
  }
  async build(mode, nodes) {
    const controller = new AbortController(); this.controller = controller;
    const timer = setTimeout(() => controller.abort(new Error('The build request timed out. Try again.')), 30000);
    const input = nodes['exe-filename'], api = nodes['exe-build-api'], local = nodes['exe-build-local'], status = nodes['exe-build-status'], errors = nodes['exe-build-errors'], link = nodes['exe-download-link'];
    api.disabled = local.disabled = input.disabled = true; errors.hidden = true; link.hidden = true;
    status.textContent = 'Checking your current source…'; status.dataset.state = 'working';
    try {
      const filename = buildFilename(input.value);
      const result = await this.host.compile(); controller.signal.throwIfAborted();
      const project = this.host.snapshot();
      let built;
      if (mode === 'api') {
        status.textContent = 'Building with the Windows build API…';
        built = await requestExecutable(buildPayload(project, filename), { signal: controller.signal });
      } else {
        status.textContent = 'Packaging the native runtime on this device…';
        const response = await fetch('assets/jimsabz-runtime.exe', { signal: controller.signal });
        if (!response.ok) throw new Error('The bundled Windows runtime could not be loaded.');
        const bytes = bundleExecutable(new Uint8Array(await response.arrayBuffer()), result.program, project.files);
        built = { bytes, filename, assets: result.program.assets.length, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('') };
      }
      controller.signal.throwIfAborted();
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = URL.createObjectURL(new Blob([built.bytes], { type: 'application/vnd.microsoft.portable-executable' }));
      link.href = this.objectUrl; link.download = built.filename; link.hidden = false;
      status.textContent = `${built.filename} is ready. Download started.`; status.dataset.state = 'passed';
      nodes['exe-build-details'].textContent = `${(built.bytes.length / 1024 / 1024).toFixed(2)} MiB · ${built.assets} embedded assets · ${mode === 'api' ? 'API build' : 'Local build'}\nSHA-256: ${built.sha256}`;
      this.host.status('Windows executable ready'); link.click();
    } catch (error) {
      status.dataset.state = 'failed';
      status.textContent = controller.signal.aborted ? controller.signal.reason?.message || 'Build cancelled.' : error.message;
      if (error.diagnostics?.length) { errors.hidden = false; errors.textContent = error.diagnostics.map(d => `${d.code} · ${d.at?.file || ''}:${d.at?.line || 1}\n${d.message}`).join('\n\n'); }
    } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null; api.disabled = local.disabled = input.disabled = false; }
  }
}
