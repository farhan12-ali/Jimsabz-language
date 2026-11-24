import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = fs.existsSync(path.join(root, "dist/core/compiler.mjs"))
  ? "dist"
  : "studio";
const { compile } = await import(
  pathToFileURL(path.join(root, ui, "core/compiler.mjs"))
);
const { tasks } = await import(
  pathToFileURL(path.join(root, ui, "agent/builders.mjs"))
);
const file = process.argv[2] || path.join(root, "training/curriculum.jsonl");
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
if (!lines.length) throw new Error("The training dataset is empty.");
const requests = new Map();
for (const [index, line] of lines.entries()) {
  const sample = JSON.parse(line);
  const where = `Training row ${index + 1}`;
  if (
    !Object.hasOwn(tasks, sample.intent) ||
    !["train", "test"].includes(sample.split)
  )
    throw new Error(`${where}: use a supported intent and a train/test split.`);
  if (
    typeof sample.prompt !== "string" ||
    !sample.prompt.trim() ||
    typeof sample.code !== "string" ||
    !sample.code.trim()
  )
    throw new Error(`${where}: a request and Jimsabz code are required.`);
  const key = sample.prompt.trim().toLowerCase();
  if (requests.has(key) && requests.get(key) !== sample.split)
    throw new Error(
      `${where}: the same request cannot appear in training and evaluation.`,
    );
  requests.set(key, sample.split);
  const result = await compile(
    [{ path: "training.jimsabz", text: sample.code }],
    "training.jimsabz",
  );
  if (!result.ok)
    throw new Error(
      `${where}: code must pass the Jimsabz compiler. ${result.diagnostics[0].message}`,
    );
}
console.log(
  `Validated ${lines.length} Jimsabz training targets; no request crosses the train/test split.`,
);
