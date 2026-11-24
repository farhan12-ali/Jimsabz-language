import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { examples, exampleFile } from "../studio/core/examples.mjs";
import { checkExample } from "../studio/core/check-examples.mjs";
import { compile } from "../studio/core/compiler.mjs";
import { VM } from "../studio/core/vm.mjs";
import { encodeBytecode } from "../studio/core/binary.mjs";

const native = process.env.JIMSABZ_NATIVE;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jimsabz-presentation-"));
let passed = 0;
const results = [];
async function check(name, action) {
  await action(); passed++; results.push({ name, passed: true }); console.log("PASS " + name);
}
async function run(code, inputs = []) {
  const file = { path: "main.jimsabz", text: code };
  const result = await compile([file], file.path);
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  let output = "", reads = 0;
  await new VM(result.program, {
    print: text => output += text,
    read: async () => { assert.ok(reads < inputs.length, "Unexpected input request"); return String(inputs[reads++]); },
  }).run();
  assert.equal(reads, inputs.length);
  if (native) for (const extension of ["jimsabz", "jbc"]) {
    const destination = path.join(temporary, "main." + extension);
    fs.writeFileSync(destination, extension === "jbc" ? encodeBytecode(result.program) : code);
    assert.equal(execFileSync(native, ["run", destination], { input: inputs.join("\n") + (inputs.length ? "\n" : ""), encoding: "utf8", timeout: 15000 }), output, extension + " differs from browser execution");
  }
  return { output, result };
}
try {
  for (const example of examples) await check(example.title + " matches the published sample", async () => {
    const checked = await checkExample(example);
    assert.equal(checked.ok, true, JSON.stringify(checked));
    assert.equal((await run(example.code, example.inputs)).output, example.expected);
  });
  const marks = examples.find(example => example.id === "07_marksheet");
  await check("the combined program contains every requested language construct", async () => {
    const { result } = await run(marks.code, marks.inputs), kinds = new Set();
    const visit = node => { kinds.add(node.kind); node.children.forEach(visit); }; visit(result.ast);
    for (const kind of ["var", "if", "for", "foreach", "while", "function", "array", "class", "new", "member", "call"])
      assert.ok(kinds.has(kind), kind + " is missing");
  });
  for (const n of [1, 7, 1000]) await check("combined marksheet accepts " + n + " runtime subjects", async () => {
    const { output } = await run(marks.code, ["Farhan", n, ...Array(n).fill(80)]);
    assert.ok(output.endsWith(`Naalo: Farhan\nMazmoon: ${n}\nKul: ${n * 80}\nFeesad: 80%\nAusat: 80\nDarjo: B\n`));
  });
  const conditions = examples.find(example => example.id === "02_conditions");
  for (const [value, grade] of [[50, "F"], [50.5, "C"], [70, "C"], [70.5, "B"], [90, "B"], [90.5, "A"]])
    await check("strict grading boundary " + value + " gives " + grade, async () => {
      assert.equal((await run(conditions.code, [value])).output, "Feesad: " + grade + "\n");
      assert.ok((await run(marks.code, ["Farhan", 1, value])).output.endsWith("Darjo: " + grade + "\n"));
    });
  await check("mark inputs recover from text, zero counts and out-of-range values", async () => {
    const { output } = await run(marks.code, ["Farhan", "bad", 0, 2, -1, 40, 101, "bad", 60]);
    assert.match(output, /Sahi adad likho/); assert.match(output, /Sahi ang likho/);
    assert.ok(output.endsWith("Naalo: Farhan\nMazmoon: 2\nKul: 100\nFeesad: 50%\nAusat: 50\nDarjo: F\n"));
  });
  await check("changing a constructor field supports a different marks maximum", async () => {
    const code = marks.code.replace("naon Marksheet(naalo)", "naon Marksheet(naalo, 50.0)");
    const { output } = await run(code, ["Farhan", 2, 40, 45]);
    assert.ok(output.endsWith("Naalo: Farhan\nMazmoon: 2\nKul: 85\nFeesad: 85%\nAusat: 42.5\nDarjo: B\n"));
  });
  await check("the check reports a wrong expected output instead of a green result", async () => {
    const result = await checkExample({ ...examples[0], expected: "not the actual result" });
    assert.equal(result.ok, false); assert.equal(result.output, examples[0].expected);
  });
  await check("semantic failures retain the actual compiler phase", async () => {
    const result = await checkExample({ ...examples[0], code: 'adad nishan = "text"' });
    assert.equal(result.ok, false); assert.equal(result.phase, 3); assert.match(result.message, /adad|lafz/);
    if (native) {
      const file = path.join(temporary, "semantic.jimsabz"); fs.writeFileSync(file, 'adad nishan = "text"');
      const result = spawnSync(native, ["check", file], { encoding: "utf8" }); assert.notEqual(result.status, 0); assert.match(result.stderr, /SEM-/);
    }
  });
  await check("unexpected input requests are reported rather than left waiting", async () => {
    const result = await checkExample({ ...conditions, inputs: [] }); assert.equal(result.ok, false); assert.match(result.message, /more input/);
  });
  await check("runtime faults fail the actual example check", async () => {
    const result = await checkExample({ ...examples[0], code: "budhai 1 / 0" }); assert.equal(result.ok, false); assert.equal(result.phase, 6);
  });
  await check("every demo has a portable source file name and independent sample data", () => {
    assert.equal(new Set(examples.map(example => example.id)).size, examples.length);
    for (const example of examples) { const file = exampleFile(example); assert.match(file.path, /^\d{2}_[a-z]+\.jimsabz$/); assert.equal(file.text, example.code); assert.ok(example.expected); }
  });
  await check("the downloadable source and Windows check fixtures match the shown examples", () => {
    for (const example of examples) {
      const base = new URL("../examples/presentation/" + example.id, import.meta.url);
      assert.equal(fs.readFileSync(new URL(base.href + ".jimsabz"), "utf8"), example.code);
      assert.equal(fs.readFileSync(new URL(base.href + ".input.txt"), "utf8"), example.inputs.join("\n") + (example.inputs.length ? "\n" : ""));
      assert.equal(fs.readFileSync(new URL(base.href + ".expected.txt"), "utf8"), example.expected);
    }
  });
  if (process.env.JIMSABZ_PRESENTATION_REPORT) fs.writeFileSync(process.env.JIMSABZ_PRESENTATION_REPORT, JSON.stringify({ passed, total: results.length, native: !!native, results }, null, 2) + "\n");
  console.log(`${passed}/${passed} presentation checks passed${native ? " in the browser, native source and browser bytecode/native VM" : " (browser VM only)"}.`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
