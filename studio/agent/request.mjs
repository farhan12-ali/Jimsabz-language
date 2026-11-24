import { normalizeDigits } from './program-spec.mjs';

const corrections = {
  precentage:'percentage', precenatge:'percentage', prcenatge:'percentage', precnatge:'percentage',
  percentge:'percentage', persentage:'percentage', persent:'percent', precent:'percent',
  makrs:'marks', marls:'marks', markes:'marks', sbects:'subjects', subects:'subjects',
  subjets:'subjects', inupt:'input', inpits:'inputs', inpts:'inputs', funtion:'function', funtions:'functions',
  arry:'array', arrys:'arrays', ligin:'login', loggin:'login', singin:'signin',
  systm:'system', sytem:'system', programe:'program', progarm:'program',
};
// Preserve quoted literals and code verbatim; spelling repairs apply to request prose only.
export function normalizeRequest(value) {
  return String(value).split(/(```[\s\S]*?```|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)
    .map((part, i) => i % 2 ? part : normalizeDigits(part).replace(/\b[\p{L}]+\b/gu, word => corrections[word.toLowerCase()] || word))
    .join('').replace(/^[\s]*(?:please\s+|kindly\s+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|(?:i\s+(?:want|need)(?:\s+you)?\s+to\s+))/i, '')
    .replace(/^(?:please\s+|kindly\s+)+/i, '').trim();
}
export function isGenerationRequest(value) {
  const text = normalizeRequest(value);
  return /^(?:write|create|build|make|generate|implement|develop|start|code|provide|give\s+me)\b/i.test(text)
    || /\b(?:i\s+(?:want|need)|need)\s+(?:(?:a|an|the|some)\s+)?(?:program|code|app|system|calculator|login)\b/i.test(text)
    || /(?:code|program)\s+(?:likho|banao)|(?:likh|bana)\s*(?:do|dein)|کوڈ.*(?:لکھ|بنا)|ڪوڊ.*لک/iu.test(text);
}
export function extendRequest(prompt, lastRequest = '') {
  const normalized = normalizeRequest(prompt);
  return lastRequest && /^(?:change|update|make it|now use|instead|add|with|use\s+obtained)\b/i.test(normalized)
    ? lastRequest + '\nUpdate: ' + normalized : normalized;
}
export function interpretRequest(value) {
  const text = normalizeRequest(value), lower = text.toLowerCase();
  const login = /\b(?:log\s*in|login|sign[ -]?in|sign[ -]?up|register|registration|authentication|credentials?)\b/i.test(text) || /\b(?:gaming|game)\b.*\bhub\b.*\barchitecture\b|\barchitecture\b.*\b(?:gaming|game)\b.*\bhub\b/i.test(text);
  const marks = /\b(?:marks?|marksheet|mark sheet|scores?|subjects?|percentage|percent|grades?|feesad|darjo)\b|مارکس|فیصد|فيصد|نشان/i.test(text);
  const hasGrades = /\b(?:grades?|marksheet|mark sheet|report card|result card|darjo)\b|گریڈ|گريڊ|درجو/i.test(text);
  const percentage = /percentage|percent|feesad|فیصد|فيصد/i.test(text);
  const architectureOnly = /\b(?:architecture|design|structure)\b/i.test(text) && !isGenerationRequest(text) && !/\b(?:code|program|implement)\b/i.test(text);
  if (login) return {text, intent:'login', route:'account workflow', architectureOnly,
    gaming:/\b(?:gaming|games?|hub|3d|three dimensional)\b/i.test(text),
    production:/\b(?:production|database|server|secure|real accounts?|deploy|online)\b/i.test(text)};
  if (marks) return {text, intent: percentage && !hasGrades ? 'percentage' : 'marks', route:'marks requirements'};
  if (/\b(?:class|classes|qism|oop|objects?)\b/i.test(text)) return {text,intent:'objects',route:'structured data'};
  if (/\b(?:average|mean|ausat|statistics)\b/i.test(text) || /\b(?:sum|add|total).*(?:\d+|many|any).*(?:numbers?|inputs?|values?)/i.test(text))
    return {text,intent:'statistics',route:'numeric requirements'};
  if (/\b(?:racing|race car|traffic game)\b/i.test(text)) return {text,intent:'racing2d',route:'racing request'};
  if (/\b(?:3d|three dimensional|mujassamo)\b/i.test(text)) return {text,intent:'scene3d',route:'3D request'};
  if (/\b(?:2d|kirdar|controllable (?:player|character)|arrow (?:keys|controls))\b/i.test(text)) return {text,intent:'player2d',route:'2D request'};
  if (/\b(?:loop|loops|repeat|counter|counting|gin)\b/i.test(text) || /\bfrom\s+\d+\s+(?:to|through)/i.test(text)) return {text,intent:'loop',route:'iteration request'};
  if (/\b(?:function|functions|reusable|kam|parameters?)\b/i.test(text)) return {text,intent:'function',route:'function request'};
  if (/\b(?:array|arrays|qatar|list of (?:numbers|values|integers))\b/i.test(text)) return {text,intent:'array',route:'array request'};
  if (/\b(?:sum|addition|add|jama)\b/i.test(text)) return {text,intent:'sum',route:'addition request'};
  if (/\b(?:if.?else|conditional|positive|negative|jey|na_ta)\b/i.test(text)) return {text,intent:'condition',route:'branch request'};
  if (/\b(?:name|naam|lafz|text|string)\b.*\b(?:input|read|ask|enter)\b|\b(?:input|read|ask|enter)\b.*\b(?:name|naam|lafz|text|string)\b/i.test(text)) return {text,intent:'input',route:'text input'};
  if (/\b(?:print|display|output|budhai)\b/i.test(text)) return {text,intent:'output',route:'text output'};
  return {text,intent:null,route:'unresolved',architectureOnly};
}
