import assert from "node:assert/strict";
import { writeCodeLines } from "../studio/agent/writer.mjs";

const source = '// Salam — سلام\n\nbudhai "Farhan"\n';
const frames = [];
await writeCodeLines(source, { delayMs: 0, onLine: (p) => frames.push(p) });
assert.deepEqual(
  frames.map((p) => p.line),
  [1, 2, 3],
);
assert.equal(frames[0].text, "// Salam — سلام\n");
assert.equal(frames[1].text, "// Salam — سلام\n\n");
assert.equal(frames.at(-1).text, source);
console.log(
  "PASS each visible update adds one line and preserves Unicode/blank lines",
);

const endings = ["budhai 1", "budhai 1\r\n\r\nbudhai 2\r\n", ""];
for (const code of endings) {
  const result = await writeCodeLines(code, { delayMs: 0, onLine() {} });
  assert.equal(result.text, code);
}
console.log("PASS no final newline, CRLF and empty source remain intact");

const canceled = new AbortController();
let calls = 0;
await assert.rejects(
  writeCodeLines("one\ntwo\nthree", {
    signal: canceled.signal,
    delayMs: 10000,
    onLine({ line }) {
      calls++;
      if (line === 1) canceled.abort();
    },
  }),
  { name: "AbortError" },
);
assert.equal(calls, 1);
console.log("PASS Stop leaves the visible draft and prevents later lines");

const before = new AbortController();
before.abort();
await assert.rejects(
  writeCodeLines("one\ntwo", {
    signal: before.signal,
    onLine() {
      assert.fail("Canceled request wrote a line");
    },
  }),
  { name: "AbortError" },
);
console.log("PASS cancel before writing creates no visible code");

const waiting = new AbortController();
let firstLine;
const ready = new Promise((resolve) => (firstLine = resolve));
const pending = writeCodeLines("one\ntwo", {
  signal: waiting.signal,
  delayMs: 10000,
  onLine() {
    firstLine();
  },
});
await ready;
waiting.abort();
await assert.rejects(pending, { name: "AbortError" });
console.log("PASS Stop interrupts a pending line delay immediately");

const restarted = [];
await writeCodeLines('budhai "Again"\n', {
  delayMs: 0,
  onLine: (p) => restarted.push(p.text),
});
assert.deepEqual(restarted, ['budhai "Again"\n']);
console.log("PASS a new writing request works after cancellation");
