import {compilerV3} from "./compiler-v3.mjs";
import {nullable} from "./types.mjs";
import {captureEvidence, semanticSymbolCount} from "./compiler-trace.mjs";
import {
  Diagnostic,
  lex,
  Parser,
  walk,
  astText,
  resolveModule,
  normalizePath,
} from "./language.mjs";
export const OP = Object.freeze({
  Push: 0,
  Load: 1,
  Declare: 2,
  Pop: 3,
  Dup: 4,
  Member: 5,
  Index: 6,
  Array: 7,
  Vector: 8,
  Binary: 9,
  Unary: 10,
  Store: 11,
  Enter: 12,
  Leave: 13,
  Unwind: 14,
  Jump: 15,
  JumpFalse: 16,
  JumpTrue: 17,
  Call: 18,
  Method: 19,
  New: 20,
  Return: 21,
  Print: 22,
  Try: 23,
  EndTry: 24,
  Throw: 25,
  Entity: 26,
  Bind: 27,
  Halt: 28,
  Read: 29, Closure:30, Invoke:31, CallNamed:32, Await:33,
});
export const STAGES = [
  ["Lexical analysis", "Reads your words and symbols."],
  ["Syntax analysis", "Checks the order, brackets and grammar."],
  ["AST generation", "Organizes the code into a syntax tree."],
  ["Semantic analysis", "Checks names, types and library imports."],
  ["Code generation", "Creates executable stack instructions."],
  ["Asset validation", "Checks the images, sounds and meshes you added."],
  ["Run program", "Runs your code and handles input/output."],
];
export const primitive = (t) => ["adad", "dec", "lafz", "isharo"].includes(t),
  numeric = (t) => t === "adad" || t === "dec";
