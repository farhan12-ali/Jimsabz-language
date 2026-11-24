import { PHASES } from '../core/compiler-trace.mjs';
export const ROOMS = PHASES.slice(0, 6);
const now = () => Date.now();
export function initialFactory(meta = {}) {
  return { enabled: !!meta.factory, createdAt: meta.capturedAt || now(), sourceRevision: meta.revision,
    stages: ROOMS.map(p => ({ name: p.name, state: 'pending', ms: null, detail: '' })),
    result: null, ready: false, events: [], warnings: [], sequence: 0, transcript: '', outputTruncated: false,
    execution: { status: 'Not Run', startedAt: null, endedAt: null, ms: null }, documentHash: null };
}
export function logFactory(factory, type, detail, data = {}, time = now()) {
  factory.events.push({ sequence: ++factory.sequence, type, time, detail, ...data });
  if (factory.events.length > 1500) factory.events.splice(0, factory.events.length - 1500);
}
export function recordFactoryMessage(state, message) {
  const f = state.factory; if (!f?.enabled) return;
  const time = message.atTime || now();
  if (message.type === 'output' && !message.echo) {
    f.transcript += message.text;
    if (f.transcript.length > 250000) { f.transcript = f.transcript.slice(-180000); f.outputTruncated = true; }
  } else if (message.type === 'source-edited') f.editorChanged = true;
  else if (message.type === 'factory-start') {
    logFactory(f, 'compiler.started', 'The existing Studio compiler received the captured project.', {}, time);
    logFactory(f, 'code.received', state.file, { file: state.file }, time);
  } else if (message.type === 'stage' && message.index < 6) {
    f.stages[message.index] = { ...f.stages[message.index], ...message.stage };
    const kind = { running: 'started', passed: 'completed', failed: 'failed' }[message.stage.state];
    if (kind) logFactory(f, 'phase.' + kind, ROOMS[message.index].name + ': ' + message.stage.detail,
      { phase: message.index, ms: message.stage.state === 'passed' ? message.stage.ms ?? null : null }, time);
  } else if (message.type === 'compiled') {
    f.result = message.result;
    f.stages = message.result.stages.slice(0, 6).map(s => ({ ...s }));
    for (const [i, evidence] of (message.result.trace || []).entries()) if (evidence)
      logFactory(f, 'artifact.generated', `${ROOMS[i]?.output || 'Artifact'}: ${evidence.count ?? 0}`,
        { phase: i, kind: evidence.kind, count: evidence.count }, time);
    for (const warning of message.result.trace?.[5]?.warnings || []) f.warnings.push({ message: warning, phase: 5, time });
    logFactory(f, message.result.ok ? 'compiler.completed' : 'compiler.failed', message.result.ok
      ? 'All six compiler phases passed. Execution has not started.' : message.result.diagnostics[0]?.message || 'Compilation failed.', {}, time);
  } else if (message.type === 'execution-ready') {
    f.ready = true; logFactory(f, 'execution.ready', 'Validated bytecode is waiting for the factory handoff.', {}, time);
  } else if (message.type === 'execution-started') {
    f.ready = false; f.execution = { status: 'Running', startedAt: time, endedAt: null, ms: null };
    logFactory(f, 'execution.started', 'The existing VM started the compiled snapshot.', {}, time);
  } else if (message.type === 'debug-paused' || message.type === 'debug-resumed') {
    f.execution.status = message.type === 'debug-paused' ? 'Paused' : 'Running';
    logFactory(f, message.type === 'debug-paused' ? 'debug.paused' : 'debug.resumed', message.at ? `${message.at.file}:${message.at.line}` : 'The VM resumed.', {}, time);
  } else if (message.type === 'input-request') {
    f.execution.status = 'Waiting for input'; logFactory(f, 'execution.input', 'The VM requested user input.', {}, time);
  } else if (message.type === 'input-accepted') f.execution.status = 'Running';
  else if (message.type === 'warning') {
    f.warnings.push({ message: message.text, phase: 6, time });
    logFactory(f, 'execution.warning', message.text, {}, time);
  } else if (message.type === 'finished') {
    f.ready = false; f.execution.status = 'Passed'; f.execution.endedAt = time; f.execution.ms = message.ms ?? null;
    logFactory(f, 'execution.completed', 'The program finished successfully.', { ms: f.execution.ms }, time);
  } else if (message.type === 'game-started') logFactory(f, 'execution.game', 'The actual game runtime initialized. Gameplay is running.', {}, time);
  else if (message.type === 'fault') {
    f.ready = false;
    if (message.diagnostic.stage === 6) {
      f.execution.status = 'Failed'; f.execution.endedAt = time; f.execution.ms = message.ms ?? null;
      logFactory(f, 'execution.failed', message.diagnostic.message, { diagnostic: message.diagnostic }, time);
    } else {
      f.execution.status = 'Not Run';
      logFactory(f, 'phase.failed', message.diagnostic.message, { phase: message.diagnostic.stage, diagnostic: message.diagnostic }, time);
    }
  } else if (message.type === 'stopped' || message.type === 'editor-closed') {
    f.ready = false;
    if (!['Passed', 'Failed'].includes(f.execution.status)) f.execution.status = f.execution.startedAt ? 'Stopped' : 'Not Run';
    if (f.execution.startedAt && !f.execution.endedAt) f.execution.endedAt = time;
    logFactory(f, message.type === 'stopped' ? 'execution.stopped' : 'editor.disconnected', f.execution.startedAt ? 'Program stopped.' : 'Execution did not start.', {}, time);
  }
}
export function phaseLabel(state) {
  return ({ passed: 'Passed', failed: 'Failed', blocked: 'Not Executed', pending: 'Not Run', running: 'Processing', ready: 'Ready' })[state] || state;
}
export function sourceDocument(state) {
  return state.files.find(f => f.path === state.file && typeof f.text === 'string')?.text || '';
}
export function compilationReport(state, bytecodeBytes = null) {
  const f = state.factory || initialFactory(), result = f.result;
  const report = { schema: 'jimsabz.factory.report.v1', generatedAt: new Date().toISOString(), project: state.project,
    sourceFile: state.file, runId: state.runId, capturedAt: new Date(f.createdAt).toISOString(),
    sourceSha256: f.documentHash || null, sourceRevision: f.sourceRevision ?? null,
    compilation: result ? result.ok ? 'Passed' : 'Failed' : 'Not Complete',
    phases: f.stages.map((s, i) => ({ phase: ROOMS[i].name, status: phaseLabel(s.state), ms: s.state === 'passed' ? s.ms : null, detail: s.detail })),
    execution: { ...f.execution, timing: 'VM wall time, including input/debug pauses when execution finishes; animation time is separate.' },
    errors: state.diagnostic ? [state.diagnostic] : result?.diagnostics || [], warnings: f.warnings,
    artifacts: (result?.trace || []).flatMap((artifact,i) => artifact ? [{ phase: ROOMS[i].name, kind: artifact.kind,
      count: artifact.count, capturedNodes: artifact.tree?.nodes.length, captureComplete: artifact.tree?.complete,
      ...(i === 4 && result.ok ? { format: result.program.format >= 3 ? 'JBC3' : 'JBC2', location: 'In memory', bytes: bytecodeBytes } : {}) }] : []),
    output: f.enabled ? f.transcript : state.output, outputMayBeTruncated: !!f.outputTruncated, events: f.events,
    notes: ['Compiler events and artifacts come from the existing compiler. Animation is a paced presentation of those events.',
      'The parser exposes a parsed syntax tree, not a separate concrete grammar/CST.',
      'No native Windows execution, frame-rate benchmark or external tool action is implied by this report.'] };
  return report;
}

