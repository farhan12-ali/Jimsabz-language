import {DebugController} from "./debugger.mjs";
import { compile, astText, disassemble } from "./compiler.mjs";
import { VM } from "./vm.mjs";
import { tick } from "./engine.mjs";
let debuggerSession=null;
let vm = null,
  input = null,
  busy = false;
let executionGate = null, executionStarted = null;
const send = (type, data = {}) => postMessage({ type, ...data, atTime: Date.now() });
function fault(error) {
  send("fault", {
    ms: executionStarted === null ? null : performance.now() - executionStarted,
    diagnostic: error.toJSON?.() || {
      code: "RUN-01",
      stage: 6,
      at: { file: "main.jimsabz", line: 1, col: 1 },
      message: error.message,
    },
  });
}
onmessage = async ({ data }) => {
  if (data.type === 'factory-execute') {
    if (executionGate && data.runId === executionGate.runId) { const accept = executionGate.resolve; executionGate = null; accept(); }
    return;
  }
  if(data.type==="debug-command"){debuggerSession?.command(data);return;}
  if (data.type === "input") {
    const accept = input;
    input = null;
    accept?.(data.value);
    return;
  }
  if (data.type === "tick") {
    if (!vm?.world.active || busy) return;
    busy = true;
    try {
      send("frame", { world: await tick(vm, data.dt, data.input) });
    } catch (error) {
      fault(error);
      vm = null;
    } finally {
      busy = false;
    }
    return;
  }
  if (data.type !== "run" && data.type !== "check") return;
  try {
    executionStarted = null;
    if (data.factory) send("factory-start");
    const result = await compile(data.files, data.entry, (index, stage) =>
      send("stage", { index, stage }),
      {trace: true},
    );
    send("compiled", {
      result: {
        ...result,
        ast: null,
        astText: result.ast ? astText(result.ast) : "",
        analysis: result.analysis
          ? {
              globals: result.analysis.globals,
              libraries: result.analysis.libraries,
            }
          : null,
        bytecodeText: result.program ? disassemble(result.program) : "",
      },
    });
    if (!result.ok || data.type === "check") return;
    if (data.factory) {
      const handoff = new Promise(resolve => { executionGate = { resolve, runId: data.runId }; });
      send('execution-ready');
      await handoff;
    }
    executionStarted = performance.now();
    send('execution-started');
    debuggerSession=data.debug?new DebugController(send,{entry:true,breakpoints:data.breakpoints||[]}):null;
    vm = new VM(
      result.program,
      {
        print: (text) => send("output", { text }),
        warning: (text) => { send("warning", { text }); send("output",{text:"Warning: "+text+"\n"}); },
        debug: debuggerSession?(at,frames)=>debuggerSession.instruction(at,frames):null,
        read: () => {
          send("input-request");
          return new Promise((resolve) => (input = resolve));
        },
        file: (file) => send("file", { file }),
        sound: (command) => send("sound", { command }),
      },
      data.files,
    );
    send("stage", {
      index: 6,
      stage: {
        state: "running",
        detail: "Executing your compiled instructions.",
      },
    });
    const start = executionStarted;
    await vm.run();
    if (vm.world.active) {
      send("frame", { world: vm.snapshot() });
      send("game-started");
    } else {
      send("stage", {
        index: 6,
        stage: {
          state: "passed",
          detail: `Finished in ${(performance.now() - start).toFixed(1)} ms`,
        },
      });
      send("finished", { ms: performance.now() - start });
    }
  } catch (error) {
    fault(error);
  }
};
