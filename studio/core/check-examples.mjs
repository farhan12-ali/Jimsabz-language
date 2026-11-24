import { compile } from "./compiler.mjs";
import { VM } from "./vm.mjs";
import { exampleFile } from "./examples.mjs";

export async function checkExample(example) {
  const start = performance.now();
  const file = exampleFile(example);
  const result = await compile([file], file.path);
  if (!result.ok) return { id: example.id, ok: false, phase: result.diagnostics[0].stage,
    message: result.diagnostics[0].message, diagnostic: result.diagnostics[0] };
  let output = "", reads = 0;
  try {
    const vm = new VM(result.program, {
      print(text) { if (output.length + text.length > 128000) throw new Error("Example output exceeded the check limit."); output += text; },
      read: async () => {
        if (reads >= example.inputs.length) throw new Error("The program requested more input than the sample provides.");
        return String(example.inputs[reads++]);
      },
    });
    await vm.run();
    const ok = output === example.expected && reads === example.inputs.length;
    return { id: example.id, ok, output, reads, ms: performance.now() - start,
      message: ok ? "Compilation and output match the sample." : "The actual output or input count differs from the sample." };
  } catch (error) {
    return { id: example.id, ok: false, output, reads, phase: 6, diagnostic: error.toJSON?.(), message: error.message };
  }
}
