import { compile } from '../core/compiler.mjs';
import { VM } from '../core/vm.mjs';
self.onmessage = async ({ data }) => {
  try {
    const result = await compile(data.files, data.entry);
    if (!result.ok) { self.postMessage({ error: result.diagnostics[0].message, diagnostic: result.diagnostics[0] }); return; }
    if (result.analysis.libraries.includes('shabak')) throw new Error('Network scenes need the normal Run window.');
    const vm = new VM(result.program, { print() {}, read() { throw new Error('Scene initialization needs input. Use Run code instead.'); }, warning() {}, file() {}, sound() {} }, data.files);
    await vm.run(); self.postMessage({ world: vm.snapshot() });
  } catch (e) { self.postMessage({ error: e.message, diagnostic: e.toJSON?.() }); }
};
