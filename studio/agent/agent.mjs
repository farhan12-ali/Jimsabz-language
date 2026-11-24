import { normalizeRequest, extendRequest, interpretRequest, isGenerationRequest } from "./request.mjs";
import { percentageAnswer } from "./percentage.mjs";
import { loginProject, loginArchitecture } from "./login-project.mjs";
import { build, tasks } from "./builders.mjs";
import { compile } from "../core/compiler.mjs";
import { generateProject } from "./project.mjs";
import { answerLanguageQuestion } from "./knowledge.mjs";
let modelPromise;
export function loadModel() {
  return (modelPromise ??= fetch(new URL("./model.json", import.meta.url)).then(
    (r) => {
      if (!r.ok) throw new Error("The local agent model could not be loaded.");
      return r.json();
    },
  ));
}
export function features(text) {
  const words = text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [],
    out = [...words];
  for (let i = 0; i < words.length - 1; i++)
    out.push(words[i] + "_" + words[i + 1]);
  return out;
}
export function classify(model, prompt) {
  const terms = features(prompt).filter((t) => model.vocabulary.includes(t));
  if (!terms.length) return { intent: null, confidence: 0 };
  const scores = Object.entries(model.labels)
      .map(([intent, label]) => ({
        intent,
        score:
          label.prior +
          terms.reduce((sum, t) => sum + (label.words[t] ?? label.unknown), 0),
      }))
      .sort((a, b) => b.score - a.score),
    top = scores[0],
    total = scores.reduce((s, x) => s + Math.exp(x.score - top.score), 0);
  return {
    intent: top.intent,
    confidence: 1 / total,
    margin: top.score - scores[1].score,
  };
}
export async function generate(prompt, context = {}) {
  prompt = extendRequest(prompt, context.lastRequest);
  const specification = interpretRequest(prompt);
  if (context.attachments?.length)
    return generateProject(prompt, context.attachments);
  const lower = prompt.toLowerCase();
  if (specification.intent === "login" && specification.architectureOnly) return {topic:"login",message:loginArchitecture(specification.gaming),followUps:["Build a gaming hub with local login"]};
  const help = isGenerationRequest(prompt) ? null : answerLanguageQuestion(prompt, context);
  if (help) return help;
  if (
    /^(?:hi|hello|hey|salam|salaam|assalam[ -]?o[ -]?alaikum|assalamu[ -]?alaikum)(?:\s+(?:jimsa|jimsabz|agent))?[!.?\s]*$/i.test(
      prompt.trim(),
    )
  )
    return {
      message:
        "Assalam-o-Alaikum from Jimsa! I’m your local Jimsabz assistant. Ask about the language, request a program, check your code, or ask for a supported repair. Generated code is checked before you review it.",
    };
  if (/\b(?:in|using)\s+(?:python|javascript|typescript|java|c\+\+|html|css|react)\b|\b(?:python|javascript|typescript|java|html|react)\s+(?:code|script|program|app|calculator)\b/i.test(prompt) && !/\b(?:not|no|without)\s+(?:python|javascript|typescript|java|html|react)\b/i.test(prompt))
    return {message: "I write Jimsabz only. I can build the requested behavior in Jimsabz; ask for it in Jimsabz to continue."};
  if (specification.intent === "login") {
    if (specification.architectureOnly) return {topic:"login",message:loginArchitecture(specification.gaming),followUps:["Build a gaming hub with local login"]};
    return loginProject(prompt);
  }
  if (specification.intent === "percentage") return percentageAnswer(prompt);
  if (
    /\b(chess|football|soccer|snake|shooter|platformer|multiplayer|pubg|shooting|flight)\b/i.test(
      prompt,
    )
  )
    return {
      message:
        "That game type is outside my current code builders. I can start a 2D player, simple 2D racing game, or basic 3D scene. You can build more game rules in Jimsabz from there.",
    };
  if (/\b(fix|repair|correct)\b/.test(lower) && context.diagnostic) {
    const d = context.diagnostic,
      code = context.code || "";
    let fixed = code;
    if (d.code === "SEM-01") {
      const library = d.message.match(
        /kharna (gui3d|gui|hisab|audio|waqt)/,
      )?.[1];
      if (library) fixed = `kharna ${library}\n${code}`;
    }
    if (d.code === "SYN-02" && d.message.includes("}")) fixed = code + "\n}\n";
    if (fixed !== code) {
      const checked = await compile(
        [{ path: "main.jimsabz", text: fixed }],
        "main.jimsabz",
      );
      if (checked.ok)
        return {
          code: fixed,
          intent: "repair",
          name: "repaired.jimsabz",
          title: "Repaired code",
          confidence: 1,
        };
    }
    return {
      message: `${d.message}\nAt ${d.at?.file || "your file"}, line ${d.at?.line || 1}. This local model cannot safely repair that change automatically. Open the failed compiler step to inspect it.`,
    };
  }
  const model = context.model || await loadModel();
  const result = specification.intent
    ? {intent:specification.intent,confidence:1,routing:specification.route}
    : classify(model, prompt);
  if (!result.intent || result.confidence < 0.42 || result.margin < 0.6)
    return {
      message:
        "I could not identify the program’s main behavior reliably. Describe what inputs it should accept and what it should print or display. For example: ‘Read two subject marks out of 100 and print the percentage’, or ‘Build a local gaming hub with login’. Your project is unchanged.",
    };
  if (result.intent === "racing2d" && /\b3d\b/.test(lower))
    return {
      message:
        "I can currently generate simple 2D racing games and basic 3D scenes. Ask for a 3D scene, then build on it in the editor.",
    };
  let code;
  try { code = build(result.intent, prompt); }
  catch (error) { return { message: error.message, followUps: ["Write a marksheet that asks how many subjects at runtime", "Write a marksheet for 7 subjects with average"] }; }
  const checked = await compile(
      [{ path: "main.jimsabz", text: code }],
      "main.jimsabz",
    );
  if (!checked.ok)
    throw new Error(
      "The generated code failed its compiler checks. No file was changed.",
    );
  return {
    ...result,
    code,
    request: prompt,
    topic: result.intent === "statistics" ? "array" : result.intent,
    followUps: result.intent === "marks" ? ["Change to 12 subjects with average", "Explain arrays and loops in a marksheet", "Write a marksheet that asks how many subjects at runtime"] : ["Explain this language feature", "How do I use arrays and functions?"],
    title: tasks[result.intent],
    name: result.intent.replace("2d", "-2d").replace("3d", "-3d") + ".jimsabz",
    checks: checked.stages.slice(0, 6).map((s) => s.state),
  };
}
export function learnedNext(model, code) {
  const words = code.match(/[\p{L}_][\p{L}\p{N}_]*|"[^"\n]*"|[^\s]/gu) || [],
    previous = words.at(-1);
  return (model.next[previous] || []).map(([text, count]) => ({ text, count }));
}
