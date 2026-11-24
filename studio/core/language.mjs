// Jimsabz browser compiler. No eval(), JavaScript translation, or recorded traces.
import { sindhiNumber } from "./sindhi-numbers.mjs";
export class Diagnostic extends Error {
  constructor(code, stage, at, message) {
    super(message);
    this.name = "Diagnostic";
    this.code = code;
    this.stage = stage;
    this.at = at || { file: "main.jimsabz", line: 1, col: 1 };
  }
  describe() {
    return `${this.at.file}:${this.at.line}:${this.at.col} [${this.code}] ${this.message}`;
  }
  toJSON() {
    return {
      code: this.code,
      stage: this.stage,
      at: this.at,
      message: this.message,
    };
  }
}
const aliases = {
  barabar: "==",
  na_barabar: "!=",
  wado: ">",
  nandho: "<",
  wado_barabar: ">=",
  nandho_barabar: "<=",
  ain: "&&",
  ya: "||",
  naheen: "!",
  جي: "jey",
  ڪردار: "kirdar",
  ها: "ha",
  نه: "na",
  عدد: "adad",
  لفظ: "lafz",
  ڪم: "kam",
  واپس: "wapas",
  ٻڌاءِ: "budhai",
  ٻڌ: "budh",
};
const wordStart = (c) => !!c && /[\p{L}_]/u.test(c),
  wordPart = (c) => !!c && /[\p{L}\p{M}\p{N}_]/u.test(c),
  digit = (c) => !!c && /[0-9]/.test(c);
