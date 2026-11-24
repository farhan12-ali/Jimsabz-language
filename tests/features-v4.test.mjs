import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { encodeBytecode } from "../studio/core/binary.mjs";
import { build, marksSpec } from "../studio/agent/builders.mjs";
import { generateProject } from "../studio/agent/project.mjs";
import { VoiceInput } from "../studio/agent/voice.mjs";
import { readAttachment } from "../studio/agent/attachments.mjs";
import { initTheme } from "../studio/core/theme.mjs";
import { compile } from "../studio/core/compiler.mjs";
import { VM } from "../studio/core/vm.mjs";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function runCode(code, input) {
  const compiled = await compile(
    [{ path: "main.jimsabz", text: code }],
    "main.jimsabz",
  );
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  let output = "";
  const values = input.map(String);
  await new VM(compiled.program, {
    print: (s) => (output += s),
    read: async () => values.shift(),
  }).run();
  return output;
}
for (const [mark, grade] of [
  [0, "F"],
  [50, "F"],
  [51, "C"],
  [70, "C"],
  [71, "B"],
  [90, "B"],
  [91, "A"],
  [100, "A"],
]) {
  await check(`strict grade boundary ${mark} -> ${grade}`, async () => {
    const out = await runCode(build("marks"), [mark, mark, mark]);
    assert.ok(
      out.includes(
        `Kul marks: ${mark * 3}\nFeesad: ${mark}%\nDarjo: ${grade}\n`,
      ),
      out,
    );
  });
}
await check("percentage uses decimal division", async () => {
  const out = await runCode(build("marks"), [70, 70, 71]);
  assert.match(out, /Feesad: 70\.333/);
  assert.match(out, /Darjo: B/);
});
await check("out-of-range marks are requested again", async () => {
  const out = await runCode(build("marks"), [101, 60, 70, 80]);
  assert.ok(out.includes("Marks 0 kha 100 taeen likho."));
  assert.ok(out.includes("Kul marks: 210\nFeesad: 70%\nDarjo: C"));
});
await check("subject count and maximum can be requested", async () => {
  const code = build("marks", "four subjects each out of 50");
  const out = await runCode(code, [45, 45, 45, 46]);
  assert.ok(out.includes("Feesad: 90.5%\nDarjo: A"));
  assert.deepEqual(marksSpec().rules, [
    ["A", 90],
    ["B", 70],
    ["C", 50],
  ]);
  assert.equal(marksSpec("20 subjects").count, 20);
});
await check("ordinary generators use Roman Sindhi numeric names", async () => {
  for (const task of ["sum", "function"]) {
    const code = build(task);
    assert.ok(code.includes("adad pheru"));
    assert.ok(!/\b(first|second|third)\b/.test(code));
  }
});
for (const [n, output] of [
  [-3, "Negative"],
  [0, "Zero"],
  [3, "Positive"],
])
  await check("if / else-if / else chooses one branch: " + n, async () => {
    const result = await runCode(build("condition"), [n]);
    assert.ok(result.endsWith(output + "\n"));
  });
