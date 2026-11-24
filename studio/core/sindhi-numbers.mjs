// ASCII spellings are part of the Jimsabz language, with common spelling aliases.
// Source vocabulary: Sindhi Language Authority, A Grammar of the Sindhi Language.
import data from "./sindhi-numbers-data.mjs";
export function sindhiWord(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error("Sindhi word conversion supports 0 through 1000; decimal numbers support the full adad range.");
  if (n === 1000) return "hazar";
  if (n < 100) return data.canonical_0_99[n];
  return data.canonical_0_99[Math.floor(n / 100)] + " sau" + (n % 100 ? " " + data.canonical_0_99[n % 100] : "");
}
export const normalizeSindhi = text => String(text).toLowerCase().replace(/[_-]+/g, " ").trim().replace(/\s+/g, " ");
const words = new Map(Array.from({ length: 1001 }, (_, n) => [sindhiWord(n), n]));
for (const [word, n] of Object.entries(data.aliases)) words.set(word, n);
export function sindhiNumber(text) { return words.get(normalizeSindhi(text)) ?? null; }
export function sindhiLiteral(number) { return "adad_" + sindhiWord(number).replaceAll(" ", "_"); }
export function sindhiIdentifier(number) {
  return ["", "pheru", "biyo", "teyo"][number] || "ang_" + sindhiWord(number).replaceAll(" ", "_");
}
