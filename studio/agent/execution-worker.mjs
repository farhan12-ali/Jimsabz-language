import { executeSnapshot } from './execution.mjs';
self.onmessage = async event => {
  try { self.postMessage({ result: await executeSnapshot(event.data) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