await check("the user's complete marks request is generated", async () => {
  const model = JSON.parse(
    fs.readFileSync(new URL("../studio/agent/model.json", import.meta.url)),
  );
  globalThis.fetch = async () => ({ ok: true, json: async () => model });
  const { generate } = await import("../studio/agent/agent.mjs");
  const result = await generate(
    "write a simple program of the input in which the user give the marks of the three subjects and also it prints the sum of marks and prcenatge and the Grade if precnatge is greater then 50 then C if greater than 70 B if greater than 90 A",
  );
  assert.equal(result.intent, "marks");
  assert.ok(
    (await runCode(result.code, [80, 90, 100])).endsWith(
      "Kul marks: 270\nFeesad: 90%\nDarjo: B\n",
    ),
  );
});
await check(
  "report produces a separate runnable project and plan",
  async () => {
    const result = await generateProject("Build my report", [
      {
        name: "Student-Marks.txt",
        text: "Input marks of three subjects. Print total percentage and grade. Above 90 A, above 70 B, above 50 C, otherwise F.",
      },
    ]);
    assert.equal(result.projectName, "Student-Marks");
    assert.equal(result.files[0].path, "main.jimsabz");
    assert.ok(result.files.some((f) => f.path === "PROJECT-PLAN.md"));
    assert.ok((await runCode(result.code, [95, 96, 97])).includes("Darjo: A"));
  },
);
await check("unsupported report requirements remain explicit", async () => {
  const result = await generateProject("Start", [
    {
      name: "Portal.txt",
      text: "Build a web app with login, database and payment checkout.",
    },
  ]);
  assert.ok(result.summary.includes("further implementation"));
  const plan = result.files.find((f) => f.path === "PROJECT-PLAN.md").text;
  assert.ok(plan.includes("Database integration: implement"));
  assert.ok(plan.includes("Authentication and accounts: implement"));
  assert.ok(!plan.includes("all requirements complete"));
});
await check("multiple supported report examples all compile", async () => {
  const result = await generateProject("Build", [
    {
      name: "Lab.md",
      text: "Use if else conditions, arrays and loops to practice programming.",
    },
  ]);
  assert.ok(result.files.length >= 3);
  for (const f of result.files.filter((f) => f.path.endsWith(".jimsabz")))
    assert.ok((await compile(result.files, f.path)).ok);
});
await check("attachment size and unsupported types fail clearly", async () => {
  await assert.rejects(
    readAttachment({ name: "big.pdf", size: 11 * 1024 * 1024 }),
    /10 MB/,
  );
  await assert.rejects(
    readAttachment({ name: "run.exe", size: 10 }),
    /Attach a PDF/,
  );
  await assert.rejects(
    readAttachment({ name: "blank.txt", size: 1, text: async () => " " }),
    /No readable text/,
  );
});
await check("text reports retain their readable content", async () => {
  const r = await readAttachment({
    name: "marks.txt",
    size: 10,
    text: async () => "Three subjects\r\nMarks and grade",
  });
  assert.equal(r.text, "Three subjects\nMarks and grade");
});
class Recognition {
  constructor() {
    Recognition.last = this;
  }
  start() {}
  stop() {
    this.onend();
  }
  abort() {}
}
await check("voice results, stop and denied microphone recover", () => {
  const text = [],
    states = [],
    errors = [];
  const voice = new VoiceInput({
    Recognition,
    onText: (...args) => text.push(args),
    onState: (s) => states.push(s),
    onError: (e) => errors.push(e),
  });
  voice.start("ur-PK");
  const recognition = Recognition.last;
  assert.equal(recognition.lang, "ur-PK");
  const final = [{ transcript: "three subjects" }];
  final.isFinal = true;
  const interim = [{ transcript: "marks" }];
  interim.isFinal = false;
  recognition.onresult({ results: [final, interim] });
  assert.deepEqual(text[0], ["three subjects", "marks"]);
  voice.stop();
  assert.equal(voice.recognition, null);
  voice.start();
  Recognition.last.onerror({ error: "not-allowed" });
  assert.match(errors[0], /denied/);
  assert.equal(states.at(-1), false);
  voice.start();
  voice.cancel();
  Recognition.last.onresult({ results: [final] });
  assert.equal(text.length, 1);
});
await check("unsupported voice has a useful fallback", () => {
  let message = "";
  new VoiceInput({ onError: (m) => (message = m) }).start();
  assert.ok(message.includes("type your request"));
});
await check("theme persists and follows changes from another window", () => {
  const data = new Map([["jimsabz-theme", "light"]]);
  let listener;
  const host = {
    document: { documentElement: { dataset: {} } },
    localStorage: {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    },
    addEventListener: (type, fn) => (listener = fn),
  };
  const set = initTheme(host);
  assert.equal(host.document.documentElement.dataset.theme, "light");
  set("dark");
  assert.equal(data.get("jimsabz-theme"), "dark");
  listener({ key: "jimsabz-theme", newValue: "light" });
  assert.equal(host.document.documentElement.dataset.theme, "light");
});
if (process.env.JIMSABZ_NATIVE)
  await check(
    "native compiler and browser bytecode agree on marks",
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jimsabz-marks-"));
      try {
        const code = build("marks"),
          files = [{ path: "main.jimsabz", text: code }];
        const compiled = await compile(files, "main.jimsabz");
        fs.writeFileSync(path.join(dir, "marks.jimsabz"), code);
        fs.writeFileSync(
          path.join(dir, "marks.jbc"),
          encodeBytecode(compiled.program),
        );
        for (const file of ["marks.jimsabz", "marks.jbc"]) {
          const output = execFileSync(
            process.env.JIMSABZ_NATIVE,
            ["run", path.join(dir, file)],
            { input: "80\n90\n100\n", encoding: "utf8" },
          );
          assert.ok(output.includes("Kul marks: 270\nFeesad: 90%\nDarjo: B\n"));
        }
      } finally {
        fs.rmSync(dir, { recursive: true });
      }
    },
  );
console.log(
  `${passed}/${passed} marks, report, voice and theme checks passed.`,
);
