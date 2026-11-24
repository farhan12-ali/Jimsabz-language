import { sindhiNumber, sindhiLiteral } from "../core/sindhi-numbers.mjs";

export const normalizeDigits = text => String(text).replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)));
const english = { zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90 };
export function readCount(text) {
  const clean = normalizeDigits(text).toLowerCase().trim().replace(/^adad_/, "");
  if (/^\d+$/.test(clean)) return Number(clean);
  const roman = sindhiNumber(clean);
  if (roman !== null) return roman;
  let sum=0,group=0,used=false;
  for (const word of clean.replaceAll("-"," ").split(/\s+/)) {
    if (word === "and") continue;
    if (word in english) { group += english[word]; used=true; }
    else if (word === "hundred") { group = (group || 1)*100; used=true; }
    else if (word === "thousand") { sum += (group || 1)*1000; group=0; used=true; }
    else return null;
  }
  return used ? sum+group : null;
}
const subject = "(?:subjects?|sbects?|subects?|subjets?|mazmoon|mazmun|mazameen|مضامین|مضمون|مضمونن)";
export function requestedCount(prompt, kind="subjects", fallback=null) {
  const text=normalizeDigits(prompt).toLowerCase();
  const noun=kind === "subjects" ? subject : kind === "mark-inputs" ? "(?:inputs?|scores?|mark\\s+values?)" : "(?:numbers?|inputs?|values?|adad|marks)";
  const candidates=[];
  for(const m of text.matchAll(new RegExp("(\\d+)\\s*"+noun+"\\b","g"))) candidates.push({at:m.index,value:Number(m[1])});
  for(const m of text.matchAll(new RegExp(noun+"\\s*[:=]\\s*(\\d+)","g"))) candidates.push({at:m.index,value:Number(m[1])});
  for(const position of text.matchAll(new RegExp(noun+"\\b","gu"))) {
    const words=text.slice(Math.max(0,position.index-90),position.index).trim().split(/\s+/);
    for(let size=Math.min(7,words.length);size>=1;size--) {
      const value=readCount(words.slice(-size).join(" "));
      if(value!==null){candidates.push({at:position.index,value});break;}
    }
  }
  const count=candidates.sort((a,b)=>a.at-b.at).at(-1)?.value ?? null;
  if (count === null) return fallback;
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Use a positive whole subject/input count. If it should be chosen when the program runs, say ‘ask how many’. ");
  return count;
}
export const codeNumber = n => Number.isInteger(n) && n>=0 && n<=1000 ? sindhiLiteral(n) : String(n);
const quote = value => JSON.stringify(String(value));
export function gradeRules(prompt="") {
  const text=normalizeDigits(prompt);
  const found=[], explicit=new Set();
  const pattern=/(?:(percentage|percent|feesad|average|ausat|total|kul)\s*(?:is\s*)?)?(>=|<=|==|>|<|greater\s+(?:than|then)|above|over|at\s+least|less\s+than|below|at\s+most)\s*(-?\d+(?:\.\d+)?)\s*%?\s*(?:(?:then|give|grade|is|assign|:|=)\s*)*(?:"([^"\n]{1,48})"|'([^'\n]{1,48})'|([A-Za-z][A-Za-z0-9_+\-]{0,30}))(?=\s|$|[,.;])/gi;
  const operator = word => /^(above|over|greater)/i.test(word) ? ">" : /^(below|less)/i.test(word) ? "<" : /^at\s+least/i.test(word) ? ">=" : /^at\s+most/i.test(word) ? "<=" : word;
  for (const m of text.matchAll(pattern)) {
    const label=m[4]||m[5]||m[6];
    if(/^(and|then|if|else|subjects?|marks?|percent)$/i.test(label))continue;
    const metric=/average|ausat/i.test(m[1]||"")?"ausat":/total|kul/i.test(m[1]||"")?"kul":"feesad";
    found.push({label,threshold:Number(m[3]),op:operator(m[2]),metric}); explicit.add(label);
  }
  for(const m of text.matchAll(/\b([A-Za-z][A-Za-z0-9_+\-]{0,30})\s+(?:if|when|above|over)\s*(?:(percentage|average|total|feesad|ausat|kul)\s*(?:is\s*)?)?(>=|<=|>|<|greater\s+(?:than|then)|above|over)?\s*(\d+(?:\.\d+)?)/gi)) {
    if(explicit.has(m[1])||/^(grade|percentage|average|total|else|then)$/i.test(m[1]))continue;
    found.push({label:m[1],threshold:Number(m[4]),op:operator(m[3]||">"),metric:/average|ausat/i.test(m[2]||"")?"ausat":/total|kul/i.test(m[2]||"")?"kul":"feesad"});
  }
  const fallback=text.match(/(?:otherwise|else|default)\s*(?:give\s*|grade\s*|is\s*|[:=]\s*)?(?:"([^"\n]{1,48})"|'([^'\n]{1,48})'|([A-Z][A-Za-z0-9_+\-]{0,30}))(?=\s|$|[,.;])/) ;
  // Later follow-up rules replace earlier rules with the same grade label.
  const previous=text.includes("\nUpdate:") ? gradeRules(text.split("\nUpdate:").slice(0,-1).join("\nUpdate:")).conditions : [];
  const latest=new Map(previous.map(rule=>[rule.label,rule]));
  for(const rule of found) {latest.delete(rule.label);latest.set(rule.label,rule);}
  if(!found.length && /(?:>=|<=|greater\s+(?:than|then)|at\s+least)\s*\d/i.test(text)) throw new Error("Give a grade label after each threshold, for example >= 90: A, >= 70: B, otherwise F.");
  const rules=latest.size?[...latest.values()]:[{label:"A",threshold:90,op:">",metric:"feesad"},{label:"B",threshold:70,op:">",metric:"feesad"},{label:"C",threshold:50,op:">",metric:"feesad"}];
  if (rules.every(r=>[">",">="].includes(r.op)&&r.metric===rules[0].metric)) rules.sort((a,b)=>b.threshold-a.threshold);
  if(rules.length>1000) throw new Error("Split more than 1,000 grading rules into a report attachment or separate functions.");
  return {conditions:rules,fallback:fallback?.[1]||fallback?.[2]||fallback?.[3]||"F"};
}
export function marksSpec(prompt="") {
  const text=normalizeDigits(prompt);
  const namesText=text.match(/(?:subjects?(?:\s+(?:are|named))?\s*[:=]|subject\s+names?\s*[:=])\s*([^\n.;]+)/i)?.[1];
  const names=namesText && !/^\s*\d+\b/.test(namesText) ? namesText.split(/\s*,\s*|\s+and\s+/i).map(s=>s.trim().replace(/^["']|["']$/g,"")).filter(Boolean):[];
  const dynamic=/\b(any|many|variable|runtime|dynamic)\b|ask\s+(?:the user\s+)?how many|کتنے|ڪيترا/i.test(text);
  let count=dynamic?null:(requestedCount(text,"subjects",null) ?? requestedCount(text,"mark-inputs",prompt?null:3));
  if(names.length) {if(count!==null&&count!==names.length)throw new Error(`You asked for ${count} subjects but listed ${names.length} names. Provide one name for each subject, or omit the names.`);count=names.length;}
  const maximum=Number(text.match(/(?:out\s+of|per\s+subject\s*[:=]?|maximum(?:\s+marks)?\s*[:=]?)\s*(\d+(?:\.\d+)?)/i)?.[1]||100);
  if(!Number.isFinite(maximum)||maximum<=0)throw new Error("Maximum marks per subject must be positive.");
  const {conditions,fallback}=gradeRules(text);
  const customPrompt=text.match(/(?:question|prompt)\s*[:=]\s*"([^"\n]{1,160})"/i)?.[1];
  return { count, maximum, names, conditions, fallback, rules:conditions.map(r=>[r.label,r.threshold]), average:/average|ausat|mean|اوسط/i.test(text), perSubject:/each\s+subject.{0,30}(?:percentage|percent)|per.subject\s+(?:percentage|percent)/i.test(text), customPrompt };
}
export function marksProgram(prompt="") {
  const spec=marksSpec(prompt), {count,maximum,names,conditions,fallback}=spec;
  const grades=conditions.map(r=>quote(r.label)).join(", "), limits=conditions.map(r=>String(r.threshold)).join(", "), ops=conditions.map(r=>quote(r.op)).join(", "), metrics=conditions.map(r=>quote(r.metric)).join(", ");
  const countCode=count===null?'adad mazmoon_ja_ang = budh("Ketira mazmoon? ")\nwori (mazmoon_ja_ang <= 0) {\n    budhai "Hik ya vadheek mazmoon likho."\n    mazmoon_ja_ang = budh("Ketira mazmoon? ")\n}':`adad mazmoon_ja_ang = ${codeNumber(count)}`;
  const question=spec.customPrompt ? quote(spec.customPrompt).replace("{subject}", '" + mazmoon_naam + "') : 'mazmoon_naam + " ja marks (0-'+maximum+'): "';
  return `// Marksheet: subject count follows your request; arrays store all inputs.\nkam marks_watho(lafz sawal, dec had) -> dec {\n    dec ang = budh(sawal)\n    wori (ang < 0 || ang > had) {\n        budhai "Marks 0 kha ${maximum} taeen likho."\n        ang = budh(sawal)\n    }\n    wapas ang\n}\n\nkam darjo_kadh(dec feesad, dec ausat, dec kul) -> lafz {\n    qatar dec hadain = [${limits}]\n    qatar lafz darja = [${grades}]\n    qatar lafz muqabla = [${ops}]\n    qatar lafz paimana = [${metrics}]\n    gin (adad soochi = 0; soochi < hadain.lambai; soochi += 1) {\n        dec ang = feesad\n        jey (paimana[soochi] == "ausat") { ang = ausat }\n        jey (paimana[soochi] == "kul") { ang = kul }\n        lafz op = muqabla[soochi]\n        dec had = hadain[soochi]\n        jey ((op == ">" && ang > had) || (op == ">=" && ang >= had) || (op == "<" && ang < had) || (op == "<=" && ang <= had) || (op == "==" && ang == had)) {\n            wapas darja[soochi]\n        }\n    }\n    wapas ${quote(fallback)}\n}\n\n${countCode}\nqatar dec nishan = []\nqatar lafz naala = [${names.map(quote).join(", ")}]\ndec kul = 0.0\ngin (adad soochi = 0; soochi < mazmoon_ja_ang; soochi += 1) {\n    lafz mazmoon_naam = "Mazmoon " + (soochi + 1)\n    jey (soochi < 1000) { mazmoon_naam = "Mazmoon " + sindhi_lafz(soochi + 1) }\n    jey (soochi < naala.lambai) { mazmoon_naam = naala[soochi] }\n    dec ang = marks_watho(${question}, ${maximum.toFixed(1)})\n    nishan.joryo(ang)\n    kul += ang\n${spec.perSubject?`    budhai mazmoon_naam + " feesad: " + (ang * 100.0 / ${maximum.toFixed(1)}) + "%"\n`:""}}\ndec ausat = kul / mazmoon_ja_ang\ndec feesad = kul * 100.0 / (mazmoon_ja_ang * ${maximum.toFixed(1)})\nlafz darjo = darjo_kadh(feesad, ausat, kul)\n\nbudhai "Kul marks: " + kul\nbudhai "Feesad: " + feesad + "%"\n${spec.average?'budhai "Ausat: " + ausat\n':""}budhai "Darjo: " + darjo\n`;
}
