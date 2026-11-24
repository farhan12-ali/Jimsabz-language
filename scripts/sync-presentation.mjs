import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = fs.existsSync(path.join(root, "dist/core/examples.mjs")) ? "dist" : "studio";
const { examples } = await import(pathToFileURL(path.join(root, ui, "core/examples.mjs")));
const destination = path.join(root, "examples/presentation");
fs.mkdirSync(destination, { recursive: true });
for (const example of examples) {
  const base = path.join(destination, example.id);
  fs.writeFileSync(base + ".jimsabz", example.code);
  fs.writeFileSync(base + ".input.txt", example.inputs.join("\n") + (example.inputs.length ? "\n" : ""));
  fs.writeFileSync(base + ".expected.txt", example.expected);
}
fs.writeFileSync(path.join(destination, "samples.json"), JSON.stringify({ language: "Jimsabz", examples: examples.map(({ id, title, inputs, expected }) => ({ id, title, inputs, expected })) }, null, 2) + "\n");
console.log(`${examples.length} presentation programs and their input/output fixtures generated.`);
