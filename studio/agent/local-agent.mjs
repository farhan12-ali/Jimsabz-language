import { professionalGenerate as generate } from '../professional/agent-programs.mjs';
import { answerLanguageQuestion } from './knowledge.mjs';
import { ChangeSet } from './changes.mjs';
import { KnowledgeIndex, chunkDocument } from './retrieval.mjs';
import { ToolSession } from './tools.mjs';
import { lex } from '../core/language.mjs';
import { validatePath } from '../core/files.mjs';
import { safeText, containsSecrets } from './safety.mjs';
import { normalizeRequest, interpretRequest, isGenerationRequest } from './request.mjs';

const currentSource = project => project.files.find(f => f.path === project.active && f.path.endsWith('.jimsabz'))
  || project.files.find(f => f.path === project.entry && f.path.endsWith('.jimsabz'));
const question = /^(?:please\s+)?(?:what|why|how|explain|teach|tell me|can i|can we|does|samjhao)\b|کیا|کیسے|ڇا|ڪيئن/i;
const fixing = /\b(fix|repair|correct|debug)\b|درست|غلطي/i;
const checking = /^(?:please\s+)?(?:check|compile|validate)\b|^(?:is|does)\s+(?:my|this|the current)\s+(?:code|program|file)\b/i;
const running = /^(?:please\s+)?(?:run|execute)\s+(?:my|this|the|current|active|code|program)\b/i;
const testing = /^(?:please\s+)?test\s+(?:my|this|the|current|active|code|program)\b/i;
const explaining = /\bexplain\s+(?:(?:my|this|the|current|active)\s+)*(?:code|program|file)\b/i;
const analyzing = /\b(?:analy[sz]e|summari[sz]e|inspect)\s+(?:my\s+|this\s+|the\s+)?(?:project|workspace|folder)\b/i;
const searching = /^(?:please\s+)?(?:search|find|look up)\s+(?:the\s+)?(?:docs|documentation|reference)\b/i;
export function parseRunFixture(prompt) {
  const marker = /\binputs?\s*[:=]?\s*\[/i.exec(prompt);
  let values = [];
  if (marker) {
    const start = marker.index + marker[0].length - 1;
    let end = start, depth = 0, quoted = false, escaped = false;
    for (; end < prompt.length; end++) {
      const c = prompt[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '[') depth++;
      else if (c === ']' && --depth === 0) { end++; break; }
    }
    try { values = JSON.parse(prompt.slice(start, end)); } catch { throw new Error('Use a JSON input list, for example inputs: ["Farhan", "3", "90", "80", "70"].'); }
    if (!Array.isArray(values) || values.length > 2000 || values.some(v => !['string', 'number', 'boolean'].includes(typeof v)))
      throw new Error('Provide up to 2,000 text, number or Boolean inputs.');
    values = values.map(String);
  }
  const expected = prompt.match(/\bexpected(?:\s+output)?\s*[:=]\s*("(?:[^"\\]|\\.)*")/i);
  return { inputs: values, ...(expected ? { expectedOutput: JSON.parse(expected[1]) } : {}) };
}
function availablePath(project, requested) {
  requested = validatePath(requested);
  const dot = requested.lastIndexOf('.'), stem = dot < 0 ? requested : requested.slice(0, dot), ext = dot < 0 ? '' : requested.slice(dot);
  let path = requested, suffix = 2;
  const used = candidate => project.files.some(f => f.path.toLowerCase() === candidate.toLowerCase() || f.path.toLowerCase().startsWith(candidate.toLowerCase() + '/'));
  while (used(path)) path = `${stem}-${suffix++}${ext}`;
  return path;
}
function sourceOffset(text, at) {
  let offset = 0;
  for (let line = 1; line < at.line; line++) {
    const next = text.indexOf('\n', offset); if (next < 0) return text.length; offset = next + 1;
  }
  return offset + at.col - 1;
}
export function repairCandidate(text, diagnostic, path) {
  if (!diagnostic) return null;
  if (diagnostic.code === 'SEM-01') {
    const library = diagnostic.message.match(/kharna\s+(gui3d|gui|hisab|audio|waqt|shabak|Core|Text|Collections|Math|Async)\b/)?.[1];
    if (library) return { text: `kharna ${library}\n${text}`, reason: `Add the required ${library} import.` };
  }
  let tokens;
  try { tokens = lex(text, path).filter(t => !['newline', 'end'].includes(t.kind)); } catch { return null; }
  if (/budhai.*budh|budh.*budhai/i.test(diagnostic.message)) {
    const edits = [];
    for (let i = 1; i < tokens.length - 1; i++) {
      if (tokens[i].text === 'budhai' && tokens[i - 1].text === '=' && tokens[i + 1].text === '(')
        edits.push(sourceOffset(text, tokens[i].at));
    }
    if (edits.length) {
      for (const at of edits.reverse()) text = text.slice(0, at) + 'budh' + text.slice(at + 6);
      return { text, reason: 'Use budh(...) for input assignments; keep budhai output unchanged.' };
    }
  }
  if (diagnostic.code === 'SYN-02' && /\}|brace|end of|end-of|EOF/i.test(diagnostic.message)) {
    const stack = [], closing = { '{': '}', '(': ')', '[': ']' };
    for (const t of tokens) {
      if (t.kind !== 'symbol') continue;
      if (Object.hasOwn(closing, t.text)) stack.push(closing[t.text]);
      else if (['}', ')', ']'].includes(t.text) && stack.pop() !== t.text) return null;
    }
    if (stack.length > 0 && stack.length <= 8 && stack.every(c => c === '}'))
      return { text: text + '\n' + stack.reverse().join('\n') + '\n', reason: 'Close unmatched blocks found by the lexer.' };
  }
  return null;
}
function describeSource(text, path, evidence) {
  let words = [];
  try { words = lex(text, path).filter(t => t.kind === 'word').map(t => t.text); } catch {}
  const facts = [
    ['budh', 'budh(...) reads input from the user.'], ['budhai', 'budhai prints values.'],
    ['kam', 'kam defines reusable functions.'], ['wapas', 'wapas returns a value from a function.'],
    ['qatar', 'qatar declares an array.'], ['gin', 'gin repeats over a counter or array.'],
    ['wori', 'wori repeats while its condition is true.'], ['jey', 'jey / na_ta select a conditional branch.'],
    ['qism', 'qism defines a class/structured type.'], ['kharna', 'kharna imports a library or source module.'],
  ].filter(([word]) => words.includes(word)).map(([, explanation]) => explanation);
  return `${path} has ${text.split('\n').length} lines.\n\n${facts.join('\n') || 'This file contains Jimsabz expressions and statements.'}\n\n` +
    (evidence.ok ? `The actual compiler accepted this file (${evidence.instructions} main instructions). It has not been run.` : diagnosticText(evidence));
}
function diagnosticText(evidence) {
  return (evidence?.diagnostics || []).map(d => `${d.code || 'Error'} · ${d.at?.file || evidence.entry || ''}:${d.at?.line || 1}:${d.at?.col || 1}\n${d.message}`).join('\n\n');
}
function retrievalQuery(prompt) {
  return prompt.replace(/\b(what|how|why|do|does|is|are|can|i|we|the|a|an|please|me|my|this|explain|tell|jimsabz)\b/gi, ' ').trim();
}
export async function runLocalAgent({ prompt, workspace, chunks = [], model, runner, attachments = [], signal,
  onEvent = () => {}, generator = generate }) {
  signal?.throwIfAborted();
  if (typeof prompt !== 'string' || prompt.length > 60000) throw new Error('Use a request of at most 60,000 characters.');
  if (containsSecrets(prompt)) throw new Error('A potential secret was detected. Replace it with a placeholder before sending.');
  prompt = normalizeRequest(prompt);
  const changes = new ChangeSet(workspace), activity = [];
  const emit = event => {
    const item = { ...event, time: new Date().toISOString() };
    if (item.type !== 'plan') activity.push(item);
    onEvent(item);
  };
  const notes = workspace.madadgar?.memory
    ? chunkDocument(workspace.madadgar.memory, 'workspace/project-notes', 'project notes — unverified').map(c => ({ ...c, authority: .6 })) : [];
  const session = new ToolSession({ changes, runner, signal, onEvent: emit,
    index: new KnowledgeIndex([...chunks, ...notes, ...attachments.flatMap(a => chunkDocument(a.text || '', 'attachment/' + a.name, 'user report — unverified'))]) });
  const call = async (name, args = {}) => {
    signal?.throwIfAborted(); emit({ type: 'tool', name, state: 'In Progress', detail: 'Running locally.' });
    try {
      const result = await session.call(name, args); signal?.throwIfAborted();
      emit({ type: 'tool', name, state: 'Completed', detail: result?.staged ? 'Draft staged for review.' : 'Local tool completed.' }); return result;
    } catch (error) { emit({ type: 'tool', name, state: 'Failed', detail: safeText(error.message, 1000) }); throw error; }
  };
  const plan = [ { title: 'Inspect the request and project', state: 'Completed' },
    { title: 'Use local Jimsabz knowledge and tools', state: 'In Progress' },
    { title: 'Verify the result', state: 'Pending' } ];
  emit({ type: 'plan', tasks: plan });
  const source = currentSource(workspace), entry = source?.path || workspace.entry;
  const references = session.referencesFor(retrievalQuery(prompt));
  const fenced = prompt.match(/```jimsabz\s*\n([\s\S]*?)```/i);
  let message = '', generated = null, request = '', topic = '', followUps = [], bytecode = '';
  const requireSource = () => { if (!source) throw new Error('Open a .jimsabz source file first.'); };
  if (!fenced && interpretRequest(prompt).intent === 'login' && interpretRequest(prompt).architectureOnly) {
    const answer = await generator(prompt, { model, topic: workspace.madadgar?.topic });
    message = answer.message; topic = answer.topic; followUps = answer.followUps || [];
  } else if (!fenced && !isGenerationRequest(prompt) && (question.test(prompt.trim()) || searching.test(prompt)) && !checking.test(prompt) && !explaining.test(prompt)) {
    const help = answerLanguageQuestion(prompt, { topic: workspace.madadgar?.topic });
    topic = help?.topic || '';
    if (help?.message && help.topic !== 'overview' && !searching.test(prompt)) {
      message = help.message; followUps = help.followUps || [];
    } else if (references.length) {
      message = 'From the bundled Jimsabz documentation:\n\n' + references.slice(0, 3)
        .map(r => `${r.citation} ${r.source} (${r.version})\n${safeText(r.text, 2200)}`).join('\n\n');
    } else message = 'I can help with Jimsabz types, input/output, arrays, functions, classes, loops, conditions, compiler errors and supported game starters. Name a keyword or describe the program you want.';
  } else if (!fenced && analyzing.test(prompt)) {
    const info = await call('analyze_project');
    message = `${info.name}\nEntry: ${info.entry || '(none)'}\n${info.files} files · ${info.sources.length} Jimsabz source files\n\n` + info.sources.map(f => `${f.path}: ${f.lines} lines`).join('\n');
  } else if (!fenced && (checking.test(prompt) || explaining.test(prompt) || running.test(prompt) || testing.test(prompt) || /^inspect\s+(?:the\s+)?bytecode/i.test(prompt))) {
    requireSource(); await call('read_file', { path: entry });
    const fixture = parseRunFixture(prompt);
    if (testing.test(prompt) && fixture.expectedOutput === undefined) {
      message = 'A test needs an expected result. For example:\nTest my code with inputs: ["7", "5"] expected output: "12\\n"\n\nUse Run code for interactive input, or ask "Check my code" to compile it.';
    } else if (testing.test(prompt)) {
      const result = await call('execute_tests', { entry, cases: [{ name: 'User-specified expected output', ...fixture }] });
      message = result.ok ? `${result.passed} test passed · ${result.failed} failed.\nActual output:\n${result.tests?.[0]?.output || ''}` : diagnosticText(result);
    } else if (running.test(prompt)) {
      const result = await call('run_jimsabz', { entry, inputs: fixture.inputs });
      message = !result.ok ? diagnosticText(result) : result.runtime === 'Passed'
        ? `Executed ${entry} in the local Studio VM.\n\n${result.run.output || '(No terminal output.)'}${result.run.game ? '\nHeadless game initialization passed. Use Run code to play it.' : ''}`
        : `${result.run.output || ''}\n${result.run.diagnostic?.message || 'Execution failed.'}\nSupply sample inputs as inputs: ["value1", "value2"], or use Run code for interactive input.`;
    } else {
      const result = await call('compile_jimsabz', { entry });
      if (explaining.test(prompt)) message = describeSource(source.text, entry, result);
      else if (/bytecode/i.test(prompt) && result.ok) { bytecode = result.bytecodeText; message = `Actual stack instructions for ${entry}:\n\n${bytecode}`; }
      else message = result.ok ? `Compiler checks passed for ${entry}.\nLexer, parser, AST, semantic analysis, code generation and asset validation passed. Runtime: Not Run.` : diagnosticText(result);
    }
  } else if (!fenced && fixing.test(prompt) && !isGenerationRequest(prompt)) {
    requireSource();
    const original = await call('compile_jimsabz', { entry });
    if (original.ok) message = 'The current source passes compiler checks. Describe the wrong behavior and its expected result so I can identify a supported change.';
    else {
      const diagnostic = original.diagnostics[0], target = diagnostic.at?.file || entry;
      const file = await call('read_file', { path: target });
      const fix = repairCandidate(file.text, diagnostic, target);
      if (!fix) message = diagnosticText(original) + '\n\nThis repair is outside the local automatic fixes. I can repair a missing library import, unmatched closing blocks, or the old input spelling. The original files are unchanged.';
      else {
        await call('edit_file', { path: target, text: fix.text });
        await call('set_entry', { path: entry });
        const result = await call('compile_jimsabz', { entry });
        message = result.ok ? `${fix.reason}\nThe complete draft now passes compiler checks. Review the change before applying it.`
          : `A possible repair was staged, but compilation still fails. Apply is disabled.\n\n${diagnosticText(result)}`;
      }
    }
  } else {
    if (fenced) generated = { code: fenced[1], name: prompt.match(/\b(?:file|as|named)\s+["']?([\w./-]+\.jimsabz)/i)?.[1] || 'program.jimsabz', title: 'Provided Jimsabz source' };
    else generated = await generator(prompt, { model, code: source?.text || '', attachments,
      topic: workspace.madadgar?.topic, lastRequest: workspace.madadgar?.lastRequest || '' });
    signal?.throwIfAborted();
    if (!generated.code) { message = generated.message; topic = generated.topic || ''; followUps = generated.followUps || []; }
    else {
      const overwrite = !!source && /\b(?:replace|rewrite)\s+(?:(?:my|this|the|current|active)\s+)*(?:code|program|file)\b/i.test(prompt);
      const files = generated.files || [{ path: generated.name || 'program.jimsabz', text: generated.code, kind: 'source' }];
      const oldRoot = workspace.entry?.endsWith('/' + generated.name) ? workspace.entry.slice(0, -generated.name.length) : '';
      const previousSources = generated.previousFiles?.filter(f => f.path.endsWith('.jimsabz')) || [];
      const revise = !!oldRoot && previousSources.length > 0 && previousSources.every(f => changes.draft.files.some(old => old.path === oldRoot + f.path && old.text === f.text));
      const prefix = revise ? oldRoot : generated.projectName ? availablePath(changes.draft, generated.projectName) + '/' : '';
      let main = '';
      for (const file of files) {
        const desired = prefix + validatePath(file.path);
        let path;
        if (revise && changes.draft.files.some(old => old.path === desired)) {
          path = desired; const old = await call('read_file', { path });
          const previous = generated.previousFiles.find(f => f.path === file.path);
          if (file.path.endsWith('.jimsabz') || old.text === previous?.text) await call('edit_file', { path, text: file.text });
        }
        else if (overwrite && files.length === 1) { path = source.path; await call('read_file', { path }); await call('edit_file', { path, text: file.text }); }
        else { path = availablePath(changes.draft, desired); await call('create_file', { path, text: file.text }); }
        if (file.path === generated.name || (!main && path.endsWith('.jimsabz'))) main = path;
      }
      await call('set_entry', { path: main });
      const result = await call('compile_jimsabz', { entry: main });
      request = generated.request || prompt; topic = generated.topic || generated.intent || ''; followUps = generated.followUps || [];
      let verified = null;
      if (result.ok && generated.fixtures?.length) verified = await call('execute_tests', { entry: main, cases: generated.fixtures });
      message = result.ok ? `${generated.title || 'Jimsabz program'}\n\n${generated.summary || 'The requested Jimsabz source is ready to review.'}${generated.assumptions?.length ? '\n\nAssumptions: ' + generated.assumptions.join(' ') : ''}\n\n${files.map(f => f.path).join(' · ')}\nCompiler: Passed.${verified ? ` Example tests: ${verified.passed} passed, ${verified.failed} failed.` : ' Runtime: Not Run.'}\nReview changes, then Apply changes. Use Run code for the separate input/output window.\n${generated.limitations || ''}`
        : `This source did not pass compiler checks. It is a draft; Apply is disabled.\n\n${diagnosticText(result)}`;
      if (verified?.failed) message += '\nThe example test failed. Apply is disabled; inspect Activity before continuing.';
    }
  }
  signal?.throwIfAborted();
  plan[1].state = 'Completed'; plan[2].state = session.evidence && (!session.evidence.ok || session.runtime?.failed > 0) ? 'Failed' : 'Completed';
  if (changes.pending) plan.push({ title: 'Review and apply the draft', state: 'Waiting for Approval' });
  emit({ type: 'plan', tasks: plan });
  emit({ type: 'result', state: changes.pending ? 'Waiting for Approval' : 'Completed', detail: changes.pending ? 'Local draft ready for review.' : 'Local response ready.' });
  const evidence = session.evidenceRevision === changes.revision ? session.evidence : null;
  const runtime = session.runtimeRevision === changes.revision ? session.runtime : null;
  const sourceChanges = changes.list().some(f => f.path.endsWith('.jimsabz')) || changes.base.entry !== changes.draft.entry;
  return { madadgar: true, local: true, message: safeText(message, 30000), changes, evidence, runtime,
    canApply: !sourceChanges || (!!evidence?.ok && evidence.entry === changes.draft.entry && !(runtime?.failed > 0)), activity, plan,
    references: [...session.references.values()], request, topic, followUps, engine: 'Built-in local Jimsabz agent' };
}
