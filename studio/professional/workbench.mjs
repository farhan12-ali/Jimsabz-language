import { examples, exampleFile } from '../core/examples.mjs';
import { completions, symbolAt, signature, renameEdits, formatSource, wordAt, offsetAt } from './language-service.mjs';
import { RecoveryVault, FolderSync, sameFiles } from './recovery.mjs';
import { discoverTests, runTestSelection } from './test-service.mjs';
import { readScene, updateObject, addObject, assetInventory } from './scene-service.mjs';
import { Renderer } from '../core/render.mjs';
import { workspace } from '../core/storage.mjs';
import { compile } from '../core/compiler.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const stamp = time => new Date(time).toLocaleString();
const tabs = [['overview', 'Workspace'], ['code', 'Code tools'], ['tests', 'Tests'], ['history', 'Recovery'], ['git', 'Source control'], ['scene', 'Scene & assets'], ['release', 'Windows release']];
const bytes64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const serialize = files => files.filter(f => f.kind !== 'folder').map(f => ({ path: f.path, ...(typeof f.text === 'string' ? { text: f.text } : { base64: bytes64(f.bytes || []) }) }));

export class ProfessionalWorkbench {
  constructor(host) {
    this.host = host; this.index = null; this.analysisKey = ''; this.sequence = 0; this.links = new Map(); this.sceneUrls = [];
    this.vault = new RecoveryVault(); this.page = 'overview'; this.testResults = []; this.diskHashes = new Map();
  }
  async initialize() {
    await this.vault.open();
    this.dialog = document.createElement('dialog'); this.dialog.id = 'professional-workbench'; this.dialog.className = 'pro-workbench';
    this.dialog.setAttribute('aria-labelledby', 'pro-title');
    this.dialog.innerHTML = `<header class="pro-head"><div><span class="pro-eyebrow">JIMSABZ STUDIO 0.19</span><h2 id="pro-title">Your development workspace</h2></div><button id="pro-close" class="button secondary" aria-label="Close development workspace">Close</button></header><nav class="pro-tabs" role="tablist" aria-label="Development tools">${tabs.map(([id, title], i) => `<button id="pro-tab-${id}" role="tab" data-pro-tab="${id}" aria-controls="pro-content" aria-selected="${i === 0}" tabindex="${i ? -1 : 0}">${title}</button>`).join('')}</nav><div id="pro-message" role="status" class="pro-message" hidden></div><section id="pro-content" role="tabpanel" tabindex="0"></section>`;
    document.body.append(this.dialog);
    $('pro-close').onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => { this.stopPreview(); this.sceneUrls.forEach(URL.revokeObjectURL); this.sceneUrls = []; });
    this.dialog.querySelectorAll('[data-pro-tab]').forEach((node, i, nodes) => {
      node.onclick = () => this.show(node.dataset.proTab);
      node.onkeydown = event => {
        const n = event.key === 'ArrowRight' ? (i + 1) % nodes.length : event.key === 'ArrowLeft' ? (i + nodes.length - 1) % nodes.length : event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : null;
        if (n === null) return; event.preventDefault(); nodes[n].click(); nodes[n].focus();
      };
    });
    document.querySelectorAll('[data-pro-open]').forEach(node => node.onclick = () => this.show(node.dataset.proOpen));
    const editor = $('editor');
    editor.addEventListener('input', () => { const project = this.host.getWorkspace(); this.vault.journalEdit(project, project.active, editor.value); this.schedule(); this.hint(); });
    editor.addEventListener('keyup', () => this.hint()); editor.addEventListener('click', () => this.hint());
    editor.addEventListener('mousemove', event => this.hover(event)); editor.addEventListener('mouseleave', () => { $('pro-hover').hidden = true; });
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); this.show('overview'); return; }
      if (document.activeElement !== editor || this.dialog.open) return;
      if (event.key === 'F12') { event.preventDefault(); event.shiftKey ? this.references() : this.definition(); }
      if (event.key === 'F2') { event.preventDefault(); this.rename(); }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); this.attempt(() => this.format()); }
    });
    window.addEventListener('studio-workspace-changed', () => this.schedule());
    window.addEventListener('pagehide', () => this.vault.record(this.host.getWorkspace(), 'Page closed').catch(() => {}));
    $('live-check').onclick = () => this.show('code');
    this.resizers(); await this.loadPreferences();
    this.schedule();
    const pending = this.vault.pending(this.host.getWorkspace());
    if (pending) { this.pendingJournal = pending; await this.show('history'); }
    await this.saved(this.host.getWorkspace(), 'Workspace opened');
  }
  key(project = this.host.getWorkspace()) { return JSON.stringify([project.id, project.active, project.files.filter(f => f.path.endsWith('.jimsabz')).map(f => [f.path, f.text])]); }
  schedule() {
    clearTimeout(this.checkTimer); this.index = null;
    if ($('live-check')) { $('live-check').textContent = 'Checking…'; $('live-check').dataset.state = 'checking'; }
    this.checkTimer = setTimeout(() => this.check(), 450);
  }
  async check() {
    this.languageWorker?.terminate(); clearTimeout(this.languageTimeout);
    const project = this.host.getWorkspace(); if (!project) return;
    const entry = project.active.endsWith('.jimsabz') ? project.active : project.entry;
    if (!entry) { $('live-check').textContent = 'Open source to check'; return; }
    const id = ++this.sequence, key = this.key();
    this.languageWorker = new Worker(new URL('./language-worker.mjs', import.meta.url), { type: 'module' });
    const job = this.languageWorker;
    const end = () => { if (this.languageWorker !== job) return; clearTimeout(this.languageTimeout); job.terminate(); };
    this.languageTimeout = setTimeout(() => { end(); $('live-check').textContent = 'Check timed out'; $('live-check').dataset.state = 'error'; }, 6000);
    this.languageWorker.onmessage = ({ data }) => {
      if (this.languageWorker !== job) return;
      end(); if (id !== this.sequence || key !== this.key()) return;
      if (data.error) { $('live-check').textContent = 'Check unavailable'; $('live-check').title = data.error; return; }
      this.index = data.result; this.analysisKey = key;
      const diagnostic = this.index.diagnostics[0];
      $('live-check').textContent = diagnostic ? `${diagnostic.code} · line ${diagnostic.at.line}` : 'Source checks passed';
      $('live-check').dataset.state = diagnostic ? 'error' : 'passed';
      $('live-check').title = diagnostic?.message || 'Compiler checks passed; program has not been run.';
      this.hint(); if (document.activeElement === $('editor')) this.host.refreshCompletion?.();
      if (this.dialog.open && this.page === 'code') this.codeTools();
    };
    this.languageWorker.onerror = event => { if (this.languageWorker !== job) return; end(); $('live-check').textContent = 'Check unavailable'; $('live-check').title = event.message; };
    this.languageWorker.postMessage({ id, entry, files: project.files });
  }
  completion() {
    if (!this.index || this.analysisKey !== this.key()) return [];
    return completions(this.index, this.host.getWorkspace().active, $('editor').value, $('editor').selectionStart);
  }
  currentSymbol(offset = $('editor').selectionStart) { return this.index && symbolAt(this.index, this.host.getWorkspace().active, offset); }
  hint() {
    const symbol = this.currentSymbol(), before = $('editor').value.slice(0, $('editor').selectionStart);
    const call = before.match(/([\p{L}_][\p{L}\p{M}\p{N}_]*)\([^()]*$/u), fn = call && (this.index?.signatures.find(f => f.name === call[1]) || this.index?.symbols.find(f => f.kind === 'function' && f.name === call[1]));
    $('code-intel').textContent = symbol ? signature(symbol) : fn ? signature({ ...fn, kind: 'function' }) : 'F12 Definition · Shift F12 References · F2 Rename · Alt Shift F Format';
  }
  hover(event) {
    if (!this.index) return;
    const editor = $('editor'), rect = editor.getBoundingClientRect(), style = getComputedStyle(editor);
    const canvas = this.measureCanvas ||= document.createElement('canvas'), ctx = canvas.getContext('2d'); ctx.font = style.font;
    const row = Math.floor((event.clientY - rect.top + editor.scrollTop - parseFloat(style.paddingTop)) / parseFloat(style.lineHeight));
    const column = Math.floor((event.clientX - rect.left + editor.scrollLeft - parseFloat(style.paddingLeft)) / ctx.measureText('M').width);
    const lines = editor.value.split('\n');
    const offset = lines.slice(0, row).reduce((n, x) => n + x.length + 1, 0) + column;
    const symbol = row >= 0 && row < lines.length && column >= 0 && column < lines[row].length ? this.currentSymbol(offset) : null;
    const box = $('pro-hover'); box.hidden = !symbol;
    if (symbol) { box.textContent = signature(symbol) + ' · ' + symbol.file + ':' + symbol.at.line; box.style.left = Math.min(event.clientX + 10, innerWidth - 320) + 'px'; box.style.top = Math.min(event.clientY + 24, innerHeight - 70) + 'px'; }
  }
  definition() {
    const symbol = this.currentSymbol();
    if (!symbol) return this.host.toast('Place the cursor on a known symbol after source checks finish.');
    this.dialog.close(); return this.host.locate(symbol.at);
  }
  async references() {
    const symbol = this.currentSymbol(); if (!symbol) return this.host.toast('Select a known symbol first.');
    await this.show('code');
    $('pro-content').innerHTML = `<h3>References to ${esc(symbol.name)}</h3><p>${esc(signature(symbol))}</p><div class="pro-list">${this.index.references.filter(r => r.symbol === symbol.id).map((r, i) => `<button class="pro-row" data-ref="${i}"><strong>${esc(r.file)}</strong><span>Line ${r.at.line}, column ${r.at.col}${r.declaration ? ' · declaration' : ''}</span></button>`).join('')}</div>`;
    const refs = this.index.references.filter(r => r.symbol === symbol.id);
    this.dialog.querySelectorAll('[data-ref]').forEach(node => node.onclick = () => { this.dialog.close(); this.host.locate(refs[Number(node.dataset.ref)].at); });
  }
  async rename() {
    const symbol = this.currentSymbol(); if (!symbol) return this.host.toast('Select a known symbol first.');
    const offset = $('editor').selectionStart, base = structuredClone(this.host.getWorkspace()), index = this.index, baseKey = this.key();
    await this.show('code');
    $('pro-content').innerHTML = `<h3>Rename ${esc(symbol.name)}</h3><p>Review every affected file before applying. This operation keeps a recovery checkpoint.</p><label>New name<input id="pro-rename-name" value="${esc(symbol.name)}" maxlength="100"></label><button class="button primary" id="pro-rename-preview">Preview rename</button><div id="pro-rename-diff"></div>`;
    $('pro-rename-name').focus(); $('pro-rename-name').select();
    $('pro-rename-preview').onclick = () => this.attempt(async () => {
      if (baseKey !== this.key() || !sameFiles(base, this.host.getWorkspace())) throw new Error('Project changed. Reopen Rename to refresh it.');
      const files = renameEdits(index, base.files, base.active, offset, $('pro-rename-name').value.trim());
      const result = await compile(files, base.active); if (!result.ok) throw new Error(result.diagnostics[0].message);
      const changed = files.filter(f => base.files.find(old => old.path === f.path)?.text !== f.text);
      $('pro-rename-diff').innerHTML = changed.map(f => `<details open><summary>${esc(f.path)}</summary><pre>${esc(f.text)}</pre></details>`).join('') + '<button id="pro-rename-apply" class="button primary">Apply reviewed rename</button>';
      $('pro-rename-apply').onclick = () => this.attempt(async () => {
        if (this.host.busy() || baseKey !== this.key() || !sameFiles(base, this.host.getWorkspace())) throw new Error('Project changed. Review again before applying.');
        await this.vault.record(base, 'Before symbol rename', { force: true });
        await this.host.commit({ ...base, files }); this.dialog.close(); this.host.toast('Symbol renamed. Recovery history contains the previous source.');
      });
    });
  }
  async format() {
    if (this.host.busy()) throw new Error('Wait for the current edit to finish.');
    const project = this.host.getWorkspace(), file = project.files.find(f => f.path === project.active);
    if (!file?.path.endsWith('.jimsabz')) throw new Error('Open a Jimsabz source file first.');
    const text = formatSource(file.text); if (text === file.text) return this.host.toast('Indentation is already consistent.');
    await this.vault.record(project, 'Before formatting', { force: true });
    const next = structuredClone(project); next.files.find(f => f.path === file.path).text = text;
    await this.host.commit(next); this.host.toast('Source indentation formatted. Newline statement boundaries preserved.');
  }
  async saved(project, reason = 'Autosave') {
    try {
      if (reason === 'Autosave' && Date.now() - (this.lastAuto || 0) < 15000) return;
      this.lastAuto = Date.now();
      await this.vault.record(project, reason);
    }
    catch (e) { if (!this.historyWarning) { this.host.toast(e.message); this.historyWarning = true; } }
  }
  message(text, error = false) { $('pro-message').hidden = !text; $('pro-message').textContent = text; $('pro-message').dataset.error = String(error); }
  async attempt(fn) { try { this.message(''); return await fn(); } catch (e) { this.message(e.message, true); } }
  async show(page = 'overview') {
    this.stopPreview(); this.page = page; this.message('');
    this.dialog.querySelectorAll('[data-pro-tab]').forEach(node => { const active = node.dataset.proTab === page; node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1; });
    $('pro-content').setAttribute('aria-labelledby', 'pro-tab-' + page);
    if (!this.dialog.open) this.dialog.showModal();
    return this.attempt(() => ({ overview: () => this.overview(), code: () => this.codeTools(), tests: () => this.tests(), history: () => this.history(), git: () => this.git(), scene: () => this.scene(), release: () => this.release() })[page]());
  }
  overview() {
    const project = this.host.getWorkspace();
    $('pro-content').innerHTML = `<div class="pro-intro"><span class="pro-eyebrow">BUILD WITH CONFIDENCE</span><h3>${esc(project.name)}</h3><p>Everything you need to edit, verify, recover and release your Jimsabz projects.</p></div><div class="pro-cards">${tabs.slice(1).map(([id, title]) => `<button class="pro-card" data-open-tool="${id}"><strong>${title}</strong><span>${esc({ code: 'Live compiler diagnostics, definitions, references and safe rename.', tests: 'Run saved test cases and inspect actual output.', history: 'Recover edits, browse checkpoints and link a local folder.', git: 'Review changes, stage files and manage local branches.', scene: 'Place objects visually and inspect your game assets.', release: 'Prepare and validate standalone Windows releases.' }[id])}</span></button>`).join('')}</div><div class="pro-callout"><strong>Local agent examples</strong><p>Try “Write a calculator” or “Create a program for 12 numbers with total, median, maximum and sorting in separate functions”. Follow up with “Add minimum and search for 42”.</p><p>The agent uses local planning and verified code builders. Its supported scope is explicit.</p></div><div class="pro-actions"><button id="pro-layout-reset" class="button secondary">Reset panel sizes</button><button id="pro-accessibility" class="button secondary">Display & keyboard settings</button></div>`;
    this.dialog.querySelectorAll('[data-open-tool]').forEach(node => node.onclick = () => this.show(node.dataset.openTool));
    $('pro-layout-reset').onclick = () => { for (const name of ['project-width', 'agent-width', 'dock-height']) document.documentElement.style.removeProperty('--' + name); document.querySelectorAll('[data-layout-setting]').forEach(node => node.setAttribute('aria-valuenow', node.dataset.defaultValue)); this.saveLayout({}); this.host.toast('Panel sizes reset.'); };
    $('pro-accessibility').onclick = () => this.preferences();
  }
  codeTools() {
    const index = this.index, diagnostics = index?.diagnostics || [];
    $('pro-content').innerHTML = `<div class="pro-section-head"><div><h3>Code intelligence</h3><p>Uses the existing Jimsabz parser and compiler. Compilation checks never execute your program.</p></div><button id="pro-refresh-check" class="button secondary">Check now</button></div><div class="pro-actions"><button id="pro-format" class="button primary">Format indentation</button><span>F12 Definition · Shift F12 References · F2 Rename</span></div><h4>Live diagnostics</h4>${!index ? '<p>Checking the active program…</p>' : diagnostics.length ? diagnostics.map((d, i) => `<button class="pro-row pro-error" data-diagnostic="${i}"><strong>${esc(d.code)} · ${esc(d.at.file)}:${d.at.line}:${d.at.col}</strong><span>${esc(d.message)}</span></button>`).join('') : '<p class="pro-success">Source checks passed. Runtime: Not Run.</p>'}<h4>Program symbols</h4><div class="pro-list">${index?.symbols.slice(0, 250).map((s, i) => `<button class="pro-row" data-symbol="${i}"><strong>${esc(signature(s))}</strong><span>${esc(s.file)}:${s.at.line} · ${esc(s.kind)}</span></button>`).join('') || '<p>Symbols appear when the source can be parsed.</p>'}</div>`;
    $('pro-refresh-check').onclick = () => this.check(); $('pro-format').onclick = () => this.attempt(() => this.format());
    this.dialog.querySelectorAll('[data-diagnostic]').forEach(node => node.onclick = () => { this.dialog.close(); this.host.locate(diagnostics[Number(node.dataset.diagnostic)].at); });
    this.dialog.querySelectorAll('[data-symbol]').forEach(node => node.onclick = () => { this.dialog.close(); this.host.locate(index.symbols[Number(node.dataset.symbol)].at); });
  }
  tests() {
    const project = this.host.getWorkspace(), suites = discoverTests(project);
    $('pro-content').innerHTML = `<div class="pro-section-head"><div><h3>Project tests</h3><p>Each case runs in an isolated VM worker with an execution timeout.</p></div><div class="pro-actions"><button id="pro-test-examples" class="button secondary">Open example test project</button><button id="pro-test-add" class="button secondary">New test case</button><button id="pro-test-all" class="button primary" ${!suites.length || this.testing ? 'disabled' : ''}>Run all</button><button id="pro-test-stop" class="button secondary" ${!this.testing ? 'disabled' : ''}>Stop</button></div></div><p id="pro-test-summary" role="status">${this.testing ? 'Tests running…' : this.testResults.length ? this.testResults.filter(r => r.status === 'Passed').length + ' passed · ' + this.testResults.filter(r => r.status === 'Failed').length + ' failed' + (this.testProjectKey !== this.key() ? ' · Previous project snapshot; run again for this source.' : '') : 'Not Run'}</p><div class="pro-list">${suites.map((suite, s) => `<section class="pro-test-suite"><h4>${esc(suite.path)}</h4>${suite.error ? `<p class="pro-error">${esc(suite.error)}</p>` : suite.cases.map((test, i) => `<div class="pro-test-row"><span>${esc(test.name)}</span><button class="button secondary" data-run-test="${s}:${i}" ${this.testing ? 'disabled' : ''}>Run case</button></div>`).join('')}</section>`).join('') || '<div class="pro-empty"><h4>No saved test cases yet</h4><p>Add sample inputs and an expected output for your active program.</p></div>'}</div><div id="pro-test-results"></div>`;
    $('pro-test-examples').onclick = () => this.attempt(async () => {
      if (this.host.busy()) throw new Error('Wait for the current edit to finish.');
      const next = workspace('Language test examples', 'folder', '', examples[0].id + '.jimsabz');
      next.files = examples.flatMap(example => [exampleFile(example), { path: example.id + '.tests.json', kind: 'file',
        text: JSON.stringify({ version: 1, entry: example.id + '.jimsabz', cases: [{ name: example.title, inputs: example.inputs, expectedOutput: example.expected }] }, null, 2) + '\n' }]);
      await this.host.select(next); this.testResults = []; this.tests(); this.message('Opened seven language examples and their test cases in a new workspace.');
    });
    $('pro-test-add').onclick = () => this.newTest(); $('pro-test-all').onclick = () => this.runTests(); $('pro-test-stop').onclick = () => this.testController?.abort();
    this.dialog.querySelectorAll('[data-run-test]').forEach(node => node.onclick = () => { const [s, i] = node.dataset.runTest.split(':').map(Number); this.runTests(suites[s].path + ':' + i); });
    this.renderTestResults();
  }
  renderTestResults() {
    if (!this.dialog.open || this.page !== 'tests' || !$('pro-test-results')) return;
    $('pro-test-results').innerHTML = this.testResults.map((r, i) => `<details class="pro-test-result" ${r.status === 'Failed' ? 'open' : ''}><summary><span class="${r.status === 'Passed' ? 'pro-success' : 'pro-error'}">${r.status}</span> ${esc(r.name || r.path)} <small>${r.ms?.toFixed(1) || '0'} ms</small></summary><p>${esc(r.message)}</p>${r.difference ? `<p>First output difference: line ${r.difference.line}, column ${r.difference.column}.</p>` : ''}${r.expectedOutput !== undefined ? `<div class="pro-comparison"><div><h4>Expected</h4><pre>${esc(r.expectedOutput)}</pre></div><div><h4>Actual</h4><pre>${esc(r.output)}</pre></div></div>` : ''}${r.diagnostic ? `<button class="button secondary" data-test-location="${i}">${esc(r.diagnostic.code)} · Go to failure</button><pre>${esc(r.diagnostic.message)}</pre>` : `<button class="button secondary" data-test-location="${i}">Open source</button>`}</details>`).join('');
    this.dialog.querySelectorAll('[data-test-location]').forEach(node => node.onclick = () => { const r = this.testResults[Number(node.dataset.testLocation)]; this.dialog.close(); this.host.locate(r.diagnostic?.at || { file: r.entry, line: 1, col: 1 }); });
  }
  async runTests(selection) {
    if (this.testing) return;
    this.testing = true; this.testResults = []; this.testController = new AbortController();
    const project = structuredClone(this.host.getWorkspace()); this.testProjectKey = this.key(); this.tests();
    try {
      await runTestSelection(project, selection, { signal: this.testController.signal, onResult: result => { this.testResults.push(result); this.renderTestResults(); } });
      this.testSummary = `${this.testResults.filter(r => r.status === 'Passed').length} passed · ${this.testResults.filter(r => r.status === 'Failed').length} failed`;
    } catch (e) { this.testSummary = this.testController.signal.aborted ? 'Stopped. Remaining cases: Not Run.' : e.message; }
    finally { this.testing = false; if (this.dialog.open && this.page === 'tests') { this.tests(); $('pro-test-summary').textContent = this.testSummary + (this.testProjectKey !== this.key() ? ' · Source changed since this run.' : ''); } }
  }
  newTest() {
    const project = this.host.getWorkspace(), entry = project.active.endsWith('.jimsabz') ? project.active : project.entry;
    $('pro-content').innerHTML = `<h3>Add a test case</h3><p>Output matching is exact, including prompts and newlines.</p><form id="pro-test-form"><label>Test name<input id="pro-test-name" value="Example result" required maxlength="120"></label><label>Input values (JSON array)<textarea id="pro-test-inputs" rows="2">[]</textarea></label><label>Expected output<textarea id="pro-test-expected" rows="5" placeholder="Paste the exact expected output, including its final newline."></textarea></label><p>Entry: <code>${esc(entry)}</code></p><button class="button primary">Save test case</button></form>`;
    $('pro-test-form').onsubmit = event => { event.preventDefault(); this.attempt(async () => {
      if (this.host.busy()) throw new Error('Wait for the current edit to finish.');
      const inputs = JSON.parse($('pro-test-inputs').value); if (!Array.isArray(inputs) || inputs.length > 2000 || inputs.some(x => typeof x === 'object')) throw new Error('Provide a JSON array of input strings or numbers.');
      const next = structuredClone(this.host.getWorkspace()), path = entry.replace(/\.jimsabz$/, '.tests.json');
      let file = next.files.find(f => f.path === path), data = file ? JSON.parse(file.text) : { version: 1, entry, cases: [] };
      if (data.version !== 1 || data.entry !== entry || !Array.isArray(data.cases) || data.cases.length >= 20) throw new Error('This suite cannot accept another case. Edit or split the .tests.json file.');
      data.cases.push({ name: $('pro-test-name').value, inputs, expectedOutput: $('pro-test-expected').value });
      if (!file) { file = { path, kind: 'file' }; next.files.push(file); }
      file.text = JSON.stringify(data, null, 2) + '\n'; await this.host.commit(next); this.tests();
    }); };
  }
  async history() {
    const project = this.host.getWorkspace(), items = await this.vault.list(project.id);
    if (!this.dialog.open || this.page !== 'history' || project.id !== this.host.getWorkspace().id) return;
    this.pendingJournal = this.pendingJournal?.project === project.id ? this.pendingJournal : this.vault.pending(project);
    const pending = this.pendingJournal;
    $('pro-content').innerHTML = `<div class="pro-section-head"><div><h3>Recovery & backups</h3><p>${this.vault.db ? 'Checkpoints are saved in this browser.' : 'History is session-only because browser storage is unavailable.'} Up to 40 snapshots / 32 MiB per project.</p></div><button id="pro-checkpoint" class="button primary">Save checkpoint</button></div>${this.pendingJournal ? `<div class="pro-callout"><h4>Recovered an unsaved edit</h4><p>${esc(this.pendingJournal.path)} · ${stamp(this.pendingJournal.time)}</p><details><summary>Review recovered source</summary><pre>${esc(this.pendingJournal.text)}</pre></details><div class="pro-actions"><button id="pro-recover-journal" class="button primary">Recover this edit</button><button id="pro-dismiss-journal" class="button secondary">Keep saved source</button></div></div>` : ''}<div class="pro-actions"><button id="pro-link-folder" class="button secondary">Link a local folder</button><button id="pro-sync-folder" class="button secondary">Review folder save</button><button id="pro-backup" class="button secondary">Download project backup</button></div><p id="pro-folder-state">Folder saves require a supported browser and your permission. Disk files are never deleted automatically.</p><div class="pro-list">${items.map((item, i) => `<button class="pro-row" data-checkpoint="${i}"><strong>${esc(item.reason)}</strong><span>${stamp(item.time)} · ${item.workspace.files.length} files · ${(item.bytes / 1024).toFixed(1)} KiB</span></button>`).join('') || '<p>No checkpoints yet. Save one before making a large change.</p>'}</div>`;
    $('pro-checkpoint').onclick = () => this.attempt(async () => { await this.vault.record(this.host.getWorkspace(), 'Manual checkpoint', { force: true }); await this.history(); });
    $('pro-backup').onclick = () => { this.dialog.close(); this.host.backup(); };
    $('pro-link-folder').onclick = () => this.attempt(async () => {
      if (!window.showDirectoryPicker) throw new Error('Folder linking needs a browser with File System Access. Use Download project backup here.');
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'jimsabz-project' });
      this.links.set(project.id, new FolderSync(handle)); await this.vault.link(project.id, handle).catch(() => {});
      this.message('Linked ' + handle.name + '. Review folder save to write files.');
    });
    $('pro-sync-folder').onclick = () => this.attempt(() => this.syncFolder());
    this.dialog.querySelectorAll('[data-checkpoint]').forEach(node => node.onclick = () => this.reviewCheckpoint(items[Number(node.dataset.checkpoint)]));
    if ($('pro-recover-journal')) $('pro-recover-journal').onclick = () => this.attempt(async () => {
      const next = structuredClone(this.host.getWorkspace());
      await this.vault.record(next, 'Before crash recovery', { force: true });
      if (!pending || next.id !== pending.project) throw new Error('Select the original project before recovering this edit.');
      next.files.find(f => f.path === pending.path).text = pending.text;
      this.pendingJournal = null; await this.host.commit(next); this.vault.clearJournal(next.id); await this.history();
    });
    if ($('pro-dismiss-journal')) $('pro-dismiss-journal').onclick = () => { this.vault.clearJournal(project.id); this.pendingJournal = null; this.history(); };
  }
  reviewCheckpoint(item) {
    const current = structuredClone(this.host.getWorkspace());
    $('pro-content').innerHTML = `<h3>${esc(item.reason)} · ${stamp(item.time)}</h3><p>Review the saved source. Restoring creates a checkpoint of your current files first.</p>${item.workspace.files.filter(f => typeof f.text === 'string').map(f => `<details><summary>${esc(f.path)}</summary><pre>${esc(f.text.slice(0, 60000))}</pre></details>`).join('')}<div class="pro-actions"><button id="pro-restore" class="button primary">Restore this checkpoint</button><button id="pro-history-back" class="button secondary">Back to history</button></div>`;
    $('pro-history-back').onclick = () => this.history(); $('pro-restore').onclick = () => this.attempt(async () => {
      if (this.host.busy() || !sameFiles(current, this.host.getWorkspace())) throw new Error('Project changed. Review the checkpoint again.');
      await this.vault.record(current, 'Before restoring history', { force: true });
      await this.host.commit({ ...structuredClone(item.workspace), id: current.id }); await this.history(); this.message('Checkpoint restored.');
    });
  }
  async syncFolder() {
    const project = structuredClone(this.host.getWorkspace()); let sync = this.links.get(project.id);
    if (!sync) {
      const handle = await this.vault.link(project.id); if (!handle) throw new Error('Link a local folder first.');
      sync = new FolderSync(handle); this.links.set(project.id, sync);
    }
    if (!(await sync.permission())) throw new Error('Folder access was not granted.');
    const rows = await sync.plan(project);
    $('pro-content').innerHTML = `<h3>Save to ${esc(sync.handle.name)}</h3><p>Existing files that differ from the last known disk version are conflicts. Import and resolve them first.</p>${rows.map(r => `<div class="pro-row"><strong>${esc(r.path)}</strong><span class="${r.state === 'Conflict' ? 'pro-error' : ''}">${r.state}</span></div>`).join('')}<button id="pro-folder-save" class="button primary" ${rows.some(r => r.state === 'Conflict') ? 'disabled' : ''}>Save reviewed files</button>`;
    $('pro-folder-save').onclick = () => this.attempt(async () => { if (!sameFiles(project, this.host.getWorkspace())) throw new Error('Project changed. Review the save again.'); const count = await sync.save(project, rows); await this.history(); this.message(count + ' files saved to the linked folder.'); });
  }
  async localApi(path, body) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', signal: controller.signal,
        headers: { 'X-Jimsabz-Local-Token': this.localToken || '', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Local operation failed.');
      return data;
    } finally { clearTimeout(timer); }
  }
  async git() {
    $('pro-content').innerHTML = `<h3>Local source control</h3><p>Git works through the local server, inside a folder you explicitly select at startup.</p><div class="pro-callout"><p>From the Studio project folder, start:</p><pre>node api/server.mjs --workspace "C:\\path\\to\\your-project"</pre><p>Open <code>http://127.0.0.1:45426</code>. Git must be installed. The hosted preview cannot access your computer’s repositories.</p></div><button id="pro-git-refresh" class="button primary">Connect / refresh</button><div id="pro-git-body"></div>`;
    $('pro-git-refresh').onclick = () => this.attempt(() => this.git());
    let capability;
    try { capability = await this.localApi('/api/local/capabilities'); }
    catch { if (!$('pro-git-body')) return; $('pro-git-body').innerHTML = '<p>Local repository access is unavailable in this preview. Use the local server command above.</p>'; return; }
    if (!this.dialog.open || this.page !== 'git') return;
    if (!capability.available) { $('pro-git-body').innerHTML = '<p>No local project folder is configured yet.</p>'; return; }
    this.localToken = capability.token; this.localRoot = capability.root;
    $('pro-git-body').innerHTML = `<p>Connected folder: <code>${esc(capability.root)}</code></p><div class="pro-actions"><button id="pro-git-import" class="button secondary">Import disk project as new workspace</button><button id="pro-git-save" class="button secondary">Review save to disk</button><button id="pro-git-init" class="button secondary">Initialize Git here</button></div><div id="pro-git-state"></div>`;
    $('pro-git-import').onclick = () => this.attempt(() => this.importDisk());
    $('pro-git-save').onclick = () => this.attempt(() => this.saveDisk());
    $('pro-git-init').onclick = () => this.confirmLocal('Initialize Git repository', 'Create Git metadata in the connected folder? Your source files stay in place.', async () => { await this.localApi('/api/local/git/action', { action: 'init' }); await this.git(); });
    let state;
    try { state = await this.localApi('/api/local/git'); }
    catch (e) { if (!$('pro-git-state')) return; $('pro-git-state').innerHTML = `<p class="pro-error">${esc(e.message)}</p>`; return; }
    if (!this.dialog.open || this.page !== 'git' || !$('pro-git-init')) return;
    $('pro-git-init').hidden = true; this.gitState = state;
    $('pro-git-state').innerHTML = `<div class="pro-section-head"><h4>Branch: ${esc(state.branch)}</h4><div class="pro-actions"><button id="pro-branch-new" class="button secondary">New branch</button><button id="pro-branch-switch" class="button secondary">Switch branch</button></div></div><div class="pro-actions"><button id="pro-stage" class="button secondary">Stage selected</button><button id="pro-unstage" class="button secondary">Unstage selected</button><button id="pro-commit" class="button primary">Review commit</button></div><div class="pro-list">${state.files.map((f, i) => `<div class="pro-git-file"><label><input type="checkbox" data-git-file="${i}" ${!f.supported ? 'disabled' : ''}><code>${esc(f.state)}</code> ${esc(f.path)}</label><button class="text-button" data-git-diff="${i}" ${!f.supported ? 'disabled' : ''}>Diff</button></div>`).join('') || '<p class="pro-success">Working tree clean.</p>'}</div><h4>Recent commits</h4>${state.log.map(c => `<div class="pro-row"><strong>${esc(c.id)} · ${esc(c.message)}</strong><span>${esc(c.author)} · ${esc(c.date)}</span></div>`).join('') || '<p>No commits yet.</p>'}`;
    const selected = () => [...this.dialog.querySelectorAll('[data-git-file]:checked')].map(n => state.files[Number(n.dataset.gitFile)].path);
    $('pro-stage').onclick = () => this.attempt(async () => { await this.localApi('/api/local/git/action', { action: 'stage', paths: selected() }); await this.git(); });
    $('pro-unstage').onclick = () => this.attempt(async () => { await this.localApi('/api/local/git/action', { action: 'unstage', paths: selected() }); await this.git(); });
    $('pro-commit').onclick = () => this.attempt(() => this.reviewCommit());
    $('pro-branch-new').onclick = () => this.branch('branch'); $('pro-branch-switch').onclick = () => this.branch('switch');
    this.dialog.querySelectorAll('[data-git-diff]').forEach(node => node.onclick = () => this.attempt(async () => {
      const file = state.files[Number(node.dataset.gitDiff)];
      const working = await this.localApi('/api/local/diff?path=' + encodeURIComponent(file.path));
      const staged = await this.localApi('/api/local/diff?staged=true&path=' + encodeURIComponent(file.path));
      $('pro-content').innerHTML = `<h3>${esc(file.path)}</h3><h4>Working changes</h4><pre>${esc(working.diff || 'No tracked working diff. Untracked files appear after staging.')}</pre><h4>Staged changes</h4><pre>${esc(staged.diff || 'No staged diff.')}</pre><button id="pro-diff-back" class="button secondary">Back to source control</button>`;
      $('pro-diff-back').onclick = () => this.git();
    }));
  }
  confirmLocal(title, detail, operation) {
    $('pro-content').innerHTML = `<h3>${esc(title)}</h3><p>${esc(detail)}</p><div class="pro-actions"><button id="pro-local-confirm" class="button primary">${esc(title)}</button><button id="pro-local-cancel" class="button secondary">Cancel</button></div>`;
    $('pro-local-confirm').onclick = () => this.attempt(async () => { $('pro-local-confirm').disabled = true; try { await operation(); } finally { if ($('pro-local-confirm')) $('pro-local-confirm').disabled = false; } });
    $('pro-local-cancel').onclick = () => this.git();
  }
  async importDisk() {
    if (this.host.busy()) throw new Error('Wait for the current edit to finish.');
    const data = await this.localApi('/api/local/snapshot'), first = data.files.find(f => f.path.endsWith('.jimsabz'));
    if (!first) throw new Error('This folder has no Jimsabz source files.');
    const next = workspace(data.name, 'folder', '', first.path);
    next.files = data.files.map(f => ({ path: f.path, kind: f.path.endsWith('.jimsabz') ? 'source' : 'file',
      ...(f.text !== undefined ? { text: f.text } : { bytes: Uint8Array.from(atob(f.base64), ch => ch.charCodeAt(0)) }) }));
    next.localProjectRoot = data.root; next.localProjectHashes = Object.fromEntries(data.files.map(f => [f.path, f.hash]));
    await this.host.select(next); this.message('Imported the disk project into a new workspace. Your previous workspace is preserved.');
  }
  async saveDisk() {
    const project = structuredClone(this.host.getWorkspace()), disk = await this.localApi('/api/local/snapshot');
    const baseline = project.localProjectRoot === disk.root ? project.localProjectHashes || {} : {};
    const diskMap = new Map(disk.files.map(f => [f.path, f]));
    const incoming = serialize(project.files), rows = [];
    for (const file of incoming) {
      const existing = diskMap.get(file.path), same = existing && (typeof file.text === 'string' ? file.text === existing.text : file.base64 === existing.base64);
      rows.push({ ...file, expectedHash: existing?.hash ?? null, state: same ? 'Unchanged' : existing && baseline[file.path] !== existing.hash ? 'Conflict' : 'Save' });
    }
    $('pro-content').innerHTML = `<h3>Review disk save</h3><p>Target: <code>${esc(disk.root)}</code>. Files absent from this workspace are kept on disk.</p>${rows.map(r => `<div class="pro-row"><strong>${esc(r.path)}</strong><span class="${r.state === 'Conflict' ? 'pro-error' : ''}">${r.state}</span></div>`).join('')}<p>Resolve conflicts by importing the disk project and merging changes before saving.</p><div class="pro-actions"><button id="pro-disk-save" class="button primary" ${rows.some(r => r.state === 'Conflict') ? 'disabled' : ''}>Save reviewed files</button><button id="pro-disk-cancel" class="button secondary">Cancel</button></div>`;
    $('pro-disk-cancel').onclick = () => this.git(); $('pro-disk-save').onclick = () => this.attempt(async () => {
      if (!sameFiles(project, this.host.getWorkspace())) throw new Error('Project changed. Review the save again.');
      const result = await this.localApi('/api/local/save', { files: rows.filter(r => r.state === 'Save').map(({ state, ...f }) => f) });
      const next = structuredClone(project); next.localProjectRoot = disk.root;
      next.localProjectHashes = { ...Object.fromEntries(disk.files.map(f => [f.path, f.hash])), ...Object.fromEntries(result.saved.map(f => [f.path, f.hash])) };
      await this.host.commit(next); await this.git(); this.message(result.saved.length + ' files saved.');
    });
  }
  async reviewCommit() {
    const state = await this.localApi('/api/local/git'), diff = await this.localApi('/api/local/diff?staged=true');
    if (!state.files.some(f => f.staged)) throw new Error('Stage selected files before committing.');
    $('pro-content').innerHTML = `<h3>Review staged changes</h3><p>Only the staged changes below will be committed to <strong>${esc(state.branch)}</strong>.</p><pre>${esc(diff.diff)}</pre><label>Author name<input id="pro-commit-author" value="${esc(state.identity.name)}" maxlength="120"></label><label>Author email<input id="pro-commit-email" type="email" value="${esc(state.identity.email)}" maxlength="254"></label><p>The identity is used for this commit only; global Git settings stay unchanged.</p><label>Commit message<input id="pro-commit-message" maxlength="1000" placeholder="Describe the change"></label><div class="pro-actions"><button id="pro-confirm-commit" class="button primary">Create local commit</button><button id="pro-cancel-commit" class="button secondary">Cancel</button></div>`;
    $('pro-cancel-commit').onclick = () => this.git(); $('pro-confirm-commit').onclick = () => this.attempt(async () => {
      await this.localApi('/api/local/git/action', { action: 'commit', stagedRevision: state.stagedRevision, message: $('pro-commit-message').value, authorName: $('pro-commit-author').value, authorEmail: $('pro-commit-email').value }); await this.git(); this.message('Local commit created.');
    });
  }
  branch(action) {
    const creating = action === 'branch';
    $('pro-content').innerHTML = `<h3>${creating ? 'Create a branch' : 'Switch branch'}</h3><p>Working changes must be committed or resolved first. After switching, import the disk project to load the selected branch.</p><label>Branch name${creating ? '<input id="pro-branch-name" maxlength="100" placeholder="feature/my-change">' : `<select id="pro-branch-name">${this.gitState.branches.map(b => `<option>${esc(b)}</option>`).join('')}</select>`}</label><div class="pro-actions"><button id="pro-branch-apply" class="button primary">${creating ? 'Create and switch' : 'Switch to selected branch'}</button><button id="pro-branch-cancel" class="button secondary">Cancel</button></div>`;
    $('pro-branch-cancel').onclick = () => this.git(); $('pro-branch-apply').onclick = () => this.attempt(async () => { await this.localApi('/api/local/git/action', { action, name: $('pro-branch-name').value }); await this.git(); this.message('Branch selected. Import the disk project to refresh the editor.'); });
  }
  async scene() {
    this.sceneUrls.forEach(URL.revokeObjectURL); this.sceneUrls = [];
    const project = structuredClone(this.host.getWorkspace()), source = project.files.find(f => f.path === project.active && f.path.endsWith('.jimsabz'));
    const inventory = assetInventory(project);
    $('pro-content').innerHTML = `<div class="pro-section-head"><div><h3>Scene & assets</h3><p>Edit literal object properties, place objects, and compile the draft before applying.</p></div><button class="button secondary" id="pro-scene-refresh">Reload from source</button></div><div id="pro-scene-editor"></div><h4>Project assets</h4><p>“Unreferenced” means no static asset reference was found. Dynamic usage may still exist.</p><div class="pro-assets">${inventory.assets.map((f, i) => `<button class="pro-asset" data-asset="${i}"><span data-asset-thumb="${i}"></span><strong>${esc(f.path)}</strong><small>${f.status} · ${f.references.length} references</small></button>`).join('') || '<p>No image, model or audio assets in this project.</p>'}</div>${inventory.missing.length ? `<h4>Missing references</h4>${inventory.missing.map(r => `<p class="pro-error">${esc(r.path)} · ${esc(r.at.file)}:${r.at.line}</p>`).join('')}` : '<p>No missing static asset references found.</p>'}${inventory.parseErrors.map(e => `<p class="pro-error">Asset scan incomplete: ${esc(e.path)} · ${esc(e.message)}</p>`).join('')}`;
    $('pro-scene-refresh').onclick = () => this.show('scene');
    for (const [i, file] of inventory.assets.entries()) {
      if (/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.path)) {
        const url = URL.createObjectURL(new Blob([file.bytes])); this.sceneUrls.push(url);
        const image = document.createElement('img'); image.alt = ''; image.src = url; this.dialog.querySelector(`[data-asset-thumb="${i}"]`).append(image);
      }
    }
    this.dialog.querySelectorAll('[data-asset]').forEach(node => node.onclick = () => this.assetPreview(inventory.assets[Number(node.dataset.asset)]));
    if (!source) { $('pro-scene-editor').innerHTML = '<p>Open a game source file to use the visual editor.</p>'; return; }
    try {
      const parsed = readScene(source.text, source.path); if (!parsed.scenes.length) { $('pro-scene-editor').innerHTML = '<p>The active file is a console program. Open a 2D or 3D game source file to place objects.</p>'; return; }
      this.sceneBase = project; this.sceneBaseKey = this.key(project); this.scenePath = source.path; this.sceneCode = source.text; this.sceneSelected = parsed.objects[0]?.name;
      await this.sceneEditor();
    } catch (e) { $('pro-scene-editor').innerHTML = `<p class="pro-error">${esc(e.message)}</p>`; }
  }
  async sceneEditor() {
    if (!this.dialog.open || this.page !== 'scene') return;
    const scene = readScene(this.sceneCode, this.scenePath), dimension = scene.scenes[0].dimension;
    const object = scene.objects.find(o => o.name === this.sceneSelected) || scene.objects[0]; this.sceneSelected = object?.name;
    const properties = object?.properties || {}, position = properties[dimension === 3 ? 'jagah3d' : 'jagah']?.value || (dimension === 3 ? [0, 0, 0] : [100, 100]);
    $('pro-scene-editor').innerHTML = `<div class="pro-scene-grid"><div><div class="pro-actions"><label>Object<select id="pro-object-select">${scene.objects.map(o => `<option ${o.name === object?.name ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label><button id="pro-add-object" class="button secondary">Add object</button></div><canvas id="pro-plan" width="640" height="360" tabindex="0" aria-label="${dimension === 3 ? '3D top-down placement view' : '2D placement view'}. Drag the selected object, or use arrow keys. Hold Shift for larger movements."></canvas><p>${dimension === 3 ? 'Top-down X/Z placement. Edit Y in Properties.' : 'Drag the selected object to place it.'} Arrow keys move it; Shift increases the step.</p><label class="pro-inline"><input type="checkbox" id="pro-bounds" checked>Show bounding boxes</label><h4>Runtime rendering preview</h4><canvas id="pro-scene-preview" width="640" height="360" aria-label="Compiled scene preview"></canvas><p id="pro-preview-status" role="status">Compiling scene initialization…</p></div><div><h4>Object properties</h4>${object ? `<form id="pro-object-form"><label>X<input name="x" type="number" step="any" value="${position[0]}" required></label><label>${dimension === 3 ? 'Y' : 'Y'}<input name="y" type="number" step="any" value="${position[1]}" required></label>${dimension === 3 ? `<label>Z<input name="z" type="number" step="any" value="${position[2]}" required></label><label>Primitive<select name="shape">${[...(properties.shakal3d?.value && !['cube', 'sphere', 'plane', 'pyramid'].includes(properties.shakal3d.value) ? [properties.shakal3d.value] : []), 'cube', 'sphere', 'plane', 'pyramid'].map(s => `<option ${properties.shakal3d?.value === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>${['x', 'y', 'z'].map((axis, i) => `<label>Scale ${axis.toUpperCase()}<input name="scale-${axis}" type="number" step="any" value="${properties.paimano?.value?.[i] ?? 1}"></label>`).join('')}` : `<label>Width<input name="width" type="number" min="1" max="10000" value="${properties.width?.value ?? 40}"></label><label>Height<input name="height" type="number" min="1" max="10000" value="${properties.height?.value ?? 40}"></label>`}<label>Color<input name="color" value="${esc(properties.rang?.value || 'violet')}" maxlength="20"></label><button class="button secondary">Update draft</button></form>` : '<p>Add your first object.</p>'}<div class="pro-actions"><button class="button primary" id="pro-scene-apply">Compile & apply scene</button><button class="button secondary" id="pro-scene-discard">Discard draft</button></div><p>Expression-based properties stay in source. This editor does not replace custom game logic.</p></div></div>`;
    $('pro-object-select').onchange = () => { this.sceneSelected = $('pro-object-select').value; this.sceneEditor(); };
    $('pro-bounds').onchange = () => this.drawPlan(); $('pro-scene-discard').onclick = () => this.scene();
    $('pro-add-object').onclick = () => {
      $('pro-scene-editor').innerHTML = '<label>New object name<input id="pro-object-name" value="Object2" maxlength="64"></label><button id="pro-object-create" class="button primary">Add to scene draft</button>';
      $('pro-object-create').onclick = () => this.attempt(async () => { const name = $('pro-object-name').value.trim(); this.sceneCode = addObject(readScene(this.sceneCode, this.scenePath), name, dimension); this.sceneSelected = name; await this.sceneEditor(); });
    };
    if ($('pro-object-form')) $('pro-object-form').onsubmit = event => { event.preventDefault(); this.attempt(async () => {
      const form = new FormData(event.target), number = key => Number(form.get(key));
      const changes = { [dimension === 3 ? 'jagah3d' : 'jagah']: dimension === 3 ? [number('x'), number('y'), number('z')] : [number('x'), number('y')], rang: form.get('color') };
      if (dimension === 3) { changes.shakal3d = form.get('shape'); changes.paimano = ['x', 'y', 'z'].map(a => number('scale-' + a)); }
      else { changes.width = number('width'); changes.height = number('height'); }
      for (const property of Object.keys(changes)) {
        const old = properties[property];
        if (old && (!old.editable || JSON.stringify(old.value) === JSON.stringify(changes[property]))) delete changes[property];
      }
      this.sceneCode = updateObject(readScene(this.sceneCode, this.scenePath), object.name, changes); await this.sceneEditor();
    }); };
    $('pro-scene-apply').onclick = () => this.attempt(async () => {
      if (this.host.busy() || this.sceneBaseKey !== this.key() || !sameFiles(this.sceneBase, this.host.getWorkspace())) throw new Error('The project changed. Reload from source before applying this draft.');
      const next = structuredClone(this.sceneBase); next.files.find(f => f.path === this.scenePath).text = this.sceneCode;
      const checked = await compile(next.files, this.scenePath); if (!checked.ok) throw new Error(checked.diagnostics[0].message);
      await this.vault.record(this.sceneBase, 'Before scene edit', { force: true }); await this.host.commit(next); await this.scene(); this.message('Scene compiled and applied. Run code opens the separate game window.');
    });
    this.drawPlan(); this.planInput(); this.previewScene();
  }
  drawPlan(override) {
    const canvas = $('pro-plan'); if (!canvas) return;
    const scene = readScene(this.sceneCode, this.scenePath), dim = scene.scenes[0].dimension, ctx = canvas.getContext('2d');
    ctx.fillStyle = '#101427'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = '#29334d';
    for (let x = 0; x < canvas.width; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    const game = this.previewWorld;
    this.planRects = [];
    for (const o of scene.objects) {
      const p = override?.name === o.name ? override.position : o.properties[dim === 3 ? 'jagah3d' : 'jagah']?.value;
      if (!Array.isArray(p)) continue;
      const scale = dim === 3 ? 30 : 640 / (game?.width || 960), sy = dim === 3 ? 30 : 360 / (game?.height || 600);
      const x = dim === 3 ? 320 + p[0] * scale : p[0] * scale, y = dim === 3 ? 180 + p[2] * sy : p[1] * sy;
      const w = dim === 3 ? Math.abs(o.properties.paimano?.value?.[0] || 1) * scale : (o.properties.width?.value || 40) * scale;
      const h = dim === 3 ? Math.abs(o.properties.paimano?.value?.[2] || 1) * sy : (o.properties.height?.value || 40) * sy;
      const rect = { name: o.name, x: dim === 3 ? x - w / 2 : x, y: dim === 3 ? y - h / 2 : y, w, h, scale, sy, position: p };
      this.planRects.push(rect); ctx.fillStyle = o.name === this.sceneSelected ? '#a456ef' : '#586997'; ctx.fillRect(rect.x, rect.y, w, h);
      if ($('pro-bounds')?.checked) { ctx.strokeStyle = '#5ce3bd'; ctx.lineWidth = 1.5; ctx.strokeRect(rect.x, rect.y, w, h); }
      ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.fillText(o.name, rect.x, rect.y - 5);
    }
  }
  planInput() {
    const canvas = $('pro-plan'), point = event => { const r = canvas.getBoundingClientRect(); return [(event.clientX - r.left) / r.width * canvas.width, (event.clientY - r.top) / r.height * canvas.height]; };
    let drag;
    canvas.onpointerdown = event => {
      const [x, y] = point(event), rect = [...this.planRects].reverse().find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
      if (!rect) return; this.sceneSelected = rect.name; drag = { ...rect, point: [x, y] }; canvas.setPointerCapture(event.pointerId); canvas.focus();
    };
    canvas.onpointermove = event => {
      if (!drag) return; const [x, y] = point(event), dim = readScene(this.sceneCode, this.scenePath).scenes[0].dimension;
      const p = [...drag.position]; p[0] += (x - drag.point[0]) / drag.scale; p[dim === 3 ? 2 : 1] += (y - drag.point[1]) / drag.sy;
      drag.next = p.map(n => Math.round(n * 100) / 100); this.drawPlan({ name: drag.name, position: drag.next });
    };
    canvas.onpointerup = () => { if (!drag) return; const d = drag; drag = null; if (d.next) this.attempt(() => this.moveObject(d.name, d.next)); else this.sceneEditor(); };
    canvas.onpointercancel = () => { drag = null; this.drawPlan(); };
    canvas.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const scene = readScene(this.sceneCode, this.scenePath), object = scene.objects.find(o => o.name === this.sceneSelected), dim = scene.scenes[0].dimension;
      const p = [...(object?.properties[dim === 3 ? 'jagah3d' : 'jagah']?.value || [])]; if (!p.length) return;
      const step = dim === 3 ? .1 : 1, axis = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? 0 : dim === 3 ? 2 : 1;
      p[axis] += (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) * step * (event.shiftKey ? 10 : 1);
      this.attempt(async () => { await this.moveObject(object.name, p); $('pro-plan').focus(); });
    };
  }
  async moveObject(name, position) {
    const scene = readScene(this.sceneCode, this.scenePath);
    this.sceneCode = updateObject(scene, name, { [scene.scenes[0].dimension === 3 ? 'jagah3d' : 'jagah']: position }); await this.sceneEditor();
  }
  stopPreview() { this.previewWorker?.terminate(); this.previewWorker = null; clearTimeout(this.previewTimeout); }
  async previewScene() {
    this.stopPreview(); const code = this.sceneCode, files = structuredClone(this.sceneBase.files); files.find(f => f.path === this.scenePath).text = code;
    this.previewWorker = new Worker(new URL('./scene-worker.mjs', import.meta.url), { type: 'module' });
    const job = this.previewWorker;
    this.previewTimeout = setTimeout(() => { this.stopPreview(); if ($('pro-preview-status')) $('pro-preview-status').textContent = 'Preview timed out. Use the Run window for interactive programs.'; }, 5000);
    this.previewWorker.onmessage = async ({ data }) => {
      if (this.previewWorker !== job) return;
      this.stopPreview(); if (!this.dialog.open || this.page !== 'scene' || code !== this.sceneCode || !$('pro-scene-preview')) return;
      if (data.error) { $('pro-preview-status').textContent = data.error; return; }
      this.previewWorld = data.world; const renderer = new Renderer($('pro-scene-preview')); await renderer.assets(files);
      if (!this.dialog.open || code !== this.sceneCode) return;
      renderer.draw(data.world); $('pro-preview-status').textContent = 'Actual VM initialization rendered. Gameplay, audio and frame rate have not been tested here.'; this.drawPlan();
    };
    this.previewWorker.onerror = event => { if (this.previewWorker !== job) return; this.stopPreview(); if ($('pro-preview-status')) $('pro-preview-status').textContent = event.message; };
    this.previewWorker.postMessage({ files, entry: this.scenePath });
  }
  assetPreview(file) {
    const url = URL.createObjectURL(new Blob([file.bytes || file.text || ''])); this.sceneUrls.push(url);
    $('pro-content').innerHTML = `<h3>${esc(file.path)}</h3><p>${file.status}</p><div id="pro-asset-preview"></div><h4>References</h4>${file.references.map(r => `<p>${esc(r.at.file)}:${r.at.line}</p>`).join('') || '<p>No static references found.</p>'}<button id="pro-asset-back" class="button secondary">Back to scene & assets</button>`;
    const box = $('pro-asset-preview');
    if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(file.path)) { const img = document.createElement('img'); img.src = url; img.alt = file.path; box.append(img); }
    else if (/\.(wav|mp3|ogg)$/i.test(file.path)) { const audio = document.createElement('audio'); audio.src = url; audio.controls = true; box.append(audio); }
    else { const pre = document.createElement('pre'); pre.textContent = (file.text || new TextDecoder().decode(file.bytes)).slice(0, 40000); box.append(pre); }
    $('pro-asset-back').onclick = () => this.scene();
  }
  release() {
    $('pro-content').innerHTML = `<div class="pro-intro"><span class="pro-eyebrow">WINDOWS 10 / 11 · X64</span><h3>Prepare a Windows release</h3><p>Export your program, then validate it on the target operating system.</p></div><div class="pro-cards"><div class="pro-card"><strong>Standalone executable</strong><span>Embeds the existing native runtime, compiled bytecode and referenced assets.</span><button id="pro-release-exe" class="button primary">Build & download EXE</button></div><div class="pro-card"><strong>Installer & uninstaller</strong><span>The desktop source includes an Inno Setup recipe and a release packaging script.</span><code>scripts/build-release.ps1</code></div><div class="pro-card"><strong>Windows verification</strong><span>Run the shipped validation script on Windows. The latest recorded execution status is shown below.</span><code>scripts/test-windows-release.ps1</code></div></div><div id="pro-release-results"><p>Loading recorded release evidence…</p></div><p>Publisher signing needs your own signing certificate. The release script accepts a certificate thumbprint; no signing credentials are bundled.</p>`;
    $('pro-release-exe').onclick = () => { this.dialog.close(); this.host.exe(); };
    fetch(new URL('./release-status.json', import.meta.url)).then(r => r.json()).then(data => {
      if (this.dialog.open && this.page === 'release') $('pro-release-results').innerHTML = `<h4>Recorded release evidence</h4><div class="pro-list">${data.checks.map(c => `<div class="pro-row"><strong>${esc(c.name)}</strong><span class="${c.status === 'Passed' ? 'pro-success' : ''}">${esc(c.status)} · ${esc(c.detail)}</span></div>`).join('')}</div><p>Recorded: ${esc(data.recorded)}. These are release records; exporting your own project does not repeat every check.</p>`;
    }).catch(() => { if ($('pro-release-results')) $('pro-release-results').textContent = 'Release evidence could not be loaded. See the included validation instructions.'; });
  }
  async loadPreferences() {
    this.layout = await this.host.store.setting('pro-layout') || {};
    for (const [name, value] of Object.entries(this.layout)) if (['project-width', 'agent-width', 'dock-height'].includes(name) && Number.isFinite(value)) { document.documentElement.style.setProperty('--' + name, value + 'px'); document.querySelector(`[data-layout-setting="${name}"]`)?.setAttribute('aria-valuenow', value); }
    this.display = await this.host.store.setting('pro-display') || {};
    this.applyDisplay();
  }
  applyDisplay() {
    document.documentElement.classList.toggle('pro-large-text', !!this.display.largeText);
    document.documentElement.classList.toggle('pro-high-contrast', !!this.display.contrast);
    document.documentElement.classList.toggle('pro-reduce-motion', !!this.display.reduceMotion);
  }
  saveLayout(value = this.layout) { this.layout = value; this.host.store.setting('pro-layout', value).catch(() => {}); }
  preferences() {
    $('pro-content').innerHTML = `<h3>Display & keyboard</h3><p>These settings are saved in this browser.</p>${[['largeText', 'Larger editor text'], ['contrast', 'Higher contrast borders and labels'], ['reduceMotion', 'Reduce interface motion']].map(([name, label]) => `<label class="pro-option"><input type="checkbox" data-display="${name}" ${this.display[name] ? 'checked' : ''}>${label}</label>`).join('')}<h4>Keyboard shortcuts</h4><table><tbody>${[['Ctrl Enter', 'Run in separate output window'], ['Ctrl S', 'Save source'], ['Ctrl K', 'Search project'], ['Ctrl Shift P', 'Development workspace'], ['Ctrl Space', 'Completion'], ['F12', 'Go to definition'], ['Shift F12', 'Find references'], ['F2', 'Review symbol rename'], ['Alt Shift F', 'Format indentation'], ['Tab / Shift Tab', 'Move through controls'], ['Arrow keys on panel dividers', 'Resize panels'], ['Escape', 'Close the active dialog']].map(([key, help]) => `<tr><th><kbd>${key}</kbd></th><td>${help}</td></tr>`).join('')}</tbody></table>`;
    this.dialog.querySelectorAll('[data-display]').forEach(node => node.onchange = () => { this.display[node.dataset.display] = node.checked; this.applyDisplay(); this.host.store.setting('pro-display', this.display).catch(() => {}); });
  }
  resizers() {
    const specs = [['project-width', '.shell', 'vertical', 180, 380, 250, 'Project explorer width'], ['agent-width', '.workspace', 'vertical', 260, 500, 330, 'Agent panel width'], ['dock-height', '.workspace', 'horizontal', 180, 500, 270, 'Compiler panel height']];
    for (const [name, selector, orientation, min, max, fallback, label] of specs) {
      const node = document.createElement('div'); node.dataset.layoutSetting = name; node.dataset.defaultValue = fallback; node.className = 'pro-resizer pro-' + name; node.tabIndex = 0; node.setAttribute('role', 'separator'); node.setAttribute('aria-orientation', orientation); node.setAttribute('aria-label', label);
      node.setAttribute('aria-valuemin', min); node.setAttribute('aria-valuemax', max); node.setAttribute('aria-valuenow', fallback);
      document.querySelector(selector).append(node); let drag;
      const value = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--' + name)) || fallback;
      const set = n => { n = Math.round(Math.max(min, Math.min(max, n))); document.documentElement.style.setProperty('--' + name, n + 'px'); node.setAttribute('aria-valuenow', n); this.layout = { ...this.layout, [name]: n }; };
      node.onpointerdown = event => { drag = { x: event.clientX, y: event.clientY, value: value() }; node.setPointerCapture(event.pointerId); event.preventDefault(); };
      node.onpointermove = event => { if (!drag) return; set(drag.value + (name === 'project-width' ? event.clientX - drag.x : name === 'agent-width' ? drag.x - event.clientX : drag.y - event.clientY)); };
      node.onpointerup = node.onpointercancel = () => { if (drag) this.saveLayout(); drag = null; };
      node.onkeydown = event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return; event.preventDefault(); set(event.key === 'Home' ? fallback : value() + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 10 : -10)); this.saveLayout(); };
    }
  }
}
