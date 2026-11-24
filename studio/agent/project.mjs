import { interpretRequest, normalizeRequest } from "./request.mjs";
import { loginProject } from "./login-project.mjs";
import { percentageAnswer } from "./percentage.mjs";
import { build, tasks } from "./builders.mjs";
import { compile } from "../core/compiler.mjs";

const capabilityPatterns = [
  ["marks", /\b(marks?|grades?|percentage|feesad|darjo)\b/i],
  ["racing2d", /\b(racing|race car|traffic game)\b/i],
  ["scene3d", /\b(3d|three dimensional)\b/i],
  ["player2d", /\b(2d|controllable player|arrow keys)\b/i],
  ["sum", /\b(sum|addition|jama|add two)\b/i],
  ["condition", /\b(if.?else|conditional|positive|negative)\b/i],
  ["array", /\b(arrays?|qatar|list of numbers)\b/i],
  ["function", /\b(functions?|reusable|parameters)\b/i],
  ["loop", /\b(loops?|repeat|counter)\b/i],
  ["input", /\b(input|ask.*name|read.*name)\b/i],
  ["output", /\b(print|output|display.*text)\b/i],
];
const unsupported = [
  ["Database integration", /\b(database|mysql|postgres|sql server|mongodb)\b/i],
  [
    "Authentication and accounts",
    /\b(login|authentication|sign.?up|passwords?)\b/i,
  ],
  [
    "Web or mobile interface",
    /\b(web app|website|android|ios app|mobile app|dashboard|html|react)\b/i,
  ],
  ["Payments", /\b(payment|credit card|checkout)\b/i],
  [
    "Advanced game mechanics",
    /\b(multiplayer|football|soccer|chess|shooter|platformer)\b/i,
  ],
];
export function reportPlan(prompt, attachments) {
  const text = normalizeRequest([prompt, ...attachments.map((f) => f.text)].join("\n\n"));
  const requested = capabilityPatterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([intent]) => intent);
  // Marks and game builders already contain their own input/output and conditions.
  const interpreted = interpretRequest(text);
  const primary = ["login", "percentage"].includes(interpreted.intent) ? interpreted.intent : requested[0] || null;
  const extras = ["login", "percentage", "marks", "racing2d", "scene3d", "player2d"].includes(primary)
    ? []
    : requested
        .slice(1)
        .filter((i) => !["input", "output"].includes(i))
        .slice(0, 2);
  const missing = unsupported
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  const requirements = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
    .slice(0, 24);
  const base = attachments[0]?.name.replace(/\.[^.]+$/, "") || "report-project";
  const name =
    base
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "report-project";
  return { text, primary, extras, missing, requirements, name };
}
export async function generateProject(prompt, attachments) {
  const plan = reportPlan(prompt, attachments);
  const specialized = plan.primary === "login" ? loginProject(plan.text) : plan.primary === "percentage" ? percentageAnswer(plan.text) : null;
  const code = specialized?.code || (plan.primary
    ? build(plan.primary, plan.text)
    : '// Report project starter\n// Add your Jimsabz implementation here.\nbudhai "Project starter is ready."\n');
  const files = specialized?.files || [{ path: "main.jimsabz", text: code, kind: "source" }];
  for (const intent of plan.extras)
    files.push({
      path: `examples/${intent}.jimsabz`,
      text: build(intent, plan.text),
      kind: "source",
    });
  for (const file of files.filter(f => f.path.endsWith(".jimsabz"))) {
    const checked = await compile(files, file.path);
    if (!checked.ok)
      throw new Error(
        "The report starter failed compiler checks. No project was created.",
      );
  }
  const status =
    plan.missing.length || !plan.primary
      ? "Starter — further implementation required"
      : "Supported code generated — review against your report";
  const notes = `# ${plan.name}\n\n${status}\n\n## Sources\n${attachments.map((f) => `- ${f.name}`).join("\n")}\n\n## Generated\n${files.map((f) => `- ${f.path}`).join("\n")}\n\nOpen main.jimsabz and press Run. Other source files are independent examples: select one, then Run.\n\n## Remaining work\n${plan.missing.map((s) => `- ${s}: implement and verify separately.`).join("\n") || "- Review every report requirement, customize the source, and test it. A local builder cannot certify a whole project report as complete."}\n\n## Report excerpt\n${plan.requirements.map((s) => `> ${s}`).join("\n\n")}\n\nThe report was read as requirements, not as executable instructions. No chat or attachment was used to retrain the model.\n`;
  files.push({ path: "PROJECT-PLAN.md", text: notes, kind: "text" });
  return {
    ...specialized,
    code,
    name: "main.jimsabz",
    projectName: plan.name,
    files,
    title: plan.primary ? tasks[plan.primary] : "Report project starter",
    summary: `${files.length} files created from ${attachments.length} attached report(s). ${status}.`,
    limitations: (specialized?.limitations || "") + "\n" + (plan.missing.length
      ? "Remaining: " + plan.missing.join(", ") + ". See PROJECT-PLAN.md."
      : "Review PROJECT-PLAN.md against your full requirements before treating the project as complete."),
    checks: Array(6).fill("passed"),
  };
}
