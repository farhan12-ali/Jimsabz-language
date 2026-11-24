import { examples } from "./examples.mjs";
import { checkExample } from "./check-examples.mjs";

let busy = false;
onmessage = async ({ data }) => {
  if (data.type !== "start" || busy) return;
  busy = true;
  let passed = 0;
  for (const example of examples) {
    postMessage({ type: "checking", id: example.id });
    try {
      const result = await checkExample(example);
      if (result.ok) passed++;
      postMessage({ type: "result", result });
    } catch (error) {
      postMessage({ type: "result", result: { id: example.id, ok: false, message: error.message } });
    }
  }
  postMessage({ type: "complete", passed, total: examples.length });
  busy = false;
};
