import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createBuildApi } from './build-service.mjs';
try {
  const handle = createBuildApi(async () => new Uint8Array(await readFile(new URL('../studio/assets/jimsabz-runtime.exe', import.meta.url))));
  const response = await handle(new Request(workerData.url, { method: workerData.method, headers: workerData.headers, body: workerData.body }));
  const body = await response.arrayBuffer();
  parentPort.postMessage({ status: response.status, headers: [...response.headers], body }, [body]);
} catch { parentPort.postMessage({ error: 'The isolated build worker could not complete the request.' }); }
