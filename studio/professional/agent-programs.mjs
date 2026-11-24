import { generate } from '../agent/agent.mjs';
import { requestedCount } from '../agent/program-spec.mjs';
import { extendRequest, isGenerationRequest } from '../agent/request.mjs';

const quote = value => JSON.stringify(String(value));
const num = n => Number.isInteger(n) ? n + '.0' : String(n);
// An explicit compositional plan, rather than choosing a single canned example.
// Unsupported tasks continue through the existing local assistant.
export function numericPlan(prompt) {
  if (!isGenerationRequest(prompt) && !/^change|^update|^add|^now|^make it/i.test(prompt)) return null;
  if (/marks?|subjects?|percentage|login|game|player|scene|password|grade/i.test(prompt)) return null;
  if (!/\b(numbers?|values?|array|dataset|list of decimals?)\b/i.test(prompt)) return null;
  const operations = [
    ['total', /\b(sum|total|add them)\b/i], ['average', /\b(average|mean)\b/i],
    ['minimum', /\b(minimum|smallest|lowest|min)\b/i], ['maximum', /\b(maximum|largest|highest|max)\b/i],
    ['sorted', /\b(sort|sorted|ascending|descending)\b/i], ['median', /\bmedian\b/i],
    ['search', /\b(search|look for)\b|\bfind\s+(?:(?:the|a)\s+)?(?:value|number|element|target|index)\b|\bfind\s+-?\d/i],
  ].filter(([, pattern]) => pattern.test(prompt)).map(([name]) => name);
  if (!operations.length || !operations.some(x => !['total', 'average'].includes(x)) && !/separate|modules|multi.file/i.test(prompt)) return null;
  let values = null;
  const literal = prompt.match(/\[[\d\s.,eE+\-]+\]/)?.[0];
  if (literal) {
    try { values = JSON.parse(literal); } catch { throw new Error('Write the numeric list as JSON, for example [4, 2, 8].'); }
    if (!values.length || values.length > 1000 || values.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Provide between 1 and 1,000 finite numbers.');
  }
  let count = values?.length ?? requestedCount(prompt, 'numbers', null);
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > 1000)) throw new Error('Choose between 1 and 1,000 numbers, or ask for the count at runtime.');
  return { version: 1, values, count, operations, descending: /descending|largest first/i.test(prompt),
    search: Number(prompt.match(/(?:search(?:\s+for)?|find|look for)\s+(-?\d+(?:\.\d+)?)/i)?.[1] ?? 0),
    searchFromInput: !/(?:search(?:\s+for)?|find|look for)\s+-?\d/i.test(prompt),
    save: prompt.match(/(?:save|write|store)(?:[\s\S]{0,50}?)([\w-]+\.txt)\b/i)?.[1] || '',
    prompt };
}
function numericProject(plan) {
  const op = new Set(plan.operations), funcs = [];
  const sorted = op.has('sorted') || op.has('median');
  if (op.has('total') || op.has('average')) funcs.push(`kam totalValues(qatar dec values) -> dec {
    dec total = 0.0
    gin value andar values { total += value }
    wapas total
}`);
  if (op.has('minimum')) funcs.push(`kam minimumValue(qatar dec values) -> dec {
    dec result = values[0]
    gin value andar values { jey (value < result) { result = value } }
    wapas result
}`);
  if (op.has('maximum')) funcs.push(`kam maximumValue(qatar dec values) -> dec {
    dec result = values[0]
    gin value andar values { jey (value > result) { result = value } }
    wapas result
}`);
  if (sorted) funcs.push(`kam siftValues(qatar dec values, adad size, adad root) -> khali {
    wori (root * 2 + 1 < size) {
        adad child = root * 2 + 1
        jey (child + 1 < size) {
            jey (values[child] ${plan.descending ? '>' : '<'} values[child + 1]) { child += 1 }
        }
        jey (values[root] ${plan.descending ? '>=' : '<='} values[child]) {
            dec saved = values[root]
            values[root] = values[child]
            values[child] = saved
            root = child
        } na_ta { rok }
    }
}
kam sortValues(qatar dec values) -> khali {
    adad start = values.lambai / 2 - 1
    wori (start >= 0) {
        siftValues(values, values.lambai, start)
        start -= 1
    }
    adad end = values.lambai - 1
    wori (end > 0) {
        dec saved = values[0]
        values[0] = values[end]
        values[end] = saved
        siftValues(values, end, 0)
        end -= 1
    }
}`);
  if (op.has('median')) funcs.push(`kam medianValue(qatar dec values) -> dec {
    adad middle = values.lambai / 2
    jey (values.lambai % 2 == 0) { wapas (values[middle - 1] + values[middle]) / 2.0 }
    wapas values[middle]
}`);
  if (op.has('search')) funcs.push(`kam searchValue(qatar dec values, dec target) -> adad {
    gin (adad i = 0; i < values.lambai; i++) { jey (values[i] == target) { wapas i } }
    wapas -1
}`);
  const lines = ['// Planned locally from the requested inputs and operations.', 'kharna "modules/numeric.jimsabz"'];
  if (plan.save) lines.push('kharna FileSystem');
  if (plan.values) lines.push('qatar dec values = [' + plan.values.map(num).join(', ') + ']');
  else {
    lines.push(plan.count === null ? 'adad count = budh("How many numbers (1-1000)? ")' : `adad count = ${plan.count}`);
    lines.push('qatar dec values = []', 'jey (count >= 1 && count <= 1000) {', '    gin (adad i = 0; i < count; i++) {', '        dec value = budh("Number: ")', '        values.joryo(value)', '    }', '}');
  }
  lines.push('jey (values.lambai > 0) {', '    lafz report = ""');
  const report = (label, expr) => lines.push(`    report += ${quote(label + ': ')} + ${expr} + "\\n"`);
  if (op.has('total')) report('Total', 'totalValues(values)');
  if (op.has('average')) report('Average', 'totalValues(values) / values.lambai');
  if (op.has('minimum')) report('Minimum', 'minimumValue(values)');
  if (op.has('maximum')) report('Maximum', 'maximumValue(values)');
  if (sorted) lines.push('    sortValues(values)');
  if (op.has('median')) report('Median', 'medianValue(values)');
  if (op.has('search')) {
    lines.push(plan.searchFromInput ? '    dec target = budh("Search value: ")' : '    dec target = ' + num(plan.search));
    report('Search index', 'searchValue(values, target)');
  }
  if (op.has('sorted')) lines.push('    gin value andar values { report += "Value: " + value + "\\n" }');
  lines.push('    budhai report');
  if (plan.save) lines.push('    FileSystem.writeText(' + quote(plan.save) + ', report)');
  lines.push('} na_ta {', '    budhai "Choose between 1 and 1000 numbers."', '}', '');
  const sample = plan.values || Array.from({ length: plan.count ?? 4 }, (_, i) => (i * 13) % 31 - 15);
  const sampleInputs = plan.values ? [] : [...(plan.count === null ? [String(sample.length)] : []), ...sample.map(String)];
  const target = plan.searchFromInput ? sample[0] : plan.search;
  if (op.has('search') && plan.searchFromInput) sampleInputs.push(String(target));
  const expected = [], decimalText = value => Number(value.toPrecision(12)).toString();
  const total = sample.reduce((a, b) => a + b, 0);
  if (op.has('total')) expected.push('Total: ' + decimalText(total));
  if (op.has('average')) expected.push('Average: ' + decimalText(total / sample.length));
  if (op.has('minimum')) expected.push('Minimum: ' + decimalText(Math.min(...sample)));
  if (op.has('maximum')) expected.push('Maximum: ' + decimalText(Math.max(...sample)));
  const ordered = sorted ? [...sample].sort((a, b) => plan.descending ? b - a : a - b) : sample;
  if (op.has('median')) { const middle = Math.floor(ordered.length / 2); expected.push('Median: ' + decimalText(ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2)); }
  if (op.has('search')) expected.push('Search index: ' + ordered.indexOf(target));
  if (op.has('sorted')) ordered.forEach(value => expected.push('Value: ' + decimalText(value)));
  const prompts = (plan.values ? '' : (plan.count === null ? 'How many numbers (1-1000)? ' : '') + 'Number: '.repeat(sample.length)) + (op.has('search') && plan.searchFromInput ? 'Search value: ' : '');
  const fixtures = [{ name: 'Requested operations with sample data', inputs: sampleInputs, expectedOutput: prompts + expected.join('\n') + '\n\n' }];
  return { code: lines.join('\n'), name: 'main.jimsabz', projectName: 'numeric-tools', intent: 'numeric-plan',
    title: 'Numeric tools project', fixtures, request: plan.prompt, topic: 'numeric-plan',
    summary: 'Built these requested operations: ' + plan.operations.join(', ') + '. The calculation functions are in a separate module.',
    assumptions: [plan.count === null ? 'The program asks for the number of values.' : `${plan.count} values are used.`,
      ...(op.has('search') ? ['Search returns a zero-based index, or -1 when the value is absent.'] : [])],
    limitations: 'A deterministic local planner generated this program. Sorting uses heapsort for up to 1,000 values.',
    files: [{ path: 'main.jimsabz', text: lines.join('\n'), kind: 'source' }, { path: 'modules/numeric.jimsabz', text: funcs.join('\n\n') + '\n', kind: 'source' },
      { path: 'README.md', text: '# Numeric tools\n\nRun main.jimsabz in Studio.\n\nOperations: ' + plan.operations.join(', ') + '.\n\nEdit modules/numeric.jimsabz to change the algorithms.\n', kind: 'file' }],
    followUps: ['Add median and sort descending', 'Change to 12 numbers with minimum and maximum'] };
}
function calculatorProject(prompt) {
  const code = `// A console calculator with division-by-zero handling.
dec first = budh("First number: ")
lafz operation = budh("Operation (+, -, *, /): ")
dec second = budh("Second number: ")
jey (operation == "+") { budhai first + second }
na_ta jey (operation == "-") { budhai first - second }
na_ta jey (operation == "*") { budhai first * second }
na_ta jey (operation == "/") {
    jey (second == 0.0) { budhai "Cannot divide by zero." }
    na_ta { budhai first / second }
} na_ta { budhai "Unknown operation." }
`;
  return { name: 'calculator.jimsabz', code, title: 'Interactive calculator', intent: 'calculator', request: prompt,
    fixtures: [ { name: 'Addition', inputs: ['8', '+', '2'], expectedOutput: 'First number: Operation (+, -, *, /): Second number: 10\n' },
      { name: 'Division by zero', inputs: ['8', '/', '0'], expectedOutput: 'First number: Operation (+, -, *, /): Second number: Cannot divide by zero.\n' } ] };
}
export async function professionalGenerate(prompt, context = {}) {
  const extended = extendRequest(prompt, context.lastRequest);
  const plan = !context.attachments?.length ? numericPlan(extended) : null;
  if (plan) {
    const generated = numericProject(plan);
    if (context.topic === 'numeric-plan' && context.lastRequest && /^(?:change|update|add|now|make it|instead|with)\b/i.test(prompt.trim())) {
      const previous = numericPlan(context.lastRequest);
      if (previous) generated.previousFiles = numericProject(previous).files;
    }
    return generated;
  }
  if (!context.attachments?.length && isGenerationRequest(extended) && /\bcalculator\b/i.test(extended) && !/marks?|percent|game|mortgage|loan|tax/i.test(extended)) return calculatorProject(extended);
  return generate(prompt, context);
}
