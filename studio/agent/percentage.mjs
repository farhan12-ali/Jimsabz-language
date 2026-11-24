import { normalizeRequest } from './request.mjs';
import { requestedCount } from './program-spec.mjs';

export function percentageSpec(prompt = '') {
  const text = normalizeRequest(prompt);
  const totalMode = /\b(?:obtained|earned|scored|achieved)\b/i.test(text) && /\b(?:total|possible|maximum|maximum marks)\b/i.test(text)
    || /\b(?:total marks|maximum marks)\s+(?:as|and|from)\s+(?:the\s+)?(?:second|input)/i.test(text);
  const dynamic = /\b(?:runtime|dynamic|any|many|variable)\b|ask\s+(?:the user\s+)?how many|all\s+(?:the\s+)?subjects|number of subjects|however many|user chooses/i.test(text);
  const useCollections = /\b(?:arrays?|qatar|functions?|kam|reusable)\b/i.test(text);
  const count = dynamic ? null : requestedCount(text, 'subjects', null) ?? requestedCount(text, 'mark-inputs', null);
  const maximum = Number(text.match(/(?:out\s+of|per\s+subject\s*[:=]?|maximum(?:\s+marks)?\s*[:=]?)\s*(\d+(?:\.\d+)?)/i)?.[1] || 100);
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error('Give a positive maximum mark per subject, for example each out of 50.');
  if (count !== null && count > 10000) throw new Error('Use a runtime subject count for more than 10,000 inputs.');
  return {mode: totalMode || (!dynamic && count === null && !useCollections && !/\b(?:subjects?|scores?)\b/i.test(text)) ? 'obtained-total' : 'subjects', count, maximum,
    average:/\b(?:average|mean|ausat)\b/i.test(text), arrays:/\b(?:arrays?|qatar)\b/i.test(text), functions:/\b(?:functions?|kam|reusable)\b/i.test(text)};
}
export function percentageProgram(prompt = '') {
  const spec = percentageSpec(prompt), max = String(spec.maximum) + (Number.isInteger(spec.maximum) ? '.0' : '');
  if (spec.mode === 'obtained-total') {
    const fn = spec.functions ? 'kam feesad_kadh(dec hasil, dec had) -> dec {\n    wapas hasil * 100.0 / had\n}\n' : '';
    const values = spec.arrays ? '        qatar dec nishan = [hasil, had]\n' : '';
    const left = spec.arrays ? 'nishan[0]' : 'hasil', right = spec.arrays ? 'nishan[1]' : 'had';
    const calculation = spec.functions ? `feesad_kadh(${left}, ${right})` : `${left} * 100.0 / ${right}`;
    return `// Two inputs: obtained marks and total possible marks.\n${fn}azmai {\n    dec hasil = budh("Obtained marks: ")\n    dec had = budh("Total marks: ")\n    jey (had > 0 && hasil >= 0 && hasil <= had) {\n${values}        dec feesad = ${calculation}\n        budhai "Percentage: " + feesad + "%"\n    } na_ta {\n        budhai "Total must be positive; obtained marks must be between 0 and total."\n    }\n} pakar (maslo) {\n    budhai "Enter numeric marks. " + maslo\n}\n`;
  }
  if (spec.count !== null && spec.count <= 5 && !spec.arrays && !spec.functions) {
    const names = Array.from({length:spec.count}, (_,i)=>`nishan_${i+1}`);
    return `// ${spec.count} subject inputs; each is out of ${spec.maximum}.\nazmai {\n`+
      names.map((name,i)=>`    dec ${name} = budh("Subject ${i+1} marks (0-${spec.maximum}): ")\n`).join('')+
      `    jey (${names.map(name=>`${name} >= 0 && ${name} <= ${max}`).join(' && ')}) {\n        dec kul = ${names.join(' + ')}\n        dec feesad = kul * 100.0 / ${String(spec.count*spec.maximum)}\n        budhai "Total marks: " + kul\n        budhai "Percentage: " + feesad + "%"\n${spec.average?`        budhai "Average: " + (kul / ${spec.count})\n`:''}    } na_ta {\n        budhai "Each mark must be between 0 and ${spec.maximum}."\n    }\n} pakar (maslo) {\n    budhai "Enter numeric marks. " + maslo\n}\n`;
  }
  return `// A reusable function accepts the requested number of subject marks.\nkam feesad_kadh(qatar dec nishan, dec had) -> dec {\n    dec kul = 0.0\n    gin ang andar nishan { kul += ang }\n    wapas kul * 100.0 / (nishan.lambai * had)\n}\nazmai {\n    ${spec.count === null ? 'adad tadaad = budh("How many subjects? ")' : `adad tadaad = ${spec.count}`}\n    jey (tadaad > 0 && tadaad <= 10000) {\n        qatar dec nishan = []\n        dec kul = 0.0\n        gin (adad soochi = 0; soochi < tadaad; soochi += 1) {\n            dec ang = budh("Subject " + (soochi + 1) + " marks (0-${spec.maximum}): ")\n            wori (ang < 0 || ang > ${max}) {\n                ang = budh("Enter marks from 0 to ${spec.maximum}: ")\n            }\n            nishan.joryo(ang)\n            kul += ang\n        }\n        budhai "Total marks: " + kul\n        budhai "Percentage: " + feesad_kadh(nishan, ${max}) + "%"\n${spec.average?'        budhai "Average: " + (kul / tadaad)\n':''}    } na_ta {\n        budhai "Subject count must be from 1 to 10000."\n    }\n} pakar (maslo) {\n    budhai "Enter numeric marks. " + maslo\n}\n`;
}
export function percentageAnswer(prompt) {
  const spec = percentageSpec(prompt), code = percentageProgram(prompt);
  const summary = spec.mode === 'obtained-total' ? 'Reads obtained marks and total possible marks, then calculates percentage = obtained / total × 100.'
    : `Reads ${spec.count ?? 'a runtime-selected number of'} subject marks and calculates the combined percentage.${spec.average?' It also prints the average.':''}`;
  const assumptions = spec.mode === 'subjects' ? [`Each subject is out of ${spec.maximum}. ${spec.count===null?'The program asks for the subject count because no fixed count was supplied.':'No name, grade or extra count input is added.'}`]
    : ['The two values are obtained marks and total possible marks.'];
  const fixtures = spec.mode === 'obtained-total' ? [{name:'80 out of 100',inputs:['80','100'],expectedOutput:'Obtained marks: Total marks: Percentage: 80%\n'}] : [];
  if (spec.mode === 'subjects' && (spec.count === null || spec.count <= 100)) {
    const count = spec.count ?? 2;
    const mark = Number.isInteger(spec.maximum * 2) ? spec.maximum / 2 : 0;
    fixtures.push({name:mark ? 'Half marks gives 50 percent' : 'Zero marks gives zero percent',inputs:[...(spec.count===null?[String(count)]:[]),...Array(count).fill(String(mark))],expectedOutput:(spec.count===null?'How many subjects? ':'')+Array.from({length:count},(_,i)=>`Subject ${i+1} marks (0-${spec.maximum}): `).join('')+`Total marks: ${mark*count}\nPercentage: ${mark ? 50 : 0}%\n${spec.average?`Average: ${mark}\n`:''}`});
  }
  return {code,name:'percentage.jimsabz',title:'Marks and percentage',intent:'percentage',topic:'percentage',request:prompt,summary,assumptions,fixtures,
    followUps:spec.mode==='subjects'?['Use obtained marks and total marks instead','Add an average using an array and a function']:['Use two subjects each out of 100 instead','Add validation and a reusable function']};
}
