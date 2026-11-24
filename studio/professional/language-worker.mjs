import { analyzeProject } from './language-service.mjs';
self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, result: await analyzeProject(data.files, data.entry) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