export function compatible(target, value) {
  if(nullable(target))return value==="khali"||compatible(target.slice(0,-1),nullable(value)?value.slice(0,-1):value);
  if(nullable(value))return false;
  return (
    target === "any" ||
    value === "any" ||
    target === value ||
    (value === "input" && primitive(target)) ||
    (target === "dec" && value === "adad") ||
    (target.startsWith("qatar ") &&
      value.startsWith("qatar ") &&
      compatible(target.slice(6), value.slice(6)))
  );
}
export const literalWords = new Set(
  "arrows wasd arrows_platformer wasd_3d none cube sphere plane pyramid white black cyan lime red blue amber green violet gray yellow orange patrol chase".split(
    " ",
  ),
);
const builtinResults = {
  budhai: "khali",
  budh: "input",
  badal: "any",
  lambai: "adad",
  sindhi_lafz: "lafz",
  sindhi_adad: "adad",
  likh: "khali",
  parh: "lafz",
  mahfooz: "khali",
  wapas_lao: "khali",
  sqrt: "dec",
  sin: "dec",
  cos: "dec",
  abs: "dec",
  min: "dec",
  max: "dec",
  bina_tarteeb: "dec",
  floor: "adad",
  round: "adad",
  waqt: "dec",
  dekhar: "khali",
  khirki: "khali",
  pichaan: "khali",
  dhun: "khali",
  wajai: "khali",
  awaz: "khali",
  chup: "khali",
  jeet: "khali",
  haar: "khali",
  tabdeel_manzar: "khali",
  chining: "khali",
  paida: "any",
  khatam: "khali",
  chalao: "khali",
  random_top: "spawn",
  patrol: "behavior",
  chase: "behavior",
  assert: "khali",
  uthao: "khali",
};
const arity = {
  budhai: [1, 1],
  budh: [0, 1],
  badal: [2, 2],
  lambai: [1, 1],
  sindhi_lafz: [1, 1],
  sindhi_adad: [1, 1],
  likh: [2, 2],
  parh: [1, 1],
  mahfooz: [1, 1],
  wapas_lao: [1, 1],
  sqrt: [1, 1],
  sin: [1, 1],
  cos: [1, 1],
  abs: [1, 1],
  min: [2, 2],
  max: [2, 2],
  bina_tarteeb: [2, 2],
  floor: [1, 1],
  round: [1, 1],
  waqt: [0, 0],
  khirki: [2, 2],
  pichaan: [1, 1],
  dhun: [1, 1],
  wajai: [1, 1],
  awaz: [1, 1],
  chup: [0, 0],
  jeet: [0, 1],
  haar: [0, 1],
  tabdeel_manzar: [1, 1],
  chining: [1, 3],
  paida: [1, 2],
  khatam: [1, 1],
  chalao: [2, 2],
  random_top: [1, 1],
  patrol: [2, 2],
  chase: [1, 1],
  assert: [1, 2],
  uthao: [1, 1],
};
const math = new Set(
  "sqrt sin cos abs min max bina_tarteeb floor round".split(" "),
);
const graphics = new Set(
  "dekhar khirki pichaan jeet haar tabdeel_manzar chining paida khatam chalao random_top patrol chase".split(
    " ",
  ),
);
class Analyzer {
  constructor() {
    this.scopes = [
      new Map([
        ["dt", { type: "dec", fixed: true }],
        ["mouse_x", { type: "adad", fixed: true }],
        ["mouse_y", { type: "adad", fixed: true }],
      ]),
    ];
    this.libraries = new Set();
    this.functions = {};
    this.classes = {};
    this.entities = {};
    this.loops = 0;
    this.switches = 0;
    this.inGame = false;
    this.result = "";
  }
  fail(n, message, code = "SEM-03") {
    throw new Diagnostic(code, 3, n.at, message);
  }
  gate(n, lib) {
    if (!this.libraries.has(lib))
      this.fail(
        n,
        `Add kharna ${lib} at the top of this file to use ${n.text || n.kind}.`,
        "SEM-01",
      );
  }
  graphical(n) {
    if (!this.libraries.has("gui") && !this.libraries.has("gui3d"))
      this.fail(n, "Add kharna gui for 2D or kharna gui3d for 3D.", "SEM-01");
  }
  valid(type) {
    return (
      primitive(type) ||
      type === "khali" ||
      (type.startsWith("qatar ") && this.valid(type.slice(6))) ||
      !!this.classes[type]
    );
  }
  lookup(n) {
    for (let i = this.scopes.length - 1; i >= 0; i--)
      if (this.scopes[i].has(n.text)) return this.scopes[i].get(n.text);
    this.fail(
      n,
      `'${n.text}' has not been declared. Give it a type and a value first.`,
      "SEM-02",
    );
  }
  declare(n, name, type, fixed = false) {
    const reserved = new Set(
      "adad dec lafz isharo qatar khali budha budhai budh jey na_ta kharna acha khed khed3d kirdar mujassamo kam wapas qism naon ha na pakko wori gin rok agty azmai pakar hisab camera shabak dt mouse_x mouse_y".split(
        " ",
      ),
    );
    const scope = this.scopes.at(-1);
    if (
      scope.has(name) ||
      name in builtinResults ||
      literalWords.has(name) ||
      reserved.has(name)
    )
      this.fail(
        n,
        `The name '${name}' is already used or reserved. Choose another name.`,
        "SEM-02",
      );
    scope.set(name, { type, fixed });
  }
  register(n) {
    if (n.kind === "import") {
      if (
        !["gui", "gui3d", "audio", "hisab", "waqt", "shabak"].includes(n.text)
      )
        this.fail(n, `Unknown library '${n.text}'.`, "SEM-01");
      this.libraries.add(n.text);
    }
    if (n.kind === "class") {
      if (this.classes[n.text]) this.fail(n, "Duplicate class name.", "SEM-02");
      const names = new Set();
      for (const f of n.children) {
        if (names.has(f.text))
          this.fail(f, "Duplicate class member.", "SEM-02");
        names.add(f.text);
      }
      this.classes[n.text] = {
        fields: n.children.filter((x) => x.kind === "var"),
        methods: n.children.filter((x) => x.kind === "function"),
      };
      return;
    }
    if (n.kind === "function") {
      if (this.functions[n.text])
        this.fail(n, "Duplicate function name.", "SEM-02");
      this.functions[n.text] = n;
      return;
    }
    if (n.kind === "actor" || n.kind === "mesh") {
      this.declare(n, n.text, "@" + n.text);
      this.entities["@" + n.text] = {
        jagah: "vec2",
        jagah3d: "vec3",
        ghumao: "vec3",
        paimano: "vec3",
        raftar: "dec",
        rang: "lafz",
        qabu: "lafz",
        wazan: "dec",
        chhal: "dec",
        thandho: "isharo",
        visible: "isharo",
        width: "dec",
        height: "dec",
        vy: "dec",
        tasveer: "lafz",
        shakal3d: "lafz",
        paida: "spawn",
        chal_ai: "behavior",
      };
      for (const prop of n.children)
        if (
          !(prop.text in this.entities["@" + n.text]) &&
          prop.text !== "harkat"
        )
          this.entities["@" + n.text][prop.text] = "any";
      return;
    }
    n.children.forEach((c) => this.register(c));
  }
  assignable(n) {
    if (n.kind === "name") {
      if (this.lookup(n).fixed)
        this.fail(n, "A pakko constant cannot be changed.", "SEM-02");
    } else if (n.kind === "member" || n.kind === "index") {
      if (n.kind === "member" && n.text === "lambai")
        this.fail(n, "Array length is read-only.", "SEM-02");
      let root = n;
      while (root.kind === "member" || root.kind === "index")
        root = root.children[0];
      if (root.kind === "name" && this.lookup(root).fixed && !this.lookup(root).bindingOnly)
        this.fail(
          n,
          "A pakko value cannot be changed through its fields or indices.",
          "SEM-02",
        );
    } else
      this.fail(
        n,
        "Assign to a variable, object field or array element.",
        "SEM-02",
      );
  }
  checkArgs(n, params, start = 1) {
    if (n.children.length - start !== params.length)
      this.fail(
        n,
        `Expected ${params.length} arguments, received ${n.children.length - start}.`,
      );
    params.forEach(([type, name], i) => {
      const actual = this.expr(n.children[start + i]);
      if (!this.accepts(type, actual))
        this.fail(n, `${name} expects ${type}, received ${actual}.`);
    });
  }
  binary(n, l, r, op) {
    if (op === "+" && l === "lafz" && primitive(r)) return "lafz";
    if (
      ["vec2", "vec3"].includes(l) &&
      (r === l || numeric(r)) &&
      ["+", "-", "*", "/"].includes(op)
    )
      return l;
    if (["&&", "||"].includes(op)) {
      if (l !== "isharo" || r !== "isharo")
        this.fail(n, "Logical operators need isharo values.");
      return "isharo";
    }
    if (["==", "!="].includes(op)) {
      if (l !== r && !(numeric(l) && numeric(r)))
        this.fail(n, `Cannot compare ${l} and ${r}.`);
      return "isharo";
    }
    if ([">", "<", ">=", "<="].includes(op)) {
      if (!(numeric(l) && numeric(r)) && !(l === "lafz" && r === "lafz"))
        this.fail(n, "Compare matching numbers or strings.");
      return "isharo";
    }
    if (!numeric(l) || !numeric(r))
      this.fail(n, `'${op}' cannot combine ${l} and ${r}.`);
    if (op === "%" && (l !== "adad" || r !== "adad"))
      this.fail(n, "% requires whole adad numbers.");
    return l === "dec" || r === "dec" ? "dec" : "adad";
  }
  expr(n) {
    const c = n.children;
    let type = "";
    switch (n.kind) {
      case "int":
        type = "adad";
        break;
      case "dec":
        type = "dec";
        break;
      case "string":
        type = "lafz";
        break;
      case "bool":
        type = "isharo";
        break;
      case "null":
        type = "khali";
        break;
      case "name":
        type = literalWords.has(n.text)
          ? "lafz"
          : primitive(n.text)
            ? "type"
            : ["hisab", "camera", "shabak"].includes(n.text)
              ? "namespace"
              : this.lookup(n).type;
        break;
      case "named":
        type = this.expr(c[0]);
        break;
      case "vector":
        c.forEach((x) => {
          if (!numeric(this.expr(x)))
            this.fail(x, "Vector components must be numbers.");
        });
        type = c.length === 2 ? "vec2" : "vec3";
        break;
      case "array": {
        let element = "any";
        for (const x of c) {
          const xt = this.expr(x);
          if (element === "any") element = xt;
          else if (numeric(element) && numeric(xt)) {
            if (xt === "dec") element = "dec";
          } else if (!this.accepts(element, xt))
            this.fail(x, "Use one compatible type in this qatar array.");
        }
        type = "qatar " + element;
        break;
      }
      case "index": {
        const base = this.expr(c[0]);
        if (!base.startsWith("qatar "))
          this.fail(n, "Only a qatar array can be indexed.");
        if (this.expr(c[1]) !== "adad")
          this.fail(n, "An array index must be adad.");
        type = base.slice(6);
        break;
      }
      case "member": {
        const base = this.expr(c[0]);
        if (base.startsWith("qatar ") && n.text === "lambai") type = "adad";
        else if (
          ["vec2", "vec3"].includes(base) &&
          ["x", "y", ...(base === "vec3" ? ["z"] : [])].includes(n.text)
        )
          type = "dec";
        else if (this.entities[base]?.[n.text])
          type = this.entities[base][n.text];
        else if (this.classes[base])
          type =
            this.classes[base].fields.find((f) => f.text === n.text)?.type ||
            "";
        if (!type) this.fail(n, `${base} has no field '${n.text}'.`, "SEM-02");
        break;
      }
      case "binary":
        type = this.binary(n, this.expr(c[0]), this.expr(c[1]), n.text);
        break;
      case "unary": {
        const t = this.expr(c[0]);
        if (n.text === "!") {
          if (t !== "isharo") this.fail(n, "Negation requires isharo.");
          type = "isharo";
        } else {
          if (!numeric(t)) this.fail(n, "A numeric sign requires a number.");
          type = t;
        }
        break;
      }
      case "assign": {
        this.assignable(c[0]);
        const target = this.expr(c[0]);
        let value = this.expr(c[1]);
        if (n.text !== "=") value = this.binary(n, target, value, n.text[0]);
        if (!this.accepts(target, value))
          this.fail(
            n,
            `Cannot put ${value} into ${target}. Use badal(value, ${target}) to convert it.`,
          );
        type = target;
        break;
      }
      case "new": {
        const cls = this.classes[n.text];
        if (!cls) this.fail(n, `Unknown qism '${n.text}'.`, "SEM-02");
        let required=cls.fields.length;
        while(required && cls.fields[required-1].children.length)required--;
        if(c.length<required||c.length>cls.fields.length)this.fail(n,`Expected ${required}–${cls.fields.length} constructor arguments, received ${c.length}.`);
        this.checkArgs(n,cls.fields.slice(0,c.length).map(f=>[f.type,f.text]),0);
        type = n.text;
        break;
      }
      case "increment": {
        this.assignable(c[0]);const target=this.expr(c[0]);
        if(!numeric(target))this.fail(n,"++ and -- require a numeric variable, field or array element.");
        type=target;break;
      }
      case "call": {
        const callee = c[0];
        if (callee.kind === "name") {
          const name = callee.text;
          if(name === "budhai")this.fail(n,"budhai is output. Use budh(...) to read a value; put budhai on its own output statement.");
          if (this.functions[name]) {
            this.checkArgs(n, this.functions[name].params);
            type = this.functions[name].type;
            break;
          }
          if (!(name in builtinResults))
            this.fail(callee, `Unknown function '${name}'.`, "SEM-02");
          type = builtinResults[name];
          const limits = arity[name];
          if (limits && (c.length - 1 < limits[0] || c.length - 1 > limits[1]))
            this.fail(
              n,
              `${name} expects ${limits[0] === limits[1] ? limits[0] : limits.join("–")} arguments.`,
            );
          if (name === "badal") {
            this.expr(c[1]);
            if (c[2].kind !== "name" || !primitive(c[2].text))
              this.fail(
                n,
                "Choose adad, dec, lafz or isharo for the conversion.",
              );
            c[2].type = "type";
            type = c[2].text;
          } else {
            c.slice(1).forEach((x) => this.expr(x));
            if (name === "sindhi_lafz" && c[1].type !== "adad") this.fail(n, "sindhi_lafz expects an adad from 0 through 1000.");
            if (name === "sindhi_adad" && c[1].type !== "lafz") this.fail(n, "sindhi_adad expects Roman Sindhi lafz text.");
            if (
              name === "budh" &&
              c[1] &&
              c[1].type !== "lafz"
            )
              this.fail(n, "The input prompt must be quoted lafz text.");
          }
          if (math.has(name)) {
            this.gate(n, "hisab");
            if (c.slice(1).some((x) => !numeric(x.type)))
              this.fail(n, "Math functions require numeric arguments.");
            if (["abs", "min", "max", "bina_tarteeb"].includes(name))
              type = c.slice(1).some((x) => x.type === "dec") ? "dec" : "adad";
          }
          if (["dhun", "wajai", "awaz", "chup"].includes(name))
            this.gate(n, "audio");
          if (graphics.has(name)) this.graphical(n);
          if (name === "waqt") this.gate(n, "waqt");
          if (
            ["likh", "parh", "mahfooz", "wapas_lao"].includes(name) &&
            c[1]?.type !== "lafz"
          )
            this.fail(n, "Use a quoted file path.");
          if (name === "paida" && c[1]) type = c[1].type;
        } else if (callee.kind === "member") {
          const base = this.expr(callee.children[0]),
            method = callee.text;
          if (base.startsWith("qatar ")) {
            const root = callee.children[0];
            if (root.kind === "name" && this.lookup(root).fixed)
              this.fail(n, "A pakko array cannot be changed.", "SEM-02");
            if (c.length !== 2)
              this.fail(n, "This array method expects one argument.");
            const arg = this.expr(c[1]);
            if (method === "joryo") {
              if (!this.accepts(base.slice(6), arg))
                this.fail(n, "The array item has the wrong type.");
              type = "khali";
            } else if (method === "kadh") {
              if (arg !== "adad") this.fail(n, "kadh expects an adad index.");
              type = base.slice(6);
            } else this.fail(n, `Unknown array method '${method}'.`);
          } else if (this.classes[base]) {
            const methodNode = this.classes[base].methods.find(
              (m) => m.text === method,
            );
            if (!methodNode)
              this.fail(n, `Unknown method '${method}'.`, "SEM-02");
            this.checkArgs(n, methodNode.params);
            type = methodNode.type;
          } else if (base === "namespace") {
            const ns = callee.children[0].text;
            if (ns === "hisab") {
              const simple = {
                ...n,
                children: [
                  { ...callee, kind: "name", text: method },
                  ...c.slice(1),
                ],
              };
              type = this.expr(simple);
            } else if (ns === "camera") {
              if (method !== "follow" || c.length !== 2)
                this.fail(n, "Use camera.follow(Actor).");
              this.graphical(n);
              this.expr(c[1]);
              type = "khali";
            } else {
              this.gate(n, "shabak");
              this.fail(
                n,
                "LAN networking runs in exported native applications. Use the desktop runtime for shabak.",
                "SEM-04",
              );
            }
          } else this.fail(n, "This value has no callable method.", "SEM-02");
        } else this.fail(n, "Call a named function or method.");
        break;
      }
      default:
        this.fail(n, `Unsupported expression ${n.kind}.`);
    }
    n.type = type;
    return type;
  }
  guaranteed(n) {
    return (
      n.kind === "return" ||
      (n.kind === "if" &&
        n.children.length === 3 &&
        this.guaranteed(n.children[1]) &&
        this.guaranteed(n.children[2])) ||
      (n.kind === "try" && n.children.every((c) => this.guaranteed(c))) ||
      (n.kind === "block" && n.children.some((c) => this.guaranteed(c)))
    );
  }
  func(n, owner = "") {
    if (!this.valid(n.type)) this.fail(n, "Unknown return type.");
    this.result = n.type;
    this.scopes.push(new Map());
    if (owner)
      for (const f of this.classes[owner].fields)
        this.scopes.at(-1).set(f.text, { type: f.type, fixed: false });
    if (owner)
      this.scopes.at(-1).set("paan", { type: owner, fixed: true, bindingOnly: true });
    const seen = new Set();
    for (const [type, name] of n.params) {
      if(owner && name === "paan")this.fail(n,"paan refers to the current object; choose another parameter name.","SEM-02");
      if (!this.valid(type) || type === "khali")
        this.fail(n, "Invalid parameter type.");
      if (seen.has(name)) this.fail(n, "Duplicate parameter name.");
      seen.add(name);
      this.scopes.at(-1).set(name, { type, fixed: false });
    }
    this.statement(n.children[0]);
    if (n.type !== "khali" && !this.guaranteed(n.children[0]))
      this.fail(n, `Return ${n.type} on every path in ${n.text}.`);
    this.scopes.pop();
    this.result = "";
  }
  statement(n) {
    const c = n.children;
    switch (n.kind) {
      case "program":
        c.forEach((x) => this.statement(x));
        break;
      case "block":
        this.scopes.push(new Map());
        c.forEach((x) => this.statement(x));
        this.scopes.pop();
        break;
      case "var":
        if (!this.valid(n.type) || n.type === "khali")
          this.fail(n, `Unknown variable type '${n.type}'.`);
        if (c.length && !this.accepts(n.type, this.expr(c[0])))
          this.fail(n, `Cannot initialize ${n.type} with ${c[0].type}.`);
        if (n.fixed && !c.length)
          this.fail(n, "Give this pakko constant an initial value.");
        this.declare(n, n.text, n.type, n.fixed);
        break;
      case "expression":
      case "print":
        this.expr(c[0]);
        break;
      case "if":
      case "while":
        if (this.expr(c[0]) !== "isharo")
          this.fail(n, "The condition must produce isharo (ha/na).");
        if (n.kind === "while") this.loops++;
        this.statement(c[1]);
        if (n.kind === "while") this.loops--;
        if (c[2]) this.statement(c[2]);
        break;
      case "for":
        this.scopes.push(new Map());
        if (c[0].kind === "var") this.statement(c[0]);
        else this.expr(c[0]);
        if (this.expr(c[1]) !== "isharo")
          this.fail(n, "The gin condition must produce isharo.");
        this.expr(c[2]);
        this.loops++;
        this.statement(c[3]);
        this.loops--;
        this.scopes.pop();
        break;
      case "foreach": {
        const type = this.expr(c[0]);
        if (!type.startsWith("qatar "))
          this.fail(n, "gin andar expects a qatar array.");
        this.scopes.push(new Map());
        this.declare(n, n.text, type.slice(6));
        this.loops++;
        this.statement(c[1]);
        this.loops--;
        this.scopes.pop();
        break;
      }
      case "break":
        if (!this.loops && !this.switches)
          this.fail(n, "Use rok inside a loop or chundo.");
        break;
      case "continue":
        if (!this.loops) this.fail(n, "Use agty inside a loop.");
        break;
      case "return":
        if (!this.result) this.fail(n, "Use wapas inside a kam function.");
        if (!this.accepts(this.result, c[0] ? this.expr(c[0]) : "khali"))
          this.fail(n, `This function returns ${this.result}.`);
        break;
      case "try":
        this.statement(c[0]);
        this.scopes.push(new Map());
        this.declare(n, n.text, "lafz");
        this.statement(c[1]);
        this.scopes.pop();
        break;
      case "switch": {
        const type = this.expr(c[0]);
        this.switches++;
        let defaultSeen = false;
        for (const branch of c.slice(1)) {
          if (branch.kind === "case") {
            if (!this.accepts(type, this.expr(branch.children[0])))
              this.fail(branch, "The halat value has the wrong type.");
          } else {
            if (defaultSeen)
              this.fail(branch, "Only one aam branch is allowed.");
            defaultSeen = true;
          }
          this.statement(branch.children.at(-1));
        }
        this.switches--;
        break;
      }
      case "game":
        if (this.inGame)
          this.fail(n, "Do not nest a game inside another game.");
        this.gate(n, n.type === "3" ? "gui3d" : "gui");
        this.inGame = true;
        c[0].children.forEach((x) => this.statement(x));
        this.inGame = false;
        break;
      case "scene":
        this.graphical(n);
        c[0].children.forEach((x) => this.statement(x));
        break;
      case "actor":
      case "mesh": {
        this.gate(n, n.kind === "mesh" ? "gui3d" : "gui");
        const props = this.entities["@" + n.text];
        for (const p of c) {
          if (p.text === "harkat") {
            p.children.forEach((x) => this.expr(x));
            continue;
          }
          const type = this.expr(p.children[0]);
          if (!this.accepts(props[p.text], type))
            this.fail(
              p,
              `${p.text} expects ${props[p.text]}, received ${type}.`,
            );
          if (props[p.text] === "any") props[p.text] = type;
          p.children.slice(1).forEach((x) => {
            if (!numeric(this.expr(x)))
              this.fail(x, "Sprite sizes must be numeric.");
          });
        }
        break;
      }
      case "config":
        this.gate(n, "gui3d");
        c.forEach((p) => this.expr(p.children[0]));
        break;
      case "window":
      case "background":
        this.graphical(n);
        c.forEach((x) => this.expr(x));
        if (n.kind === "window" && c.some((x) => x.type !== "adad"))
          this.fail(n, "khirki width and height must be adad.");
        break;
      case "audio":
        this.gate(n, "audio");
        this.expr(c[0]);
        break;
      case "timer":
      case "event": {
        this.graphical(n);
        if (!this.inGame)
          this.fail(n, "Place game events inside a khed or khed3d block.");
        if (n.kind === "timer") {
          if (!numeric(this.expr(c[0])))
            this.fail(n, "har needs a numeric interval.");
        } else {
          const collision = ["takkar", "takkar3d"].includes(n.text);
          if (c.length - 1 !== (collision ? 2 : 1))
            this.fail(n, "This event has the wrong number of arguments.");
          if (n.text === "takkar3d") this.gate(n, "gui3d");
          for (const arg of c.slice(0, -1)) {
            const type = this.expr(arg);
            if (collision && !type.startsWith("@"))
              this.fail(arg, "Collision arguments must name actors or meshes.");
            if (!collision && type !== "lafz")
              this.fail(arg, "Use a quoted key or mouse-button name.");
          }
        }
        this.statement(c.at(-1));
        break;
      }
      case "tilemap":
        this.gate(n, "gui");
        if (this.expr(c[0]) !== "qatar qatar adad")
          this.fail(n, "naqsho needs a two-dimensional qatar adad array.");
        this.declare(n, n.text, c[0].type);
        break;
      case "shop":
        this.graphical(n);
        this.expr(c[0]);
        for (const item of c.slice(1)) {
          this.expr(item.children[0]);
          if (!numeric(this.expr(item.children[1])))
            this.fail(item, "Shop prices must be numbers.");
          this.statement(item.children[2]);
        }
        break;
      case "level":
        this.graphical(n);
        this.expr(c[0]);
        this.statement(c[1]);
        break;
      case "class":
      case "function":
      case "import":
        break;
      default:
        this.fail(n, `Unsupported statement ${n.kind}.`);
    }
  }
  analyze(root) {
    this.register(root);
    for (const cls of Object.values(this.classes))
      for (const f of cls.fields) {
        if (
          !this.valid(f.type) ||
          f.type === "khali" ||
          f.fixed || f.text === "paan"
        )
          this.fail(
            f,
            "Use a valid field type and a regular field name; pakko fields are not supported.",
          );
      }
    this.statement(root);
    for(const cls of Object.values(this.classes)) {
      this.scopes.push(new Map());
      for(const field of cls.fields) {
        if(field.children.length) {
          const actual=this.expr(field.children[0]);
          if(!this.accepts(field.type,actual))this.fail(field,`Cannot initialize ${field.type} field with ${actual}.`);
        }
        this.declare(field,field.text,field.type);
      }
      this.scopes.pop();
    }
    for (const f of Object.values(this.functions)) this.func(f);
    for (const [owner, cls] of Object.entries(this.classes))
      for (const f of cls.methods) this.func(f, owner);
    return {
      globals: Object.fromEntries(this.scopes[0]),
      functions: this.functions,
      classes: this.classes,
      libraries: [...this.libraries],
      entities: this.entities,
    };
  }
}
class Generator {
  constructor(analysis) {
    this.a = analysis;
    this.p = {
      title: "",
      root: "",
      code: [],
      functions: {},
      classes: {},
      assets: [],
    };
    this.code = this.p.code;
    this.depth = 0;
    this.unique = 0;
    this.controls = [];
    this.scene = "";
  }
  emit(op, n, a = 0, text = "") {
    this.code.push({ op, a, text, at: { ...n.at } });
    return this.code.length - 1;
  }
  patch(i, to = this.code.length) {
    this.code[i].a = to;
  }
  push(n, text = "", kind = 4) {
    this.emit(OP.Push, n, kind, String(text));
  }
  load(n, name) {
    this.emit(OP.Load, n, 0, name);
  }
  declare(n, name, type, fixed = false) {
    this.emit(OP.Declare, n, fixed ? 1 : 0, name + "\x1f" + type);
  }
  call(n, name, count) {
    this.emit(OP.Call, n, count, name);
  }
  enter(n) {
    this.emit(OP.Enter, n);
    this.depth++;
  }
  leave(n) {
    this.emit(OP.Leave, n);
    this.depth--;
  }
  expr(n, reference = false) {
    const c = n.children;
    switch (n.kind) {
      case "int":
        this.push(n, n.text, 1);
        break;
      case "dec":
        this.push(n, n.text, 2);
        break;
      case "string":
        this.push(n, n.text);
        break;
      case "bool":
        this.push(n, n.text === "ha" ? "1" : "0", 3);
        break;
      case "null":
        this.push(n, "", 0);
        break;
      case "name":
        if (n.type === "type" || literalWords.has(n.text)) {
          this.push(n, n.text);
        } else {
          this.load(n, n.text);
          if (!reference) this.emit(OP.Read, n);
        }
        break;
      case "named":
        this.expr(c[0]);
        break;
      case "array":
      case "vector":
        c.forEach((x) => this.expr(x));
        this.emit(
          n.kind === "array" ? OP.Array : OP.Vector,
          n,
          c.length,
          n.kind === "array" ? n.type.slice(6) : n.type,
        );
        break;
      case "member":
        this.expr(c[0]);
        this.emit(OP.Member, n, 0, n.text);
        if (!reference) this.emit(OP.Read, n);
        break;
      case "index":
        this.expr(c[0]);
        this.expr(c[1]);
        this.emit(OP.Index, n);
        if (!reference) this.emit(OP.Read, n);
        break;
      case "unary":
        this.expr(c[0]);
        this.emit(OP.Unary, n, 0, n.text);
        break;
      case "binary":
        this.expr(c[0]);
        if (n.text === "&&" || n.text === "||") {
          this.emit(OP.Dup, n);
          const j = this.emit(n.text === "&&" ? OP.JumpFalse : OP.JumpTrue, n);
          this.emit(OP.Pop, n);
          this.expr(c[1]);
          this.patch(j);
        } else {
          this.expr(c[1]);
          this.emit(OP.Binary, n, 0, n.text);
        }
        break;
      case "assign":
        this.expr(c[0], true);
        if (n.text !== "=") {
          this.emit(OP.Dup, n);
          this.emit(OP.Read, n);
        }
        this.expr(c[1]);
        if (n.text !== "=") this.emit(OP.Binary, n, 0, n.text[0]);
        this.emit(OP.Store, n);
        break;
      case "increment":
        this.expr(c[0],true);this.emit(OP.Unary,n,0,n.text);break;
      case "new":
        c.forEach((x) => this.expr(x));
        if(c.length < this.a.classes[n.text].fields.length)this.emit(OP.Call,n,c.length,`$new:${n.text}:${c.length}`);
        else this.emit(OP.New, n, c.length, n.text);
        break;
      case "call": {
        const callee = c[0];
        if (
          callee.kind === "member" &&
          callee.children[0].type !== "namespace"
        ) {
          this.expr(callee.children[0]);
          c.slice(1).forEach((x) => this.expr(x));
          this.emit(OP.Method, n, c.length - 1, callee.text);
        } else {
          const name =
            callee.kind === "member"
              ? callee.children[0].text + "." + callee.text
              : callee.text;
          for (const arg of c.slice(1))
            if (name === "dekhar" && arg.kind === "name")
              this.push(arg, arg.text);
            else this.expr(arg);
          this.call(n, name, c.length - 1);
        }
        break;
      }
    }
  }
  block(n, scope = true) {
    if (scope) this.enter(n);
    n.children.forEach((x) => this.statement(x));
    if (scope) this.leave(n);
  }
  finishControl(end, step = -1) {
    const ctrl = this.controls.pop();
    ctrl.breaks.forEach((j) => this.patch(j, end));
    ctrl.continues.forEach((j) => this.patch(j, step));
  }
  handler(body) {
    const name = "$event" + this.unique++,
      f = { name, result: "khali", owner: "", params: [], code: [] },
      old = { code: this.code, depth: this.depth, controls: this.controls };
    this.code = f.code;
    this.depth = 0;
    this.controls = [];
    this.block(body);
    this.push(body, "", 0);
    this.emit(OP.Return, body);
    Object.assign(this, old);
    this.p.functions[name] = f;
    return name;
  }
  statement(n) {
    const c = n.children;
    switch (n.kind) {
      case "program":
        c.forEach((x) => this.statement(x));
        break;
      case "block":
        this.block(n);
        break;
      case "var":
        if (c.length) this.expr(c[0]);
        else {
          this.push(n, n.type);
          this.call(n, "$default", 1);
        }
        this.declare(n, n.text, n.type, n.fixed);
        if (n.currency) {
          this.push(n, n.text);
          this.call(n, "$wallet", 1);
          this.emit(OP.Pop, n);
        }
        break;
      case "expression":
        this.expr(c[0]);
        this.emit(OP.Pop, n);
        break;
      case "print":
        this.expr(c[0]);
        this.emit(OP.Print, n);
        break;
      case "if": {
        this.expr(c[0]);
        const j = this.emit(OP.JumpFalse, n);
        this.statement(c[1]);
        if (c[2]) {
          const end = this.emit(OP.Jump, n);
          this.patch(j);
          this.statement(c[2]);
          this.patch(end);
        } else this.patch(j);
        break;
      }
      case "while": {
        const start = this.code.length;
        this.expr(c[0]);
        const end = this.emit(OP.JumpFalse, n);
        this.controls.push({
          breaks: [],
          continues: [],
          depth: this.depth,
          loop: true,
        });
        this.statement(c[1]);
        this.emit(OP.Jump, n, start);
        this.patch(end);
        this.finishControl(this.code.length, start);
        break;
      }
      case "for": {
        this.enter(n);
        if (c[0].kind === "var") this.statement(c[0]);
        else {
          this.expr(c[0]);
          this.emit(OP.Pop, n);
        }
        const start = this.code.length;
        this.expr(c[1]);
        const end = this.emit(OP.JumpFalse, n);
        this.controls.push({
          breaks: [],
          continues: [],
          depth: this.depth,
          loop: true,
        });
        this.statement(c[3]);
        const step = this.code.length;
        this.expr(c[2]);
        this.emit(OP.Pop, n);
        this.emit(OP.Jump, n, start);
        this.patch(end);
        this.finishControl(this.code.length, step);
        this.leave(n);
        break;
      }
      case "foreach": {
        this.enter(n);
        const id = this.unique++,
          array = "$array" + id,
          index = "$index" + id;
        this.expr(c[0]);
        this.declare(n, array, c[0].type);
        this.push(n, "0", 1);
        this.declare(n, index, "adad");
        const start = this.code.length;
        this.load(n, index);
        this.load(n, array);
        this.emit(OP.Member, n, 0, "lambai");
        this.emit(OP.Binary, n, 0, "<");
        const end = this.emit(OP.JumpFalse, n);
        this.controls.push({
          breaks: [],
          continues: [],
          depth: this.depth,
          loop: true,
        });
        this.enter(n);
        this.load(n, array);
        this.load(n, index);
        this.emit(OP.Index, n);
        this.declare(n, n.text, c[0].type.slice(6));
        this.statement(c[1]);
        this.leave(n);
        const step = this.code.length;
        this.load(n, index);
        this.emit(OP.Dup, n);
        this.push(n, "1", 1);
        this.emit(OP.Binary, n, 0, "+");
        this.emit(OP.Store, n);
        this.emit(OP.Pop, n);
        this.emit(OP.Jump, n, start);
        this.patch(end);
        this.finishControl(this.code.length, step);
        this.leave(n);
        break;
      }
      case "break":
      case "continue": {
        let i = this.controls.length - 1;
        if (n.kind === "continue") while (i >= 0 && !this.controls[i].loop) i--;
        this.emit(OP.Unwind, n, this.depth - this.controls[i].depth);
        this.controls[i][n.kind === "break" ? "breaks" : "continues"].push(
          this.emit(OP.Jump, n),
        );
        break;
      }
      case "return":
        if (c.length) this.expr(c[0]);
        else this.push(n, "", 0);
        this.emit(OP.Return, n);
        break;
      case "try": {
        const tr = this.emit(OP.Try, n, 0, n.text);
        this.statement(c[0]);
        this.emit(OP.EndTry, n);
        const end = this.emit(OP.Jump, n);
        this.patch(tr);
        this.enter(n);
        this.declare(n, n.text, "lafz");
        this.statement(c[1]);
        this.leave(n);
        this.patch(end);
        break;
      }
      case "switch": {
        this.enter(n);
        const id = "$switch" + this.unique++;
        this.expr(c[0]);
        this.declare(n, id, c[0].type);
        this.controls.push({
          breaks: [],
          continues: [],
          depth: this.depth,
          loop: false,
        });
        const ends = [];
        let def;
        for (const arm of c.slice(1)) {
          if (arm.kind === "default") {
            def = arm.children[0];
            continue;
          }
          this.load(n, id);
          this.expr(arm.children[0]);
          this.emit(OP.Binary, n, 0, "==");
          const next = this.emit(OP.JumpFalse, n);
          this.statement(arm.children[1]);
          ends.push(this.emit(OP.Jump, n));
          this.patch(next);
        }
        if (def) this.statement(def);
        ends.forEach((j) => this.patch(j));
        this.finishControl(this.code.length);
        this.leave(n);
        break;
      }
      case "game":
        this.p.title = n.text;
        this.push(n, n.text);
        this.push(n, n.type, 1);
        this.call(n, "$game", 2);
        this.emit(OP.Pop, n);
        this.block(c[0], false);
        break;
      case "scene": {
        const old = this.scene;
        this.scene = n.text;
        this.push(n, n.text);
        this.call(n, "$scene", 1);
        this.emit(OP.Pop, n);
        this.block(c[0], false);
        this.scene = old;
        break;
      }
      case "actor":
      case "mesh": {
        let count = 0;
        for (const p of c) {
          if (p.text === "harkat") {
            this.push(p, "anim_" + p.children[0].text);
            p.children.slice(1).forEach((x) => this.expr(x));
            this.emit(OP.Vector, p, 3, "vec3");
            count++;
            continue;
          }
          this.push(p, p.text);
          this.expr(p.children[0]);
          count++;
          if (p.text === "tasveer" && p.children.length === 3) {
            this.push(p, "width");
            this.expr(p.children[1]);
            this.push(p, "height");
            this.expr(p.children[2]);
            count += 2;
          }
        }
        this.push(n, "__scene");
        this.push(n, this.scene);
        this.emit(
          OP.Entity,
          n,
          count + 1,
          n.text + "\x1f" + (n.kind === "mesh" ? "3" : "2"),
        );
        break;
      }
      case "config":
        for (const p of c) {
          this.push(p, p.text);
          this.expr(p.children[0]);
        }
        this.call(n, "$" + n.text, c.length * 2);
        this.emit(OP.Pop, n);
        break;
      case "window":
      case "background":
      case "audio":
        c.forEach((x) => this.expr(x));
        this.call(n, n.text, c.length);
        this.emit(OP.Pop, n);
        break;
      case "timer":
      case "event": {
        const fn = this.handler(c.at(-1));
        for (const arg of c.slice(0, -1))
          if (["takkar", "takkar3d"].includes(n.text) && arg.kind === "name")
            this.push(arg, arg.text);
          else this.expr(arg);
        this.emit(
          OP.Bind,
          n,
          c.length - 1,
          (n.kind === "timer" ? "timer" : n.text) +
            "\x1f" +
            fn +
            "\x1f" +
            this.scene,
        );
        break;
      }
      case "tilemap":
        this.expr(c[0]);
        this.declare(n, n.text, c[0].type);
        this.push(n, n.text);
        this.load(n, n.text);
        this.call(n, "$tilemap", 2);
        this.emit(OP.Pop, n);
        break;
      case "shop":
        this.expr(c[0]);
        for (const item of c.slice(1)) {
          const body = { ...item, kind: "block", children: [item.children[2]] },
            fn = this.handler(body);
          this.expr(item.children[0]);
          this.expr(item.children[1]);
          this.push(n, fn);
        }
        this.call(n, "$shop", 1 + (c.length - 1) * 3);
        this.emit(OP.Pop, n);
        break;
      case "level":
        this.expr(c[0]);
        this.emit(
          OP.Bind,
          n,
          1,
          "level\x1f" + this.handler(c[1]) + "\x1f" + this.scene,
        );
        break;
    }
  }
  generate(root) {
    this.statement(root);
    this.emit(OP.Halt, root);
    for (const [name, cls] of Object.entries(this.a.classes))
      this.p.classes[name] = cls.fields.map((f) => [f.type, f.text]);
    const fn = (node, owner = "") => {
      const name = owner ? owner + "." + node.text : node.text,
        f = { name, result: node.type, owner, params: node.params, code: [] };
      this.code = f.code;
      this.depth = 0;
      this.controls = [];
      this.block(node.children[0]);
      this.push(node, "", 0);
      this.emit(OP.Return, node);
      this.p.functions[name] = f;
    };
    Object.values(this.a.functions).forEach((f) => fn(f));
    for (const [name, cls] of Object.entries(this.a.classes))
      cls.methods.forEach((f) => fn(f, name));
    const factories=new Map();
    walk(root,node=>{if(node.kind==="new" && node.children.length<this.a.classes[node.text].fields.length)factories.set(`$new:${node.text}:${node.children.length}`,node);});
    for(const [name,node] of factories) {
      const fields=this.a.classes[node.text].fields,count=node.children.length;
      const f={name,result:node.text,owner:"",params:fields.slice(0,count).map(x=>[x.type,x.text]),code:[]};
      this.code=f.code;this.depth=0;this.controls=[];
      for(const field of fields.slice(count))this.statement(field);
      for(const field of fields){this.load(field,field.text);this.emit(OP.Read,field);}
      this.emit(OP.New,node,fields.length,node.text);this.emit(OP.Return,node);
      this.p.functions[name]=f;
    }
    return this.p;
  }
}
const V3=compilerV3(Analyzer,Generator,OP,compatible,primitive);
export function disassemble(program) {
  const names = Object.keys(OP),
    lines = [];
  const add = (name, code) => {
    lines.push(`\n[${name}]`);
    code.forEach((i, index) =>
      lines.push(
        `${String(index).padStart(5)}  ${names[i.op].padEnd(12)} ${i.a}  ${i.text.replaceAll("\x1f", "|")}  ; ${i.at.file}:${i.at.line}`,
      ),
    );
  };
  add("main", program.code);
  Object.entries(program.functions).forEach(([name, f]) => add(name, f.code));
  return lines.join("\n");
}
export async function compile(files, entry, onStage = () => {}, {trace = false} = {}) {
  const map = new Map(files.map((f) => [normalizePath(f.path), f])),
    stages = STAGES.map(([name, help]) => ({
      name,
      help,
      state: "pending",
      ms: 0,
      detail: "",
    }));
  const result = {
    ok: false,
    stages,
    tokens: [],
    ast: null,
    analysis: null,
    program: null,
    diagnostics: [],
    trace: [],
  };
  let current = 0;
  const stage = async (index, fn, detail) => {
    current = index;
    stages[index].state = "running";
    onStage(index, { ...stages[index] });
    const start = performance.now();
    const value = await fn();
    stages[index].ms = performance.now() - start;
    stages[index].state = "passed";
    stages[index].detail = detail(value);
    if (trace) result.trace[index] = captureEvidence(index, value, {astText,disassemble});
    onStage(index, { ...stages[index] });
    return value;
  };
  try {
    const file = map.get(normalizePath(entry));
    if (!file || typeof file.text !== "string")
      throw new Diagnostic(
        "FILE-01",
        0,
        { file: entry, line: 1, col: 1 },
        "Open a .jimsabz source file first.",
      );
    result.tokens = await stage(
      0,
      () => lex(file.text, entry),
      (t) => `${t.length - 1} tokens recognized`,
    );
    let tree = await stage(
      1,
      () => new Parser(result.tokens).parse(),
      () => "Grammar and matching brackets are valid",
    );
    const loaded = new Set(),
      visiting = new Set([entry]);
    const expand = (root, path) => {
      const children = [];
      for (const node of root.children) {
        if (node.kind === "import" && node.text.includes(".")) {
          let resolved;
          try {
            resolved = resolveModule(path, node.text);
          } catch (e) {
            throw new Diagnostic("SEM-01", 3, node.at, e.message);
          }
          if (visiting.has(resolved))
            throw new Diagnostic(
              "SEM-01",
              3,
              node.at,
              "Circular module import.",
            );
          if (loaded.has(resolved)) continue;
          const imported = map.get(resolved);
          if (!imported || typeof imported.text !== "string")
            throw new Diagnostic(
              "SEM-01",
              3,
              node.at,
              `Cannot find '${node.text}' inside this folder.`,
            );
          const tokens = lex(imported.text, resolved);
          result.tokens.push(...tokens.slice(0, -1));
          const parsed = new Parser(tokens).parse();
          visiting.add(resolved);
          expand(parsed, resolved);
          visiting.delete(resolved);
          loaded.add(resolved);
          children.push(...parsed.children);
        } else children.push(node);
      }
      root.children = children;
    };
    let count = 0;
    result.ast = await stage(
      2,
      () => {
        expand(tree, entry);
        walk(tree, (node) => {
          node.id = ++count;
        });
        return tree;
      },
      () => `${count} AST nodes; ${loaded.size} imported modules`,
    );
    result.analysis = await stage(
      3,
      () => new V3.Analyzer().analyze(result.ast),
      (a) =>
        `${semanticSymbolCount(a)} symbols checked; types and imports are valid`,
    );
    result.program = await stage(
      4,
      () => new V3.Generator(result.analysis).generate(result.ast),
      (p) =>
        `${p.code.length} main instructions; ${Object.keys(p.functions).length} functions and events`,
    );
    await stage(
      5,
      () => {
        const assets = new Set(),
          warnings = [];
        walk(result.ast, (node) => {
          const image = node.kind === "property" && node.text === "tasveer",
            mesh = node.kind === "property" && node.text === "shakal3d",
            audio =
              node.kind === "audio" && ["dhun", "wajai"].includes(node.text);
          if (!(image || mesh || audio) || node.children[0]?.kind !== "string")
            return;
          let path;
          try {
            path = normalizePath(node.children[0].text);
          } catch (e) {
            throw new Diagnostic("ASSET-01", 5, node.at, e.message);
          }
          const asset = map.get(path);
          if (!asset) {
            if (audio) {
              warnings.push(`Synthesized sound: ${path}`);
              return;
            }
            throw new Diagnostic(
              "ASSET-01",
              5,
              node.at,
              `Add '${path}' to this folder before running.`,
            );
          }
          if (mesh && !/\.obj$/i.test(path))
            throw new Diagnostic(
              "ASSET-02",
              5,
              node.at,
              "3D model files use the .obj format.",
            );
          assets.add(path);
        });
        result.program.assets = [...assets];
        return { assets, warnings };
      },
      (v) =>
        `${v.assets.size} user assets checked${v.warnings.length ? "\n" + v.warnings.join("\n") : ""}`,
    );
    stages[6].state = "ready";
    stages[6].detail = "Ready to execute the compiled program.";
    onStage(6, { ...stages[6] });
    result.ok = true;
  } catch (error) {
    const fault =
      error instanceof Diagnostic
        ? error
        : new Diagnostic(
            "BUILD-01",
            current,
            { file: entry, line: 1, col: 1 },
            error.message,
          );
    result.diagnostics = [fault.toJSON()];
    for (let i = 0; i < fault.stage; i++)
      if (stages[i].state === "running") stages[i].state = "passed";
    stages[fault.stage] = {
      ...stages[fault.stage],
      state: "failed",
      detail: fault.describe(),
    };
    for (let i = fault.stage + 1; i < 7; i++) stages[i].state = "blocked";
    onStage(fault.stage, { ...stages[fault.stage] });
  }
  return result;
}
export { astText };
