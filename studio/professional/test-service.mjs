import { SandboxRunner } from '../agent/execution.mjs';

export const TEST_SUFFIX = '.tests.json';
export function discoverTests(project) {
  const suites = [];
  for (const file of project.files.filter(f => f.path.endsWith(TEST_SUFFIX) && typeof f.text === 'string')) {
    try {
      const data = JSON.parse(file.text);
      if (data.version !== 1 || typeof data.entry !== 'string' || !Array.isArray(data.cases) || !data.cases.length || data.cases.length > 20)
        throw new Error('Use version: 1, entry, and between 1 and 20 cases.');
      if (!project.files.some(f => f.path === data.entry && f.path.endsWith('.jimsabz'))) throw new Error('The suite entry file is missing.');
      data.cases.forEach((c, i) => {
        if (!Array.isArray(c.inputs || []) || c.inputs?.some(x => !['string', 'number', 'boolean'].includes(typeof x)) ||
          (typeof c.expectedOutput !== 'string' && typeof c.expectedError !== 'string')) throw new Error('Case ' + (i + 1) + ' needs inputs and expectedOutput or expectedError.');
      });
      suites.push({ path: file.path, ...data, cases: data.cases.map((c, i) => ({ ...c, name: c.name || 'Case ' + (i + 1) })) });
    } catch (error) { suites.push({ path: file.path, error: error.message, cases: [] }); }
  }
  return suites;
}
export function outputDifference(expected, actual) {
  let offset = 0;
  while (offset < expected.length && offset < actual.length && expected[offset] === actual[offset]) offset++;
  if (expected === actual) return null;
  const before = expected.slice(0, offset).split('\n');
  return { offset, line: before.length, column: before.at(-1).length + 1,
    expected: expected.slice(Math.max(0, offset - 25), offset + 100), actual: actual.slice(Math.max(0, offset - 25), offset + 100) };
}
export async function runTestSelection(project, selection, { runner = new SandboxRunner(), signal, onResult = () => {} } = {}) {
  const suites = discoverTests(project), results = [];
  for (const suite of suites) {
    if (suite.error) { const item = { path: suite.path, status: 'Failed', message: suite.error }; results.push(item); onResult(item); continue; }
    for (const [i, test] of suite.cases.entries()) {
      if (selection && selection !== suite.path && selection !== suite.path + ':' + i) continue;
      signal?.throwIfAborted(); const start = performance.now(); let item;
      try {
        const evidence = await runner.execute({ action: 'tests', entry: suite.entry, files: project.files, cases: [test] }, signal);
        const result = evidence.tests?.[0];
        item = { path: suite.path, index: i, entry: suite.entry, name: test.name, status: result?.status || 'Failed',
          output: result?.output || '', expectedOutput: test.expectedOutput, expectedError: test.expectedError,
          diagnostic: result?.diagnostic || evidence.diagnostics?.[0],
          message: result ? result.status === 'Passed' ? 'Expected result matched.' : 'Actual result differs from the expected result.' : evidence.diagnostics?.[0]?.message || 'Compilation failed.',
          difference: typeof test.expectedOutput === 'string' ? outputDifference(test.expectedOutput, result?.output || '') : null, ms: performance.now() - start };
      } catch (error) {
        if (signal?.aborted) throw error;
        item = { path: suite.path, index: i, entry: suite.entry, name: test.name, status: 'Failed', message: error.message, ms: performance.now() - start };
      }
      results.push(item); onResult(item);
    }
  }
  return results;
}
