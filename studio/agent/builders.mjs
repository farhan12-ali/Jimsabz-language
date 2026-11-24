import { percentageProgram } from "./percentage.mjs";
import { loginProgram } from "./login-project.mjs";
import {objectProgram} from "./object-program.mjs";
import { statsProgram, loopProgram } from "./statistics.mjs";
import { requestedCount } from "./program-spec.mjs";
export const tasks = {
  percentage: "Marks and percentage",
  login: "Local account login and gaming hub",
  objects: "Classes, objects and reusable methods",
  statistics: "Totals and averages for the requested inputs",
  output: "Print a message",
  input: "Ask for a name",
  sum: "Add two user inputs",
  condition: "Use a condition",
  marks: "Marks, percentage and grade",
  loop: "Repeat an action",
  function: "Write a function",
  array: "Use a typed array",
  player2d: "Create a controllable 2D actor",
  scene3d: "Create a 3D scene",
  racing2d: "Create a simple 2D racing game",
};
const quote = (value) => JSON.stringify(String(value));
export { marksSpec, marksProgram } from "./program-spec.mjs";
import { marksProgram } from "./program-spec.mjs";
export function build(intent, prompt = "") {
  if (intent === "percentage") return percentageProgram(prompt);
  if (intent === "login") return loginProgram(prompt);
  if (intent === "objects") return objectProgram(prompt);
  if (intent === "statistics") return statsProgram(prompt);
  if (intent === "array" && (/average|mean|many|any|runtime/i.test(prompt) || requestedCount(prompt,"numbers",null) !== null)) return statsProgram(prompt);
  if (intent === "sum" && (/average|mean|many|any|runtime/i.test(prompt) || requestedCount(prompt, "numbers", 2) !== 2)) return statsProgram(prompt);
  if (intent === "function" && /array|average|many|any|qatar/i.test(prompt)) return statsProgram(prompt);
  if (intent === "loop") return loopProgram(prompt);
  const quoted = prompt.match(/["“]([^"”]{1,120})["”]/),
    message = quoted?.[1] || "Farhan",
    speed = Math.max(
      0.5,
      Math.min(20, Number(prompt.match(/speed\s+(\d+(?:\.\d+)?)/i)?.[1] || 6)),
    ),
    hex = prompt.match(/#[a-f\d]{6}\b/i)?.[0],
    color =
      hex ||
      ["red", "blue", "green", "violet", "cyan", "amber"].find((c) =>
        new RegExp(`\\b${c}\\b`, "i").test(prompt),
      ) ||
      "violet";
  if (intent === "output")
    return `// Print one line in the terminal\nbudhai = ${quote(message)}\n`;
  if (intent === "input")
    return '// Take input, then show the result\nlafz naam = budh("Your name: ")\nbudhai "Hello, " + naam\n';
  if (intent === "sum")
    return '// Ba adad watho, po kul dikhaayo\nadad pheru = budh("Pheru adad: ")\nadad biyo = budh("Biyo adad: ")\nbudhai pheru + biyo\n';
  if (intent === "marks") return marksProgram(prompt);
  if (intent === "condition")
    return '// Jey / na_ta: if, else-if, else\nadad ang = budh("Hik adad likho: ")\njey (ang > 0) {\n    budhai "Positive"\n} na_ta jey (ang == 0) {\n    budhai "Zero"\n} na_ta {\n    budhai "Negative"\n}\n';
  if (intent === "function")
    return "// Ba adad jama karan jo kam\nkam jor(adad pheru, adad biyo) -> adad {\n    wapas pheru + biyo\n}\nbudhai jor(12, 8)\n";
  if (intent === "array")
    return "// Adadan ji qatar jo kul\nqatar adad ang = [10, 20, 30]\nadad kul = 0\ngin hik andar ang {\n    kul += hik\n}\nbudhai kul\n";
  if (intent === "player2d")
    return `// Run, click the game view, then use the arrow keys\nkharna gui\n\nkhed "My 2D game" {\n    khirki 960, 600\n    pichaan #121629\n\n    kirdar Player {\n        jagah: (440, 280)\n        width: 44\n        height: 44\n        rang: ${color}\n        raftar: ${speed.toFixed(1)}\n        qabu: arrows\n    }\n}\n`;
  if (intent === "scene3d")
    return `// A controllable 3D object. Click the game view and use WASD.\nkharna gui3d\n\nkhed3d "My 3D scene" {\n    khirki 960, 600\n    pichaan #111527\n    mujassamo Player {\n        shakal3d: cube\n        jagah3d: (0.0, 0.0, 0.0)\n        paimano: (1.0, 1.0, 1.0)\n        rang: ${color}\n        raftar: ${speed.toFixed(1)}\n        qabu: wasd_3d\n    }\n    camera3d {\n        follow3d: Player\n        jagah3d: (0.0, 4.0, 10.0)\n        fov: 62\n    }\n    roshni {\n        simt: (0.4, -1.0, -0.6)\n        ambient: 0.35\n    }\n}\n`;
  if (intent === "racing2d")
    return `// Generated for your request. Edit this Jimsabz code to build your game.\n// Arrow keys move the player. Avoid the traffic. Run again to restart.\nkharna gui\nkharna hisab\n\nkhed "My racing game" {\n    khirki 480, 680\n    pichaan #132327\n    adad score = 0\n    adad lives = 3\n    dekhar(score, lives)\n\n    kirdar Road {\n        jagah: (40, 0)\n        width: 400\n        height: 680\n        rang: #292d41\n    }\n    kirdar Divider {\n        jagah: (237, 0)\n        width: 6\n        height: 680\n        rang: #c0b8de\n    }\n    kirdar Player {\n        jagah: (220, 550)\n        width: 38\n        height: 72\n        rang: ${color}\n        raftar: ${speed.toFixed(1)}\n        qabu: arrows\n    }\n    kirdar Traffic {\n        width: 40\n        height: 72\n        rang: #ff8b98\n        paida: random_top(1.4)\n        raftar: 3.5\n    }\n\n    har 1 second {\n        score += 1\n        jey (score >= 60) {\n            jeet("You completed the race!")\n        }\n    }\n    takkar(Player, Traffic) {\n        lives -= 1\n        khatam(Traffic)\n        jey (lives <= 0) {\n            haar("Try again. You can edit your game too!")\n        }\n    }\n}\n`;
  throw new Error("This local agent does not support that request yet.");
}
export const blank2d = (name) =>
  `// Your blank 2D project. Add your own actors and rules.\nkharna gui\n\nkhed ${quote(name)} {\n    khirki 960, 600\n    pichaan #131628\n\n    // Write your game code here\n}\n`;
export const blank3d = (name) =>
  `// Your blank 3D project. Add your own meshes and rules.\nkharna gui3d\n\nkhed3d ${quote(name)} {\n    khirki 960, 600\n    pichaan #111527\n\n    camera3d {\n        jagah3d: (0.0, 4.0, 10.0)\n        fov: 62\n    }\n    roshni {\n        simt: (0.4, -1.0, -0.6)\n        ambient: 0.35\n    }\n\n    // Write your game code here\n}\n`;
