const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const put = (selector, value) => { const node = $(selector); if (node && node.textContent !== value) node.textContent = value; };

// This surface reads the existing state and delegates actions to Studio.
// It neither compiles source nor consumes input for the separate Run window.
export class StudioSurface {
  constructor(host) { this.host = host; this.code = null; this.view = 'journey'; this.scheduled = false; }
  initialize() {
    document.querySelectorAll('[data-ui-action]').forEach(button => button.addEventListener('click', () => this.action(button.dataset.uiAction)));
    $('#build-code').onclick = () => this.host.build();
    $('#ide-output-window').onclick = () => this.outputWindow();
    $('#collapse-project').onclick = () => {
      const body = $('#project-explorer-body'), open = body.hidden;
      body.hidden = !open;
      $('#collapse-project').setAttribute('aria-expanded', String(open));
      $('#collapse-project').setAttribute('aria-label', open ? 'Collapse project explorer' : 'Expand project explorer');
    };
    const tabs = [...document.querySelectorAll('[data-dock-view]')];
    tabs.forEach((tab, index) => {
      tab.onclick = () => this.selectView(tab.dataset.dockView);
      tab.onkeydown = event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); this.selectView(tabs[next].dataset.dockView); tabs[next].focus();
      };
    });
    this.observer = new MutationObserver(() => this.schedule());
    ['#pipeline', '#app-status', '#run-state', '#diagnostic', '#highlight', '#cursor-position'].forEach(selector => {
      this.observer.observe($(selector), { subtree: true, childList: true, characterData: true, attributes: selector === '#diagnostic' });
    });
    const editor = $('#editor');
    editor.addEventListener('scroll', () => this.minimap());
    editor.addEventListener('click', () => this.minimap());
    editor.addEventListener('keyup', () => this.minimap());
    $('#editor-minimap').onclick = event => {
      const rect = event.currentTarget.getBoundingClientRect();
      editor.scrollTop = Math.max(0, (event.clientY - rect.top) / rect.height * editor.scrollHeight - editor.clientHeight / 2);
    };
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); this.search(); }
    });
    this.update();
  }
  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => { this.scheduled = false; this.update(); });
  }
  action(name) {
    const actions = {
      home: () => $('#home').click(), project: () => $('#switch-folder').click(),
      code: () => $('#editor').focus(), run: () => $('#run').click(),
      debug: () => $('#debug-run').click(), tools: () => this.host.tools(),
      lab: () => $('#visualize-compiler').click(), 'new-file': () => $('#new-file').click(),
      search: () => this.search(), settings: () => this.settings(),
      'compiler-details': () => { $('#compiler-panel').open = true; $('#inspect').click(); },
      'output-window': () => this.outputWindow(),
    };
    actions[name]?.();
  }
  selectView(view) {
    this.view = view; $('#compiler-panel').open = true;
    document.querySelectorAll('[data-dock-view]').forEach(tab => {
      const active = tab.dataset.dockView === view;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    });
    this.update();
  }
  outputWindow() {
    if (this.host.snapshot().popup) $('#show-run-window').click();
    else $('#run').click();
  }
  minimap() {
    const editor = $('#editor'), map = $('#editor-minimap');
    const height = map.clientHeight, scroll = editor.scrollHeight || 1;
    $('#minimap-viewport').style.height = Math.min(height, Math.max(18, editor.clientHeight / scroll * height)) + 'px';
    $('#minimap-viewport').style.top = Math.min(height - 18, editor.scrollTop / scroll * height) + 'px';
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
    const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
    $('.code-scroll').style.setProperty('--current-line', (line * lineHeight + parseFloat(getComputedStyle(editor).paddingTop) - editor.scrollTop) + 'px');
  }
  update() {
    const s = this.host.snapshot(); if (!s.project) return;
    if (s.code !== this.code) { this.code = s.code; $('#minimap-code').innerHTML = $('#highlight').innerHTML; }
    this.minimap();
    const dirty = s.result && s.revision !== s.compiledRevision;
    const diagnostics = s.result?.diagnostics || [];
    const failed = diagnostics.length > 0, passed = !!s.result?.ok && !failed;
    const busy = s.stages.some(stage => stage.state === 'running');
    const state = dirty ? 'changed' : failed ? 'failed' : passed ? 'passed' : busy ? 'working' : 'ready';
    $('#compilation-summary').dataset.state = state;
    $('#summary-icon use').setAttribute('href', state === 'passed' ? '#i-check' : state === 'failed' ? '#i-x' : '#i-code');
    put('#build-title', state === 'passed' ? 'Compilation successful!' : state === 'failed' ? 'Let’s fix this.' : state === 'changed' ? 'Ready to build again.' : state === 'working' ? 'Following your code…' : 'Ready when you are.');
    const completed = s.stages.slice(0, 6).filter(stage => stage.state === 'passed');
    put('#build-detail', state === 'passed' ? `${completed.length} compiler stages passed · ${completed.reduce((n, stage) => n + (stage.ms || 0), 0).toFixed(1)} ms` : state === 'failed' ? diagnostics[0].message : state === 'changed' ? 'Your source changed after the last build.' : 'Build or run to see the actual stage results.');
    put('#ide-output-window span', s.popup ? 'View output' : 'Run program');
    $('#build-code').disabled = s.writing || !s.project.files.some(file => file.path === s.project.active && file.path.endsWith('.jimsabz'));
    const sameRun = s.run.project === s.project.name;
    const output = sameRun && s.run.output ? s.run.output : 'Run your code to see its output here.';
    put('#output-preview', output); put('#dock-output-text', output);
    put('#output-state', sameRun ? s.run.status : 'Not run');
    $('#output-state').dataset.state = sameRun ? s.run.status.toLowerCase().replaceAll(' ', '-') : 'idle';
    put('#problem-count', String(diagnostics.length)); $('#problem-count').hidden = diagnostics.length === 0;
    const problemKey = JSON.stringify([diagnostics, dirty, !!s.result]);
    if (this.problemKey !== problemKey) {
      this.problemKey = problemKey;
      $('#dock-problems-content').innerHTML = diagnostics.length
        ? diagnostics.map(d => `<article class="dock-problem"><strong>${esc(d.code)} · ${esc(s.stages[d.stage]?.name || 'Runtime')}</strong><p>${esc(d.message)}</p><button class="text-button" data-go-diagnostic>${esc(d.at?.file || s.project.entry)} · line ${esc(d.at?.line || 1)}</button></article>`).join('') + (dirty ? '<p class="dock-note">These diagnostics belong to the previous build. Build again to check your edits.</p>' : '')
        : `<div class="dock-empty"><svg><use href="${passed && !dirty ? '#i-check' : '#i-code'}"/></svg><h3>${passed && !dirty ? 'No problems found.' : 'No diagnostics yet.'}</h3><p>${passed && !dirty ? 'The current source passed the compiler checks.' : 'Build your current source to check it.'}</p></div>`;
      document.querySelectorAll('[data-go-diagnostic]').forEach(button => button.onclick = () => $('#diagnostic button')?.click());
    }
    put('#dock-logs-text', s.stages.map(stage => `${stage.name.padEnd(20)} ${stage.state}${stage.state === 'passed' ? ' · ' + (stage.ms || 0).toFixed(1) + ' ms' : ''}\n  ${stage.detail || stage.help}`).join('\n'));
    put('#dock-debug-text', sameRun && s.run.debugSnapshot ? JSON.stringify(s.run.debugSnapshot, null, 2) : sameRun && s.run.status === 'Running' ? 'Program running. Set a breakpoint in the output window to pause and inspect variables.' : 'Start Debug to inspect breakpoints and variables in the output window.');
  }
  settings() {
    this.host.modal('Make Studio yours', `<p>Choose your workspace appearance.</p><div class="appearance-choices"><button class="theme-preview theme-preview-dark" data-appearance="dark"><span></span>Neon dark</button><button class="theme-preview theme-preview-light" data-appearance="light"><span></span>Lavender light</button></div><div class="settings-links"><button class="button secondary" id="settings-examples">Language v3 examples</button><button class="button secondary" id="settings-guide">Language guide</button></div><p>Ctrl S · Save &nbsp; / &nbsp; Ctrl Enter · Run &nbsp; / &nbsp; Ctrl K · Search</p>`, 'YOUR WORKSPACE');
    const update = () => document.querySelectorAll('[data-appearance]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.appearance === document.documentElement.dataset.theme)));
    document.querySelectorAll('[data-appearance]').forEach(button => button.onclick = () => { $('#theme-select').value = button.dataset.appearance; $('#theme-select').dispatchEvent(new Event('change', { bubbles: true })); update(); });
    $('#settings-examples').onclick = () => $('#v3-examples').click();
    $('#settings-guide').onclick = () => $('#guide').click(); update();
  }
  search() {
    this.host.modal('Search your project', '<label for="project-search-input" class="search-label">File names and source code</label><input id="project-search-input" class="project-search-input" placeholder="Search this project…" autocomplete="off" maxlength="200"><div id="project-search-results" class="project-search-results" aria-live="polite"></div>', 'PROJECT SEARCH');
    const input = $('#project-search-input'), results = $('#project-search-results');
    const render = () => {
      const query = input.value.trim().toLocaleLowerCase(), files = this.host.snapshot().project.files.filter(file => typeof file.text === 'string');
      const matches = [];
      for (const file of files) {
        if (!query || file.path.toLocaleLowerCase().includes(query)) matches.push({ path: file.path, line: 1, text: file.text.split('\n')[0] });
        else file.text.split('\n').forEach((text, i) => { if (text.toLocaleLowerCase().includes(query) && matches.length < 50) matches.push({ path: file.path, line: i + 1, text }); });
        if (matches.length >= 50) break;
      }
      results.innerHTML = matches.length ? matches.slice(0, 50).map((match, index) => `<button data-search-result="${index}"><strong>${esc(match.path)}<small>line ${match.line}</small></strong><span>${esc(match.text.slice(0, 170)) || 'Empty file'}</span></button>`).join('') : '<p>No matching files or lines.</p>';
      document.querySelectorAll('[data-search-result]').forEach(button => button.onclick = async () => {
        const match = matches[Number(button.dataset.searchResult)];
        await this.host.locate({ file: match.path, line: match.line, col: 1 });
        $('#editor').focus();
      });
    };
    input.oninput = render; render(); input.focus();
  }
}
