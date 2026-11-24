import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { compile } from "../studio/core/compiler.mjs";
import { VM, field, number } from "../studio/core/vm.mjs";
import { tick } from "../studio/core/engine.mjs";
import {
  encodeBytecode,
  bundleExecutable,
  zipFiles,
} from "../studio/core/binary.mjs";
import { build, blank2d, blank3d, tasks } from "../studio/agent/builders.mjs";
import { classify, generate } from "../studio/agent/agent.mjs";
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
const entry = "test.jimsabz",
  files = (code) => [{ path: entry, text: code }];
for (const c of JSON.parse(
  fs.readFileSync(new URL("./cases.json", import.meta.url)),
)) {
  if (/module import|imported class|circular|EOF/.test(c.name)) continue;
  await check(c.name, async () => {
    let out = "",
      error = "";
    const input = c.stdin.split("\n"),
      r = await compile(files(c.code), entry);
    if (!r.ok)
      error = r.diagnostics.map((e) => e.code + ":" + e.message).join("\n");
    else
      try {
        await new VM(r.program, {
          print: (s) => (out += s),
          read: async () => input.shift(),
        }).run();
      } catch (e) {
        error = e.code + ":" + e.message;
      }
    if (c.error) assert.ok(error.includes(c.error), error);
    else {
      assert.equal(error, "");
      assert.equal(out, c.expected);
    }
  });
}
await check("beginner output shorthand", async () => {
  let out = "";
  const r = await compile(files('budhai = "Farhan"'), entry);
  assert.ok(r.ok);
  await new VM(r.program, { print: (s) => (out += s) }).run();
  assert.equal(out, "Farhan\n");
});
await check("module compilation uses workspace files", async () => {
  let out = "";
  const r = await compile(
    [
      ...files('kharna "math.jimsabz"\nbudhai square(9)'),
      {
        path: "math.jimsabz",
        text: "kam square(adad n) -> adad {\nwapas n*n\n}",
      },
    ],
    entry,
  );
  assert.ok(r.ok);
  await new VM(r.program, { print: (s) => (out += s) }).run();
  assert.equal(out, "81\n");
});
await check("circular import failure is semantic", async () => {
  const r = await compile(
    [
      ...files('kharna "math.jimsabz"'),
      { path: "math.jimsabz", text: 'kharna "test.jimsabz"' },
    ],
    entry,
  );
  assert.equal(r.diagnostics[0].stage, 3);
});
for (const [dim, boiler] of [
  [2, blank2d],
  [3, blank3d],
])
  await check("blank " + dim + "D has no actors or handlers", async () => {
    const r = await compile(files(boiler("Blank")), entry),
      vm = new VM(r.program);
    assert.ok(r.ok);
    await vm.run();
    assert.equal(vm.world.dimension, dim);
    assert.equal(vm.world.actors.length, 0);
    assert.equal(vm.world.handlers.length, 0);
  });
for (const intent of Object.keys(tasks))
  await check("agent builder " + intent, async () => {
    const r = await compile(files(build(intent, "violet speed 7")), entry);
    assert.ok(r.ok, JSON.stringify(r.diagnostics));
  });
