import { requestedCount, codeNumber, normalizeDigits } from "./program-spec.mjs";
export function statsProgram(prompt="") {
  const dynamic=/\b(any|many|runtime|dynamic)\b|ask\s+how many/i.test(prompt);
  const count=dynamic?null:requestedCount(prompt,"numbers",prompt?null:2);
  const average=/average|mean|ausat|اوسط/i.test(prompt);
  const setup=count===null?'adad tadaad = budh("Ketira ang? ")\nwori (tadaad <= 0) { tadaad = budh("Hik ya vadheek ang likho: ") }':`adad tadaad = ${codeNumber(count)}`;
  return `// One function processes a qatar of any requested length.\nkam kul_kadh(qatar dec ang) -> dec {\n    dec kul = 0.0\n    gin hik andar ang { kul += hik }\n    wapas kul\n}\n${setup}\nqatar dec ang = []\ngin (adad soochi = 0; soochi < tadaad; soochi += 1) {\n    dec pheru = budh("Ang " + (soochi + 1) + ": ")\n    ang.joryo(pheru)\n}\ndec kul = kul_kadh(ang)\nbudhai "Kul: " + kul\n${average?'budhai "Ausat: " + (kul / tadaad)\n':""}`;
}
export function loopProgram(prompt="") {
  const range=normalizeDigits(prompt).match(/(?:from|between)\s*(\d+)\s*(?:to|and|through|[-–])\s*(\d+)/i);
  const count=Number(normalizeDigits(prompt).match(/(\d+)\s*(?:times|iterations|numbers)/i)?.[1]||5);
  const start=range?Number(range[1]):1, end=range?Number(range[2]):count;
  if(!Number.isSafeInteger(end)||end<start)throw new Error("Use an increasing whole-number range.");
  const output=/sindhi|word|roman/i.test(prompt)?'jey (soochi <= 1000) { budhai sindhi_lafz(soochi) } na_ta { budhai soochi }':'budhai soochi';
  return `gin (adad soochi = ${codeNumber(start)}; soochi <= ${codeNumber(end)}; soochi += 1) {\n    ${output}\n}\n`;
}