export function lex(source, file = "main.jimsabz") {
  source = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (source.length > 2_000_000)
    throw new Diagnostic(
      "LEX-03",
      0,
      { file, line: 1, col: 1 },
      "This file is too large. Split it into smaller .jimsabz modules.",
    );
  const tokens = [];
  let p = 0,
    line = 1,
    col = 1;
  const at = () => ({ file, line, col }),
    peek = (n = 0) => source[p + n] || "",
    step = () => {
      const c = source[p++];
      if (c === "\n") {
        line++;
        col = 1;
      } else col++;
      return c;
    };
  const add = (kind, text, span) => tokens.push({ kind, text, at: span });
  while (p < source.length) {
    const span = at(),
      c = peek();
    if (c === " " || c === "\t") {
      step();
      continue;
    }
    if (c === "\n") {
      step();
      add("nl", "\n", span);
      continue;
    }
    if (c === "/" && peek(1) === "/") {
      while (peek() && peek() !== "\n") step();
      continue;
    }
    if (c === "/" && peek(1) === "*") {
      step();
      step();
      let done = false;
      while (peek()) {
        if (peek() === "*" && peek(1) === "/") {
          step();
          step();
          done = true;
          break;
        }
        const here = at();
        if (step() === "\n") add("nl", "\n", here);
      }
      if (!done)
        throw new Diagnostic("LEX-01", 0, span, "Unclosed comment. Add */.");
      continue;
    }
    if (c === '"') {
      step();
      let text = "",
        done = false;
      while (peek()) {
        let ch = step();
        if (ch === '"') {
          done = true;
          break;
        }
        if (ch === "\n")
          throw new Diagnostic(
            "LEX-01",
            0,
            span,
            "String crosses a line. Use \\n inside the quotes.",
          );
        if (ch === "\\") {
          const e = step(),
            esc = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" };
          if (!(e in esc))
            throw new Diagnostic("LEX-02", 0, span, "Unknown string escape.");
          ch = esc[e];
        }
        text += ch;
      }
      if (!done)
        throw new Diagnostic("LEX-01", 0, span, "Add a closing double quote.");
      add("string", text, span);
      continue;
    }
    if (digit(c) || (c === "." && digit(peek(1)))) {
      let value = "",
        decimal = false;
      while (digit(peek())) value += step();
      if (peek() === "." && peek(1) !== ".") {
        decimal = true;
        value += step();
        while (digit(peek())) value += step();
      }
      if (peek() === "e" || peek() === "E") {
        decimal = true;
        value += step();
        if (peek() === "+" || peek() === "-") value += step();
        if (!digit(peek()))
          throw new Diagnostic(
            "LEX-02",
            0,
            span,
            "Expected a number after the exponent.",
          );
        while (digit(peek())) value += step();
      }
      if (
        decimal
          ? !Number.isFinite(Number(value))
          : BigInt(value) > 9223372036854775807n
      )
        throw new Diagnostic(
          "LEX-02",
          0,
          span,
          "Number is outside the supported range.",
        );
      add(decimal ? "dec" : "int", value, span);
      continue;
    }
    if (wordStart(c)) {
      let value = "";
      while (wordPart(peek())) value += step();
      value = aliases[value] || value;
      if (value.startsWith("adad_")) {
        const number = sindhiNumber(value.slice(5));
        if (number === null) throw new Diagnostic("LEX-02", 0, span, "Unknown Sindhi number word. Use adad_satt, adad_hik_sau_satt, adad_hazar, or ordinary digits.");
        add("int", String(number), span);
        continue;
      }
      add(/^[=!<>|&]+$/.test(value) ? "symbol" : "word", value, span);
      continue;
    }
    if (c === "#") {
      let value = step();
      while (peek() && /[0-9a-f]/i.test(peek())) value += step();
      if (value.length !== 7 && value.length !== 9)
        throw new Diagnostic(
          "LEX-02",
          0,
          span,
          "A color uses #RRGGBB or #AARRGGBB.",
        );
      add("string", value, span);
      continue;
    }
    if(c+peek(1)+peek(2)==="..."){step();step();step();add("symbol","...",span);continue;}
    if(c==="@"&&!wordStart(peek(1)))throw new Diagnostic("LEX-02",0,span,"An attribute needs a name immediately after @.");
    const two = c + peek(1);
    if (
      [
        "==",
        "!=",
        ">=",
        "<=",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "++",
        "--",
        "&&",
        "||",
        "->",
        "..", "=>", "::", "??",
      ].includes(two)
    ) {
      step();
      step();
      add("symbol", two, span);
      continue;
    }
    if ("{}()[],:;.+-*/%!=<>@?".includes(c)) {
      add("symbol", step(), span);
      continue;
    }
    throw new Diagnostic(
      "LEX-02",
      0,
      span,
      c === "&"
        ? "Use && or ain instead of a single &."
        : `Unexpected character '${c}'.`,
    );
  }
  add("end", "", at());
  return tokens;
}
const n = (kind, t, text = "", children = []) => ({
  kind,
  text,
  type: "",
  at: { ...t.at },
  children,
  params: [],
  fixed: false, defaults: [], generics: [], constraints: {}, bases: [], attrs: [], typeArgs: [], fnid: "",
});
const statementWords = new Set(
  "budha budhai budh jey na_ta wori gin rok agty wapas azmai pakar chundo halat aam khed khed3d manzar kirdar mujassamo roshni camera3d khirki pichaan dhun wajai awaz har takkar takkar3d on_key on_click naqsho dukaan shay marhalo kharna acha kam qism".split(
    " ",
  ),
);
export class Parser {
  constructor(tokens) {
    this.t = tokens;
    this.p = 0;
    this.depth = 0;this.anonymous=0;
    this.types = new Set(["adad", "dec", "lafz", "isharo", "qatar", "khazano", "Map", "Set", "Task", "Collections", "Core"]);
    tokens.forEach((t, i) => {
      if (t.text === "qism" && tokens[i + 1])
        this.types.add(tokens[i + 1].text);
    });
  }
  cur(k = 0) {
    return this.t[Math.min(this.p + k, this.t.length - 1)];
  }
  is(s) {
    return this.cur().kind !== "string" && this.cur().text === s;
  }
  match(s) {
    if (this.is(s)) {
      this.p++;
      return true;
    }
    return false;
  }
  take() {
    return this.t[this.p++];
  }
  fail(message, t = this.cur()) {
    throw new Diagnostic("SYN-01", 1, t.at, message);
  }
  need(s) {
    if (!this.is(s))
      throw new Diagnostic(
        "SYN-02",
        1,
        this.cur().at,
        `Expected '${s}', found ${this.cur().kind === "end" ? "the end of the file" : `'${this.cur().text}'`}.`,
      );
    return this.take();
  }
  word() {
    if (this.cur().kind !== "word") this.fail("Expected a name.");
    return this.take();
  }
  lines() {
    while (this.cur().kind === "nl") this.p++;
  }
  finish() {
    if (this.cur().kind === "nl") {
      this.lines();
      return;
    }
    if (this.cur().kind === "end" || this.is("}")) return;
    this.fail(
      this.is(";")
        ? "End this statement with a new line. Semicolons are only used in gin loop headers."
        : "Start the next statement on a new line.",
    );
  }
  type() {
    if(this.match("kam")){this.need("(");let ts=[];if(!this.is(")"))do{ts.push(this.type());}while(this.match(","));this.need(")");this.need("->");return "kam("+ts.join(",")+")->"+this.type();}
    let type=this.word().text;
    if(type==="qatar"){if(this.match("<")){type+=" "+this.type();this.need(">");}else type+=" "+this.type();}
    else {while(this.match("."))type+="."+this.word().text;type=({"Collections.Map":"Map","Collections.Set":"Set","Core.Task":"Task"})[type]||type;
      if(this.match("<")){let ts=[];do{ts.push(this.type());}while(this.match(","));this.need(">");type+="<"+ts.join(",")+">";}}
    if(this.match("?"))type+="?";return type;
  }
  decl() {
    return (
      (this.is("kam") && this.cur(1).text==="(") || (this.is("badal") && this.cur(1).kind==="word") || this.types.has(this.cur().text) ||
      (this.cur().kind === "word" &&
        this.cur(1).kind === "word" &&
        !statementWords.has(this.cur().text))
    );
  }
  variable(noFinish = false) {
    const t = this.cur(),
      fixed = this.match("pakko"),
      currency = this.match("khazano"),
      type = currency ? "adad" : this.match("badal") ? "auto" : this.type(),
      name = this.word(),
      out = n("var", t, name.text);
    out.type = type;
    out.fixed = fixed;
    out.currency = currency;
    if (this.match("=")) out.children.push(this.expr());
    if (!noFinish) this.finish();
    return out;
  }
  block() {
    if (++this.depth > 150)
      this.fail("Too many nested blocks. Split this code into functions.");
    const out = n("block", this.need("{"));
    this.lines();
    while (!this.is("}")) {
      if (this.cur().kind === "end") this.need("}");
      out.children.push(this.statement());
      this.lines();
    }
    this.need("}");
    this.depth--;
    return out;
  }
  genericParams(out){if(!this.match("<"))return;do{let name=this.word().text;if(out.generics.includes(name))this.fail("Duplicate generic parameter.");out.generics.push(name);if(this.match(":"))out.constraints[name]=this.type();}while(this.match(","));this.need(">");}
  parameters(out){this.need("(");if(!this.is(")"))do{let type=this.type(),rest=this.match("..."),name=this.word().text;out.params.push([type,name]);out.defaults.push(this.match("=")?this.expr():null);if(rest){out.variadic=true;if(!this.is(")"))this.fail("Variadic parameter must be last.");}}while(this.match(","));this.need(")");}
  func() {
    const t=this.need("kam"),out=n("function",t,this.word().text);this.genericParams(out);this.parameters(out);
    out.type=this.match("->")?this.type():"khali";this.lines();if(this.is("{"))out.children=[this.block()];return out;
  }
  conditional() {
    const out = n("if", this.need("jey"));
    this.need("(");
    out.children.push(this.expr());
    this.need(")");
    this.lines();
    out.children.push(this.block());
    this.lines();
    if (this.match("na_ta")) {
      this.lines();
      out.children.push(this.is("jey") ? this.conditional() : this.block());
    }
    return out;
  }
  property() {
    const t = this.word(),
      out = n("property", t, t.text);
    this.match(":");
    if (t.text === "harkat") {
      out.children.push(this.atom());
      this.need(":");
      this.need("frames");
      this.need("(");
      out.children.push(this.expr(2));
      this.need("..");
      out.children.push(this.expr(2));
      this.need(",");
      this.need("fps");
      this.need(":");
      out.children.push(this.expr());
      this.need(")");
    } else if (t.text === "tasveer" && this.cur().kind === "string") {
      const s = this.take();
      out.children.push(n("string", s, s.text));
      if (this.match("(")) {
        this.need("size");
        this.need(":");
        out.children.push(this.expr());
        this.need(",");
        out.children.push(this.expr());
        this.need(")");
      }
    } else out.children.push(this.expr());
    this.finish();
    return out;
  }
  entity(kind) {
    const t = this.take(),
      out = n(kind, t, this.word().text);
    this.need("{");
    this.lines();
    while (!this.is("}")) {
      if (this.cur().kind === "end") this.need("}");
      out.children.push(this.property());
      this.lines();
    }
    this.need("}");
    return out;
  }
  statement() {
    this.lines();
    const t = this.cur();
    if(this.is("@")&&this.cur(1).text!=="await"){let attrs=[];while(this.match("@")){attrs.push(this.word().text);this.lines();}let out=this.statement();out.attrs.push(...attrs);return out;}
    if (this.is("kharna") || this.is("acha")) {
      this.take();
      const item = this.take();
      if (!["word", "string"].includes(item.kind))
        this.fail("Choose a library name or a quoted .jimsabz module.", item);
      const out = n("import", t, item.text);
      this.finish();
      return out;
    }
    if (this.match("qism")) {
      const out = n("class", t, this.word().text);
      this.genericParams(out);if(this.match(":"))do{out.bases.push(this.type());}while(this.match(","));
      this.need("{");
      this.lines();
      while (!this.is("}")) {
        if (this.cur().kind === "end") this.need("}");
        out.children.push(this.statement());
        this.lines();
      }
      this.need("}");
      return out;
    }
    if (this.is("kam") && this.cur(1).text!=="(") return this.func();
    if (this.is("pakko") || this.decl()) return this.variable();
    if (this.is("budhai") || this.is("budha")) {
      this.take();
      this.match("=");
      const out = n("print", t, "", [this.expr()]);
      this.finish();
      return out;
    }
    if (this.is("jey")) return this.conditional();
    if (this.match("wori")) {
      this.need("(");
      const test = this.expr();
      this.need(")");
      this.lines();
      return n("while", t, "", [test, this.block()]);
    }
    if (this.match("gin")) {
      if (this.match("(")) {
        const init = this.is(";") ? n("int",this.cur(),"0") : this.decl() ? this.variable(true) : this.expr();
        this.need(";");
        const test = this.is(";") ? n("bool",this.cur(),"ha") : this.expr();
        this.need(";");
        const step = this.is(")") ? n("int",this.cur(),"0") : this.expr();
        this.need(")");
        this.lines();
        return n("for", t, "", [init, test, step, this.block()]);
      }
      const name = this.word().text;
      this.need("andar");
      const items = this.expr();
      this.lines();
      return n("foreach", t, name, [items, this.block()]);
    }
    if (this.is("rok") || this.is("agty")) {
      this.take();
      this.finish();
      return n(t.text === "rok" ? "break" : "continue", t);
    }
    if (this.match("wapas")) {
      const out = n("return", t);
      if (!["nl", "end"].includes(this.cur().kind) && !this.is("}"))
        out.children.push(this.expr());
      this.finish();
      return out;
    }
    if (this.match("azmai")) {
      this.lines();
      const body = this.block();
      this.lines();
      this.need("pakar");
      this.need("(");
      const name = this.word().text;
      this.need(")");
      this.lines();
      return n("try", t, name, [body, this.block()]);
    }
    if (this.match("chundo")) {
      this.need("(");
      const out = n("switch", t, "", [this.expr()]);
      this.need(")");
      this.need("{");
      this.lines();
      while (!this.is("}")) {
        const c = this.take();
        if (!["halat", "aam"].includes(c.text))
          this.fail("Expected halat or aam.", c);
        const arm = n(c.text === "aam" ? "default" : "case", c);
        if (c.text === "halat") arm.children.push(this.expr());
        this.need(":");
        this.lines();
        const body = n("block", c);
        while (!this.is("halat") && !this.is("aam") && !this.is("}")) {
          if (this.cur().kind === "end") this.need("}");
          body.children.push(this.statement());
          this.lines();
        }
        arm.children.push(body);
        out.children.push(arm);
      }
      this.need("}");
      return out;
    }
    if (this.is("khed") || this.is("khed3d")) {
      this.take();
      const title = this.take();
      if (title.kind !== "string")
        this.fail("Put the game title inside double quotes.", title);
      const out = n("game", t, title.text);
      out.type = t.text === "khed3d" ? "3" : "2";
      this.lines();
      out.children = [this.block()];
      return out;
    }
    if (this.match("manzar")) {
      const name = this.word().text;
      this.lines();
      return n("scene", t, name, [this.block()]);
    }
    if (this.is("kirdar") || this.is("mujassamo"))
      return this.entity(this.is("kirdar") ? "actor" : "mesh");
    if (this.is("camera3d") || this.is("roshni")) {
      this.take();
      const out = n("config", t, t.text);
      this.need("{");
      this.lines();
      while (!this.is("}")) {
        if (this.cur().kind === "end") this.need("}");
        out.children.push(this.property());
      }
      this.need("}");
      return out;
    }
    if (
      this.is("khirki") ||
      this.is("pichaan") ||
      this.is("dhun") ||
      this.is("wajai") ||
      this.is("awaz")
    ) {
      this.take();
      const out = n(
        t.text === "khirki"
          ? "window"
          : t.text === "pichaan"
            ? "background"
            : "audio",
        t,
        t.text,
        [this.expr()],
      );
      if (t.text === "khirki") {
        this.need(",");
        out.children.push(this.expr());
      }
      this.finish();
      return out;
    }
    if (this.match("har")) {
      const interval = this.expr();
      this.need("second");
      this.lines();
      return n("timer", t, "", [interval, this.block()]);
    }
    if (["takkar", "takkar3d", "on_key", "on_click"].some((s) => this.is(s))) {
      this.take();
      const out = n("event", t, t.text);
      this.need("(");
      if (!this.is(")"))
        do {
          out.children.push(this.expr());
        } while (this.match(","));
      this.need(")");
      this.lines();
      out.children.push(this.block());
      return out;
    }
    if (this.match("naqsho")) {
      const name = this.word().text;
      this.need("=");
      const out = n("tilemap", t, name, [this.expr()]);
      this.finish();
      return out;
    }
    if (this.match("dukaan")) {
      const out = n("shop", t);
      this.need("(");
      this.need("key");
      this.need(":");
      out.children.push(this.expr());
      this.need(")");
      this.need("{");
      this.lines();
      while (!this.is("}")) {
        const item = n("item", this.need("shay"), "", [this.atom()]);
        this.need("qeemat");
        item.children.push(this.expr());
        this.need("->");
        item.children.push(this.statement());
        out.children.push(item);
        this.lines();
      }
      this.need("}");
      return out;
    }
    if (this.match("marhalo")) {
      const level = this.expr(),
        out = n("level", t, "", [level]);
      if (this.cur().kind === "string") out.text = this.take().text;
      this.lines();
      out.children.push(this.block());
      return out;
    }
    if (this.is("{")) return this.block();
    const out = n("expression", t, "", [this.expr()]);
    this.finish();
    return out;
  }
  precedence(s) {return ({"=":1,"+=":1,"-=":1,"*=":1,"/=":1,"%=":1,"??":2,"||":3,"&&":4,"==":5,"!=":5,">":6,"<":6,">=":6,"<=":6,"+":7,"-":7,"*":8,"/":8,"%":8})[s]||0;}
  expr(min = 1) {
    if (++this.depth > 180) this.fail("Expression is nested too deeply.");
    let left = this.unary();
    while (this.cur().kind === "symbol") {
      const p = this.precedence(this.cur().text);
      if (!p || p < min) break;
      const op = this.take(),
        right = this.expr(p + (p === 1 || op.text === "??" ? 0 : 1));
      left = n(p === 1 ? "assign" : "binary", op, op.text, [left, right]);
    }
    this.depth--;
    return left;
  }
  unary() {
    if(this.match("@")){const t=this.need("await");return n("await",t,"",[this.unary()]);}
    if (this.is("++") || this.is("--")) {
      if (++this.depth > 180) this.fail("Too many unary operators.");
      const t=this.take(), out=n("increment",t,"pre"+t.text,[this.unary()]);
      this.depth--; return out;
    }
    if (this.is("!") || this.is("-") || this.is("+")) {
      if (++this.depth > 180) this.fail("Too many unary operators.");
      const t = this.take(),
        out = n("unary", t, t.text, [this.unary()]);
      this.depth--;
      return out;
    }
    let out = this.atom();
    while (true) {
      if (this.match(".")) {
        const field = this.word();
        out = n("member", field, field.text, [out]);
      } else if (this.match("[")) {
        out = n("index", this.cur(), "", [out, this.expr()]);
        this.need("]");
      } else if(this.match("::")){this.need("<");do{out.typeArgs.push(this.type());}while(this.match(","));this.need(">");
      } else if (this.match("(")) {
        const call = n("call", out, out.text, [out]);
        this.lines();
        if (!this.is(")"))
          do {
            this.lines();
            if(this.match("..."))call.children.push(n("spread",this.cur(),"",[this.expr()]));
            else if (this.cur().kind === "word" && this.cur(1).text === ":") {
              const name = this.take();
              this.take();
              call.children.push(n("named", name, name.text, [this.expr()]));
            } else call.children.push(this.expr());
            this.lines();
          } while (this.match(","));
        this.need(")");
        out = call;
      } else if (this.is("++") || this.is("--")) {
        const t=this.take();out=n("increment",t,"post"+t.text,[out]);
      } else break;
    }
    return out;
  }
  atom() {
    const t = this.take();
    if (["int", "dec", "string"].includes(t.kind)) return n(t.kind, t, t.text);
    if (t.text === "ha" || t.text === "na") return n("bool", t, t.text);
    if (t.text === "khali") return n("null", t);
    if(t.text==="kam"){const out=n("lambda",t,"$lambda"+this.anonymous++);this.parameters(out);out.type=this.match("->")?this.type():"khali";if(this.match("=>"))out.children=[n("block",t,"",[n("return",t,"",[this.expr()])])];else out.children=[this.block()];return out;}
    if (t.text === "naon") {
      const out = n("new", t, this.type());
      this.need("(");
      if (!this.is(")"))
        do {
          out.children.push(this.expr());
        } while (this.match(","));
      this.need(")");
      return out;
    }
    if (t.text === "(") {
      this.lines();
      const first = this.expr();
      if (this.match(",")) {
        const out = n("vector", t, "", [first]);
        do {
          this.lines();
          out.children.push(this.expr());
        } while (this.match(","));
        this.need(")");
        if (out.children.length > 3)
          this.fail("A vector has two or three components.", t);
        return out;
      }
      this.need(")");
      return first;
    }
    if (t.text === "[") {
      const out = n("array", t);
      this.lines();
      if (!this.is("]"))
        do {
          this.lines();
          out.children.push(this.expr());
          this.lines();
        } while (this.match(","));
      this.need("]");
      return out;
    }
    if (t.kind === "word") return n("name", t, t.text);
    this.fail(
      `Expected a value, found '${t.kind === "end" ? "end of file" : t.text}'.`,
      t,
    );
  }
  parse() {
    const root = n("program", this.cur());
    this.lines();
    while (this.cur().kind !== "end") {
      root.children.push(this.statement());
      this.lines();
    }
    return root;
  }
}
export function walk(root, fn) {
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (depth > 220)
      throw new Diagnostic("SYN-03", 1, node.at, "Code is nested too deeply.");
    fn(node);
    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push([node.children[i], depth + 1]);
  }
}
export function astText(node, indent = 0) {
  let text =
    " ".repeat(indent) +
    node.kind +
    (node.text ? " " + node.text : "") +
    (node.type ? " : " + node.type : "") +
    ` @${node.at.line}\n`;
  for (const child of node.children) text += astText(child, indent + 2);
  return text;
}
export function normalizePath(path) {
  const parts = [];
  for (const p of String(path).replaceAll("\\", "/").split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") {
      if (!parts.length) throw new Error("The path leaves this folder.");
      parts.pop();
    } else parts.push(p);
  }
  return parts.join("/");
}
export function resolveModule(from, path) {
  if (/^[/\\]|^[A-Za-z]:/.test(path))
    throw new Error("Use a relative path inside your folder.");
  return normalizePath(from.split("/").slice(0, -1).concat(path).join("/"));
}