await check("held input moves an actor", async () => {
  const r = await compile(files(build("player2d")), entry),
    vm = new VM(r.program);
  await vm.run();
  const before = number(field(field(vm.world.actors[0].data, "jagah"), "x"));
  await tick(vm, 1 / 60, { keys: ["RIGHT"], mouse: [0, 0] });
  assert.ok(
    number(field(field(vm.world.actors[0].data, "jagah"), "x")) > before,
  );
});
await check("timer executes authored game code", async () => {
  const r = await compile(
      files(
        'kharna gui\nkhed "Test" {\nadad score = 0\nhar 0.1 second {\nscore += 1\n}\n}',
      ),
      entry,
    ),
    vm = new VM(r.program);
  await vm.run();
  for (let i = 0; i < 12; i++) await tick(vm, 1 / 60);
  assert.ok(number(vm.globals.find("score").value) >= 1);
});
await check("collision updates authored state", async () => {
  const r = await compile(
      files(
        'kharna gui\nkhed "Test" {\nadad score = 0\nkirdar A {\njagah: (1,1)\n}\nkirdar B {\njagah: (2,2)\n}\ntakkar(A,B) {\nscore += 1\n}\n}',
      ),
      entry,
    ),
    vm = new VM(r.program);
  await vm.run();
  await tick(vm, 1 / 60);
  assert.equal(number(vm.globals.find("score").value), 1);
});
await check("instruction budget halts an endless loop", async () => {
  const r = await compile(files("wori (ha) {\n}\n"), entry),
    vm = new VM(r.program);
  vm.limit = 10000;
  await assert.rejects(vm.run(), (e) => e.code === "RUN-LIMIT");
});
const model = JSON.parse(
  fs.readFileSync(new URL("../studio/agent/model.json", import.meta.url)),
);
globalThis.fetch = async () => ({ ok: true, json: async () => model });
await check(
  "Jimsa greeting is conversational and creates no source",
  async () => {
    const result = await generate("salam jimsa");
    assert.ok(result.message.includes("Assalam-o-Alaikum from Jimsa"));
    assert.equal(result.code, undefined);
  },
);
await check("beginner request writes quoted Jimsabz output", async () => {
  const result = await generate(
    'Write a simple program that prints "Salam from Jimsa"',
  );
  assert.equal(result.intent, "output");
  let output = "";
  const compiled = await compile(files(result.code), entry);
  await new VM(compiled.program, { print: (s) => (output += s) }).run();
  assert.equal(output, "Salam from Jimsa\n");
});
await check("Roman Urdu number input request is executable", async () => {
  const result = await generate("do numbers input lekar jama kar do");
  assert.equal(result.intent, "sum");
  let output = "";
  const values = ["12", "8"];
  const compiled = await compile(files(result.code), entry);
  await new VM(compiled.program, {
    print: (s) => (output += s),
    read: async () => values.shift(),
  }).run();
  assert.ok(output.endsWith("20\n"));
});
await check(
  "salutation inside a program request still generates source",
  async () => {
    const result = await generate('print "hello" in a simple program');
    assert.equal(result.intent, "output");
    assert.ok(result.code.includes('"hello"'));
  },
);
await check("requested racing phrasing classified", () =>
  assert.equal(
    classify(model, "make the 2d simple game of the racing").intent,
    "racing2d",
  ),
);
await check("agent refuses other languages", async () =>
  assert.ok(
    (await generate("Write a Python calculator")).message.includes(
      "Jimsabz only",
    ),
  ),
);
await check("unsupported games are not substituted", async () =>
  assert.ok(
    (await generate("make a game of chess")).message.includes("outside"),
  ),
);
await check("agent checks generated code", async () =>
  assert.equal(
    (await generate("Make a simple 2d racing game")).checks.filter(
      (s) => s === "passed",
    ).length,
    6,
  ),
);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jimsabz-check-"));
try {
  await check("ZIP preserves nested files", () => {
    const file = path.join(tmp, "folder.zip");
    fs.writeFileSync(
      file,
      zipFiles("farhan", [
        { path: "farhan.jimsabz", text: 'budhai = "Farhan"\n' },
        { path: "assets/image.bin", bytes: new Uint8Array([0, 1, 255]) },
      ]),
    );
    execFileSync("python3", [
      "-c",
      'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("farhan/assets/image.bin")==bytes([0,1,255])',
      file,
    ]);
  });
  if (process.env.JIMSABZ_NATIVE)
    for (const intent of ["output", "sum", "function", "racing2d", "scene3d"])
      await check("native executes browser bytecode: " + intent, async () => {
        const r = await compile(files(build(intent)), entry),
          file = path.join(tmp, intent + ".jbc");
        fs.writeFileSync(file, encodeBytecode(r.program));
        const args = ["run", file];
        if (/2d|3d/.test(intent)) args.push("--headless", "12");
        const out = execFileSync(process.env.JIMSABZ_NATIVE, args, {
          input: "12\n8\n",
          encoding: "utf8",
        });
        if (intent === "sum") assert.ok(out.endsWith("20\n"));
        if (intent === "output") assert.equal(out, "Farhan\n");
      });
  await check("Windows executable embeds current JBC2", async () => {
    const runtime = fs.readFileSync(
        new URL("../studio/assets/jimsabz-runtime.exe", import.meta.url),
      ),
      r = await compile(files('budhai = "Portable"'), entry),
      bytes = bundleExecutable(runtime, r.program, []),
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 2)), "MZ");
    assert.equal(new TextDecoder().decode(bytes.slice(-16, -8)), "JIMEXE2!");
    const size = Number(view.getBigUint64(bytes.length - 8, true)),
      start = bytes.length - 16 - size,
      length = view.getUint32(start, true);
    assert.deepEqual(
      bytes.slice(start + 4, start + 4 + length),
      encodeBytecode(r.program),
    );
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(
  `${passed}/${passed} browser compiler, VM, agent and export checks passed.`,
);
