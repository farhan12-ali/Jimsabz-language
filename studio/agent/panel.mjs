import { loadModel } from './agent.mjs';
import { SandboxRunner } from './execution.mjs';
import { loadKnowledge, KnowledgeIndex } from './retrieval.mjs';
import { runLocalAgent } from './local-agent.mjs';
import { undoChange } from './changes.mjs';
import { containsSecrets, safeText } from './safety.mjs';

const $ = selector => document.querySelector(selector);
const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function button(label, handler, className = 'button subtle') {
  const node = document.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label;
  node.onclick = handler; return node;
}
const snapshot = project => structuredClone({ id: project.id, entry: project.entry, active: project.active,
  files: project.files, trash: project.trash || [], madadgar: { memory: project.madadgar?.memory || '' } });
const toolLabel = name => name.replaceAll('_', ' ');
export class MadadgarPanel {
  constructor(host) { this.host = host; this.latest = null; this.working = false; this.toolsOpen = false; }
  async initialize() {
    const tabs = [...document.querySelectorAll('[data-agent-tab]')];
    for (const [index, tab] of tabs.entries()) {
      tab.onclick = () => this.selectTab(tab.dataset.agentTab);
      tab.onkeydown = event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next === undefined) return;
        event.preventDefault(); this.selectTab(tabs[next].dataset.agentTab); tabs[next].focus();
      };
    }
    const routes = {
      knowledge: () => this.knowledge(), notes: () => this.notes(), history: () => this.history(),
      activity: () => this.activity(), undo: () => this.undo(),
      retry: () => this.latest?.prompt ? this.host.ask(this.latest.prompt) : this.host.toast('Send a request first.'),
      'create-project': () => $('#new-workspace').click(), 'open-project': () => $('#switch-folder').click(),
      'run-window': () => $('#run').click(), guide: () => $('#guide').click(), examples: () => $('#language-examples').click(),
      'focus-code': () => this.compose('Describe your Jimsabz program…'),
      'compose-program': () => this.compose('Describe your program, its inputs and expected output…'),
      'compose-question': () => this.compose('Ask about Jimsabz, your code or your project…'),
      'game-tools': () => { this.setToolsOpen(true); this.selectTab('tools'); $('#agent-page-tools').scrollTop = 0; },
      learning: () => { this.setToolsOpen(true); this.selectTab('learning'); },
    };
    document.querySelectorAll('[data-agent-action]').forEach(node => {
      node.onclick = () => routes[node.dataset.agentAction]?.();
    });
    $('#agent-history').onclick = () => this.history();
    $('#agent-settings').onclick = () => {
      this.setToolsOpen(!this.toolsOpen);
      this.selectTab(this.toolsOpen ? 'tools' : 'chat');
    };
    this.status();
  }
  setToolsOpen(open) {
    this.toolsOpen = open;
    $('#agent-navigation').hidden = !open;
    $('#agent-settings').setAttribute('aria-expanded', String(open));
  }
  compose(placeholder) {
    this.setToolsOpen(false); this.selectTab('chat');
    $('#agent-prompt').placeholder = placeholder; $('#agent-prompt').focus();
  }
  selectTab(name) {
    document.querySelectorAll('[data-agent-tab]').forEach(tab => {
      const active = tab.dataset.agentTab === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    if (name === 'projects') this.projectSummary();
  }
  projectSummary() {
    const project = this.host.getWorkspace(); if (!project) return;
    const files = (project.files || []).filter(file => file.path.endsWith('.jimsabz'));
    $('#agent-project-name').textContent = project.name;
    $('#agent-project-detail').textContent = `${files.length} Jimsabz source ${files.length === 1 ? 'file' : 'files'} · ${project.entry || 'No program entry'}`;
  }
  status(text) {
    $('#madadgar-state').textContent = text || 'Ready to help with Jimsabz';
    $('#madadgar-state').closest('.agent-state-line').hidden = !text;
    $('#agent-presence').textContent = this.working ? 'Working locally' : 'Ready · Local';
    $('#agent-panel').classList.toggle('agent-is-working', this.working);
  }
  changedProject() {
    if (!this.working) this.status();
    this.projectSummary();
  }
  async run(prompt, { signal, attachments }) {
    if (this.working) throw new Error('An agent request is already running.');
    this.setToolsOpen(false); this.selectTab('chat');
    this.working = true;
    const project = this.host.getWorkspace();
    this.latest = { prompt };
    try {
      const [chunks, model] = await Promise.all([loadKnowledge(), loadModel()]); signal.throwIfAborted();
      const result = await runLocalAgent({ prompt, workspace: project, chunks, model, runner: new SandboxRunner(), attachments, signal,
        onEvent: event => {
          if (event.type === 'plan') return;
          this.status(event.type === 'tool' ? `${event.state}: ${toolLabel(event.name)}` : event.detail);
          $('#agent-writing-label').textContent = event.type === 'tool' ? toolLabel(event.name) + '…' : event.detail;
        } });
      result.prompt = prompt; this.latest = result;
      if (this.host.getWorkspace().id === project.id) {
        const live = this.host.getWorkspace(), old = live.madadgar || {};
        live.madadgar = { ...old,
          history: [...(old.history || []), { role: 'user', content: safeText(prompt, 12000) },
            { role: 'assistant', content: safeText(result.message, 20000) }].slice(-40),
          activity: [...(old.activity || []), ...result.activity].slice(-100),
          lastRequest: result.request || old.lastRequest || '', topic: result.topic || old.topic || '' };
        try { await this.host.store.save(live); }
        catch { this.host.toast('The response is ready, but conversation history could not be saved.'); }
      }
      return result;
    } finally { this.working = false; this.status(); }
  }
  facts(result) {
    const compilation = result.evidence ? result.evidence.ok ? 'Passed' : 'Failed' : 'Not Run';
    const execution = result.runtime?.runtime || 'Not Run';
    const tests = result.runtime?.tests ? `${result.runtime.passed} passed · ${result.runtime.failed} failed` : 'Not Run';
    return `<div class="madadgar-evidence"><div><span>Compilation</span><strong>${esc(compilation)}</strong></div><div><span>Runtime</span><strong>${esc(execution)}</strong></div><div><span>Tests</span><strong>${esc(tests)}</strong></div></div><p class="madadgar-note">Evidence: Studio compiler and VM. Files: ${result.applied ? 'changes applied' : result.rejected ? 'draft rejected' : result.changes.pending ? 'draft staged' : 'unchanged'}. Native execution and Windows behavior are separate checks.</p>`;
  }
  present(result, message) {
    const sources = result.changes.list().filter(file => file.operation !== 'Delete' && file.path.endsWith('.jimsabz'));
    for (const [index, file] of sources.entries()) {
      const card = document.createElement('details'); card.className = 'madadgar-source';
      const text = file.after || ''; card.open = index === 0 && text.split('\n').length <= 35;
      const summary = document.createElement('summary'); summary.textContent = file.path;
      const pre = document.createElement('pre'), code = document.createElement('code');
      code.textContent = text; pre.append(code);
      const copy = button('Copy code', async () => {
        try { await navigator.clipboard.writeText(text); this.host.toast('Code copied.'); }
        catch { this.host.toast('Clipboard is unavailable; select the code to copy it.'); }
      });
      card.append(summary, pre, copy); message.append(card);
    }
    const facts = document.createElement('div'); facts.innerHTML = this.facts(result); message.append(facts);
    result.factsNode = facts;
    const actions = document.createElement('div'); actions.className = 'madadgar-actions';
    if (result.changes.pending) actions.append(button('Review changes', () => this.review(result), 'button primary'));
    actions.append(button('Activity', () => this.activity(result)));
    if (result.references.length) actions.append(button(`Sources (${result.references.length})`, () => this.sources(result)));
    message.append(actions);
    this.status(result.changes.pending ? 'Draft ready · review the code before Apply.' : 'Response ready · no changes staged.');
  }
  review(result) {
    const files = result.changes.list(), entryChanged = result.changes.base.entry !== result.changes.draft.entry;
    this.host.modal('Review agent changes', `<p>Review this isolated draft before applying it to <strong>${esc(result.changes.base.name)}</strong>.</p>
      ${this.facts(result)}${entryChanged ? `<p>Program entry: <code>${esc(result.changes.draft.entry || '(none)')}</code></p>` : ''}
      ${files.map((f, i) => `<details class="madadgar-diff" ${i === 0 ? 'open' : ''}><summary>${esc(f.operation)} · ${esc(f.path)} <span>+${f.added} −${f.removed}</span></summary><pre>${esc(safeText(f.text, 80000))}</pre>${f.operation !== 'Delete' && f.path.endsWith('.jimsabz') ? `<button class="button subtle" data-copy-draft="${i}">Copy draft source</button>` : ''}</details>`).join('')}
      ${result.changes.memory !== undefined ? `<h3>Project notes</h3><pre class="madadgar-pre">${esc(result.changes.memory)}</pre>` : ''}
      ${result.evidence?.diagnostics?.length ? `<h3>Compiler diagnostics</h3><pre class="madadgar-pre">${esc(result.evidence.diagnostics.map(d => `${d.code || ''} ${d.at?.file || ''}:${d.at?.line || ''} ${d.message}`).join('\n'))}</pre>` : ''}
      ${!result.canApply ? '<p class="madadgar-error">The draft did not pass all verification checks. Inspect the compiler diagnostics and Activity before applying.</p>' : ''}
      <p id="madadgar-review-message" role="status"></p><div class="madadgar-actions"><button id="madadgar-apply" class="button primary" ${!result.canApply || result.applied || result.rejected ? 'disabled' : ''}>Apply changes</button><button id="madadgar-reject" class="button subtle" ${result.applied || result.rejected ? 'disabled' : ''}>Reject changes</button></div>`, 'CODE MADADGAR');
    $('#madadgar-apply').onclick = async () => {
      const apply = $('#madadgar-apply'), status = $('#madadgar-review-message');
      if (this.host.busy()) { status.textContent = 'Stop the current request before applying a draft.'; return; }
      apply.disabled = true;
      try {
        const live = this.host.getWorkspace(), before = snapshot(live), next = result.changes.apply(live);
        next.madadgar = { ...next.madadgar, undo: { before, after: snapshot(next) },
          activity: [...(next.madadgar?.activity || []), { type: 'apply', state: 'Completed', detail: `${files.length} reviewed file changes`, time: new Date().toISOString() }].slice(-100) };
        await this.host.commit(next); result.applied = true;
        if (result.factsNode) result.factsNode.innerHTML = this.facts(result);
        $('#modal').close(); this.host.toast('Reviewed agent changes applied. Undo agent edit is available.');
        this.status('Changes applied · use Run code for interactive execution.');
      } catch (error) { status.textContent = error.message; apply.disabled = !result.canApply; }
    };
    $('#madadgar-reject').onclick = () => {
      result.rejected = true;
      if (result.factsNode) result.factsNode.innerHTML = this.facts(result);
      $('#modal').close(); this.host.toast('Draft rejected. Project files were unchanged.');
    };
    document.querySelectorAll('[data-copy-draft]').forEach(node => node.onclick = async () => {
      try { await navigator.clipboard.writeText(files[Number(node.dataset.copyDraft)].after); this.host.toast('Draft source copied.'); }
      catch { this.host.toast('Clipboard access is unavailable; select the draft text to copy it.'); }
    });
  }
  async undo() {
    if (this.host.busy()) return this.host.toast('Stop the current request before undoing an edit.');
    try {
      const live = this.host.getWorkspace();
      const next = undoChange(live, live.madadgar?.undo);
      next.madadgar.undo = null;
      await this.host.commit(next); this.host.toast('The last agent edit was undone.');
    } catch (error) { this.host.toast(error.message); }
  }
  activity(result = this.latest) {
    const rows = result?.activity || this.host.getWorkspace().madadgar?.activity || [];
    this.host.modal('Agent activity', rows.length ? `<div class="madadgar-activity">${rows.map(r => `<div><strong>${esc(r.state)}</strong><span>${esc(r.name ? toolLabel(r.name) : r.type)}</span><p>${esc(r.detail || '')}</p></div>`).join('')}</div>` : '<p>No tool activity in this project yet.</p>', 'CODE MADADGAR');
  }
  sources(result) {
    this.host.modal('Retrieved sources', `<p>These excerpts were retrieved for this response. References keep their version and source line numbers.</p>${result.references.map(r => `<details class="madadgar-diff"><summary>[${esc(r.citation)}] ${esc(r.source)} · ${esc(r.version)} · lines ${r.startLine}–${r.endLine}</summary><pre>${esc(r.text)}</pre></details>`).join('')}`, 'JIMSABZ KNOWLEDGE');
  }
  async knowledge() {
    this.host.modal('Jimsabz knowledge', `<p>Search the implementation profile, versioned guides, checked examples and creator brief.</p><form id="madadgar-search"><label for="madadgar-query">Keyword or question</label><input id="madadgar-query" value="budh input and budhai output" maxlength="500"><button class="button primary">Search documentation</button></form><div id="madadgar-search-results" role="status"></div>`, 'JIMSABZ KNOWLEDGE');
    try {
      const index = new KnowledgeIndex(await loadKnowledge());
      const form = $('#madadgar-search'); if (!form) return;
      form.onsubmit = event => {
        event.preventDefault(); const found = index.search($('#madadgar-query').value);
        $('#madadgar-search-results').innerHTML = found.length ? found.map(r => `<details class="madadgar-diff" open><summary>${esc(r.source)} · ${esc(r.version)} · lines ${r.startLine}–${r.endLine}</summary><pre>${esc(r.text)}</pre></details>`).join('') : '<p>No matching documentation. Try the exact Jimsabz keyword.</p>';
      };
      form.requestSubmit();
    } catch (error) { if ($('#madadgar-search-results')) $('#madadgar-search-results').textContent = error.message; }
  }
  notes() {
    const project = this.host.getWorkspace();
    this.host.modal('Project notes', `<p>Notes belong to <strong>${esc(project.name)}</strong> and are supplied as project context. Keep credentials out of these notes.</p><label for="madadgar-notes">Architecture, conventions, decisions and pending work</label><textarea id="madadgar-notes" class="madadgar-notes" maxlength="8000">${esc(project.madadgar?.memory || '')}</textarea><p id="madadgar-notes-status" role="status"></p><div class="madadgar-actions"><button id="madadgar-notes-save" class="button primary">Save project notes</button><button id="madadgar-notes-clear" class="button subtle">Clear notes</button></div>`, 'CODE MADADGAR');
    $('#madadgar-notes-clear').onclick = () => { $('#madadgar-notes').value = ''; };
    $('#madadgar-notes-save').onclick = async () => {
      const text = $('#madadgar-notes').value, status = $('#madadgar-notes-status');
      if (containsSecrets(text)) { status.textContent = 'A potential credential was detected. Remove it before saving.'; return; }
      const live = this.host.getWorkspace();
      if (live.id !== project.id || this.host.busy()) { status.textContent = 'Stop the request and open notes in the current project before saving.'; return; }
      live.madadgar = { ...live.madadgar, memory: text };
      try { await this.host.store.save(live); $('#modal').close(); this.host.toast('Project notes saved.'); }
      catch { status.textContent = 'Notes could not be saved. Try again or export your project.'; }
    };
  }
  history() {
    const project = this.host.getWorkspace(), rows = project.madadgar?.history || [];
    this.host.modal('Project conversation history', `${rows.length ? rows.map(m => `<div class="madadgar-history"><strong>${esc(m.role)}</strong><pre>${esc(m.content)}</pre></div>`).join('') : '<p>No local conversation saved in this project yet.</p>'}<div class="madadgar-actions"><button id="madadgar-clear-history" class="button subtle">Clear conversation history</button><button id="madadgar-show-activity" class="button subtle">View activity</button></div>`, 'CODE MADADGAR');
    $('#madadgar-show-activity').onclick = () => this.activity({ activity: project.madadgar?.activity || [] });
    $('#madadgar-clear-history').onclick = async () => {
      const live = this.host.getWorkspace();
      if (live.id !== project.id || this.host.busy()) return this.host.toast('Stop the request before clearing history.');
      live.madadgar = { ...live.madadgar, history: [], activity: [], lastRequest: '', topic: '' };
      try { await this.host.store.save(live); this.latest = null; $('#modal').close(); this.host.toast('Conversation history and agent activity cleared.'); }
      catch { this.host.toast('History could not be saved. Try again.'); }
    };
  }
}