// Motion waits for real phase completion. It cannot pass a failed or pending room.
export class FactoryPlayback {
  constructor({ onChange = () => {}, onExecute = () => {} } = {}) { Object.assign(this, { onChange, onExecute }); this.reset(); }
  reset() { this.position = -1; this.playing = true; this.last = null; this.speed = 1; this.requested = false; this.emit(); }
  update(stages, ready) { this.stages = stages.slice(0,6); this.ready = ready; if(this.position >= 6) this.execute(); }
  get failure() { return this.stages?.findIndex(s => s.state === 'failed') ?? -1; }
  get maximum() {
    if (!this.stages) return -1;
    for (let i = 0; i < 6; i++) if (this.stages[i]?.state !== 'passed') return i;
    return 6;
  }
  tick(time) {
    if (!this.playing) { this.last = time; return; }
    if (this.last === null) { this.last = time; return; }
    const delta = Math.min(100, Math.max(0, time - this.last)); this.last = time;
    this.position = Math.min(this.maximum, this.position + delta / 1300 * this.speed);
    if (this.failure >= 0 && this.position >= this.failure) { this.position = this.failure; this.playing = false; }
    if (this.position >= 6) { this.playing = false; this.execute(); }
    this.emit();
  }
  execute() {
    if (this.ready && !this.requested && this.stages?.every(s => s.state === 'passed')) { this.requested = true; this.onExecute(); }
  }
  seek(index) { this.position = Math.max(-1, Math.min(this.maximum, index)); this.playing = false; this.last = null; this.emit(); if (this.position >= 6) this.execute(); }
  pause() { this.playing = false; this.last = null; this.emit(); }
  resume() { this.playing = true; this.last = null; this.emit(); }
  emit() { this.onChange({ position: this.position, playing: this.playing, room: Math.max(0, Math.min(5, Math.floor(this.position))) }); }
}
