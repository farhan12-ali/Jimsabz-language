import {sindhiLiteral,sindhiNumber} from "./sindhi-numbers.mjs";
export const vocabulary = [
  ["Map",'Map<lafz,adad> nishan = naon Map<lafz,adad>()',"Typed dictionary; import Collections"],
  ["Set",'Set<lafz> naala = naon Set<lafz>()',"Unique values; import Collections"],
  ["Task",'Task<adad> jawab = calculate()',"Typed asynchronous result"],
  ["@async",'@async kam calculate() -> adad {\n    @await Async.sleep(0.1)\n    wapas 42\n}',"Cooperative asynchronous function; import Async"],
  ["@interface",'@interface qism Named {\n    kam name() -> lafz\n}',"Interface method contract"],
  ["@override",'@override kam name() -> lafz {\n    wapas "Farhan"\n}',"Override a virtual or interface method"],
  ["generic",'kam identity<T>(T value) -> T {\n    wapas value\n}',"Compile-time typed specialization"],
  ["lambda",'kam(adad value)->adad => value*2',"Typed anonymous function with lexical capture"],
  ["sindhi_lafz", "sindhi_lafz(adad_satt)", "Number to Roman Sindhi word (0–1000)"],
  ["sindhi_adad", 'sindhi_adad("satt")', "Roman Sindhi word to whole number"],
  ["budhai", 'budhai "Hello"', "Print a value"],
  ["budh", 'budh("Your name: ")', "Read user input"],
  ["adad", "adad pheru = 0", "Whole number"],
  ["dec", "dec value = 0.0", "Decimal number"],
  ["lafz", 'lafz naam = ""', "Text value"],
  ["isharo", "isharo ready = ha", "True / false"],
  ["qatar", "qatar adad values = []", "Typed array"],
  [
    "jey",
    'jey (ha) {\n    budhai "Ha"\n} na_ta {\n    budhai "Na"\n}',
    "If / else condition",
  ],
  [
    "na_ta jey",
    'na_ta jey (ha) {\n    budhai "Biyo haal"\n}',
    "Else-if condition",
  ],
  ["na_ta", "na_ta {\n    \n}", "Otherwise"],
  [
    "gin",
    "gin (adad i = 0; i < 5; i++) {\n    budhai i\n}",
    "Repeat with a counter",
  ],
  ["wori", "wori (ha) {\n    rok\n}", "While loop"],
  ["kam", "kam add(adad a, adad b) -> adad {\n    wapas a + b\n}", "Function"],
  ["wapas", "wapas ", "Return a value"],
  ["kharna", "kharna gui", "Import a library"],
  [
    "khed",
    'khed "My game" {\n    khirki 960, 600\n    pichaan #131628\n}',
    "2D game",
  ],
  [
    "khed3d",
    'khed3d "My game" {\n    khirki 960, 600\n    pichaan #131628\n}',
    "3D game",
  ],
  [
    "kirdar",
    "kirdar Player {\n    jagah: (440, 280)\n    width: 40\n    height: 40\n    rang: violet\n    raftar: 5.0\n    qabu: arrows\n}",
    "2D actor",
  ],
  [
    "mujassamo",
    "mujassamo Player {\n    shakal3d: cube\n    jagah3d: (0.0, 0.0, 0.0)\n    paimano: (1.0, 1.0, 1.0)\n    rang: violet\n}",
    "3D object",
  ],
  ["har", "har 1 second {\n    \n}", "Timed event"],
  ["takkar", "takkar(Player, Enemy) {\n    \n}", "2D collision"],
  ["on_key", 'on_key("SPACE") {\n    \n}', "Key press"],
  ["pakko", "pakko adad maximum = 100", "Constant"],
  ["qism", 'qism Player {\n    lafz naam = "Player"\n    adad score = 0\n}', "Object type"],
  ["naon", "naon Player()", "Create an object"],
  ["paan", "paan.", "Current object inside a method"],
  [
    "azmai",
    "azmai {\n    \n} pakar (error) {\n    budhai error\n}",
    "Handle an error",
  ],
  ["raftar", "raftar: 5.0", "Movement speed"],
  ["jagah", "jagah: (100, 100)", "2D position"],
  ["rang", "rang: violet", "Color"],
  ["qabu", "qabu: arrows", "Player controls"],
  ["dekhar", "dekhar(score)", "Show a game variable"],
  ["khirki", "khirki 960, 600", "Canvas size"],
  ["pichaan", "pichaan #131628", "Background color"],
  ...Array.from({length:1001},(_,n)=>[sindhiLiteral(n),sindhiLiteral(n),"Roman Sindhi number: "+n]),
];
export function suggestions(code) {
  const actor = (name) => {
    const item = [...vocabulary.find((x) => x[0] === name)];
    let suffix = 1;
    while (
      new RegExp(
        "\\b(?:kirdar|mujassamo)\\s+Player" +
          (suffix === 1 ? "" : suffix) +
          "\\b",
      ).test(code)
    )
      suffix++;
    if (suffix > 1) item[1] = item[1].replace("Player", "Player" + suffix);
    return item;
  };
  if (/khed3d\s+"/.test(code))
    return [
      actor("mujassamo"),
      vocabulary.find((x) => x[0] === "har"),
      ["run", "Run your canvas", "See your progress"],
    ];
  if (/khed\s+"/.test(code))
    return [
      actor("kirdar"),
      vocabulary.find((x) => x[0] === "on_key"),
      vocabulary.find((x) => x[0] === "har"),
    ];
  const variables = [
    ...code.matchAll(/\b(adad|dec|lafz|isharo)\s+([\p{L}_][\p{L}\p{N}_]*)/gu),
  ];
  if (variables.length)
    return [
      [
        `print-${variables.at(-1)[2]}`,
        `budhai ${variables.at(-1)[2]}`,
        "Print your variable",
      ],
      ["input", 'lafz naam = budh("Your name: ")', "Ask for input"],
      vocabulary.find((x) => x[0] === "jey"),
    ];
  return [
    ["input", 'lafz naam = budh("Your name: ")', "Ask for input"],
    ["number", "adad pheru = 10", "Add a number"],
    ["output", 'budhai "Hello"', "Print a message"],
  ];
}
export function highlight(code) {
  return (
    (
      code.match(
        /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:\\.|[^"\\\n])*(?:"|$)|\b\d+(?:\.\d+)?\b|[\p{L}_][\p{L}\p{N}_]*|[^\p{L}\p{N}_]/gu,
      ) || []
    )
      .map((part) => {
        const esc = part
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;"),
          type =
            part.startsWith("//") || part.startsWith("/*")
              ? "comment"
              : part.startsWith('"')
                ? "string"
                : /^\d/.test(part) || (part.startsWith("adad_") && sindhiNumber(part.slice(5)) !== null)
                  ? "number"
                  : /^(adad|dec|lafz|isharo|qatar|khali|Map|Set|Task)$/.test(part)
                    ? "type"
                    : /^(budh|budhai|budha|kharna|khed|khed3d|jey|na_ta|gin|wori|kam|wapas|qism|naon|pakko|har|second|takkar|takkar3d|on_key|on_click|kirdar|mujassamo|ha|na|rok|agty|azmai|pakar|camera3d|roshni|manzar|chundo|halat|aam|andar|async|await|interface|override|virtual|abstract|final|private|protected|public)$/.test(
                          part,
                        )
                      ? "key"
                      : /^(khirki|pichaan|dekhar|jagah|rang|raftar|qabu|width|height|jagah3d|shakal3d|paimano|budh|badal|lambai|sindhi_lafz|sindhi_adad)$/.test(
                            part,
                          )
                        ? "call"
                        : "";
        return type ? `<span class="tok-${type}">${esc}</span>` : esc;
      })
      .join("") + "\n"
  );
}
