import { compile, disassemble } from '../core/compiler.mjs';
import { VM } from '../core/vm.mjs';
import { tick } from '../core/engine.mjs';
import { privatePath, containsSecrets, safeText } from './safety.mjs';

function diagnostic(error) {
  return error.toJSON?.() || { code: error.code || 'AGENT-RUN', stage: 6, at: error.at, message: safeText(error.message, 4000) };
}
// Executes only Jimsabz bytecode; there is no eval, shell, host filesystem or network tool.
export async function executeSnapshot(request) {
  const { action, entry } = request;
  if (!['compile', 'run', 'tests'].includes(action)) throw new Error('Unknown execution action.');
  const files = structuredClone(request.files.filter(f => !privatePath(f.path)));
  if (files.length > 1000 || files.reduce((n, f) => n + (f.text?.length || f.data?.byteLength || 0), 0) > 32000000)
    throw new Error('The agent execution snapshot exceeds its project size limit.');
  if (files.some(f => typeof f.text === 'string' && containsSecrets(f.text)))
    throw new Error('A potential secret exists in this execution snapshot. Replace it with a placeholder first.');
  const result = await compile(files, entry);
  const evidence = { ok: result.ok, entry, engine: 'Studio compiler and stack VM',
    diagnostics: result.diagnostics, stages: result.stages.map(s => ({ name: s.name, state: s.state, ms: s.ms, detail: s.detail })),
    instructions: result.program?.code?.length || 0, runtime: 'Not Run',
    bytecodeText: result.program ? disassemble(result.program).slice(0, 18000) : '' };
  if (!result.ok || action === 'compile') return evidence;
  // The agent's test environment is isolated from LAN connections.
  if (result.analysis?.libraries?.includes?.('shabak') || result.program?.libraries?.includes?.('shabak'))
    throw new Error('Network programs must be run manually in the normal runtime; agent tests have no network access.');
  async function runCase(inputs = [], ticks = 0) {
    if (!Array.isArray(inputs) || inputs.length > 2000 || inputs.some(x => String(x).length > 10000)) throw new Error('Provide at most 2,000 bounded input values.');
    const queue = inputs.map(String), writes = [];
    let output = '', readCount = 0;
    const vm = new VM(result.program, {
      print(text) {
        if (output.length + text.length > 60000) throw new Error('Program output exceeded 60,000 characters.');
        output += text;
      },
      read: async () => {
        if (!queue.length) throw new Error('Input is required. Supply inputs to run_jimsabz; this run has stopped.');
        readCount++; return queue.shift();
      },
      file: file => writes.push({ path: file.path, characters: file.text?.length || 0 }),
      warning() {}, sound() {},
    }, files);
    try {
      await vm.run();
      ticks = Math.max(0, Math.min(120, Number(ticks) || 0));
      for (let i = 0; i < ticks && vm.world.active; i++) await tick(vm, 1 / 60, { keys: [], mouse: [0, 0] });
      return { status: 'Passed', output: safeText(output), inputsConsumed: readCount, writes,
        game: vm.world.active ? { status: 'Initialized', dimension: vm.world.dimension, entities: vm.world.actors.length, ticks,
          detail: 'Headless VM check; rendering, audio, input controls and frame rate were not measured.' } : null };
    } catch (error) { return { status: 'Failed', output: safeText(output), diagnostic: diagnostic(error), inputsConsumed: readCount, writes }; }
  }
  if (action === 'run') {
    const run = await runCase(request.inputs, request.ticks);
    return { ...evidence, runtime: run.status, run };
  }
  if (!Array.isArray(request.cases) || !request.cases.length || request.cases.length > 20) throw new Error('Supply between 1 and 20 test cases.');
  const tests = [];
  for (const [i, test] of request.cases.entries()) {
    if (typeof test.expectedOutput !== 'string' && typeof test.expectedError !== 'string') throw new Error('Each test needs expectedOutput or expectedError.');
    const run = await runCase(test.inputs, test.ticks);
    const passed = typeof test.expectedError === 'string'
      ? run.status === 'Failed' && (run.diagnostic?.message + ' ' + run.diagnostic?.code).includes(test.expectedError)
      : run.status === 'Passed' && run.output === test.expectedOutput;
    tests.push({ name: safeText(test.name || `Case ${i + 1}`, 160), status: passed ? 'Passed' : 'Failed',
      expectedOutput: test.expectedOutput, expectedError: test.expectedError, ...run, status: passed ? 'Passed' : 'Failed' });
  }
  return { ...evidence, runtime: tests.every(t => t.status === 'Passed') ? 'Passed' : 'Failed', tests,
    passed: tests.filter(t => t.status === 'Passed').length, failed: tests.filter(t => t.status === 'Failed').length };
}

export class SandboxRunner {
  constructor({ WorkerClass = globalThis.Worker, timeout = 8000 } = {}) { Object.assign(this, { WorkerClass, timeout }); }
  execute(request, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      if (!this.WorkerClass) return reject(new Error('Worker execution is unavailable. Use a supported browser.'));
      const worker = new this.WorkerClass(new URL('./execution-worker.mjs', import.meta.url), { type: 'module' });
      let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate();
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(signal.reason || new DOMException('Stopped', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('Agent execution timed out; the isolated worker was stopped.')), this.timeout);
      worker.onmessage = event => event.data.error ? finish(new Error(event.data.error)) : finish(null, event.data.result);
      worker.onerror = event => finish(new Error(event.message || 'The isolated execution worker failed.'));
      signal?.addEventListener('abort', abort, { once: true });
      worker.postMessage(request);
    });
  }
}
