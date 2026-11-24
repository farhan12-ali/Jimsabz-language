import {runtimeV3} from "./runtime-v3.mjs";
import {nullable,callable} from "./types.mjs";
import { Diagnostic, normalizePath } from "./language.mjs";
import { OP, compatible } from "./compiler.mjs";
import { Writer, Reader } from "./binary.mjs";
import { sindhiWord, sindhiNumber } from "./sindhi-numbers.mjs";
const minInt = -(1n << 63n),
  maxInt = (1n << 63n) - 1n;
export const raw = (v) => (v?.ref ? raw(v.ref.value) : v);
export const integer = (n) => ({ type: "adad", value: BigInt(n) }),
  decimal = (n) => {
    n = Number(n);
    if (!Number.isFinite(n))
      throw new Error("The numeric result is not finite.");
    return { type: "dec", value: n };
  },
  string = (s) => ({ type: "lafz", value: String(s) }),
  bool = (b) => ({ type: "isharo", value: !!b }),
  nil = () => ({ type: "khali", value: null });
export const cell = (value, type = "any", fixed = false) => ({
  value: raw(value),
  type,
  fixed,
});
export function record(type, fields = {}) {
  return {
    type,
    fields: Object.fromEntries(
      Object.entries(fields).map(([name, value]) => [
        name,
        cell(value, raw(value).type),
      ]),
    ),
    fixed: false,
  };
}
export const vector = (x = 0, y = 0, z = undefined) =>
  record(
    z === undefined ? "vec2" : "vec3",
    Object.fromEntries(
      (z === undefined ? [x, y] : [x, y, z]).map((n, i) => [
        "xyz"[i],
        decimal(n),
      ]),
    ),
  );
export function field(v, name, fallback = nil()) {
  v = raw(v);
  return v?.fields?.[name]?.value ?? fallback;
}
export function set(v, name, value, type) {
  v = raw(v);
  if (!v.fields) throw new Error("Expected an object.");
  if (v.fields[name]) v.fields[name].value = raw(value);
  else v.fields[name] = cell(value, type || raw(value).type);
  return v;
}
export function number(v) {
  v = raw(v);
  if (v.type !== "adad" && v.type !== "dec")
    throw new Error("Expected a number.");
  return Number(v.value);
}
export function truth(v) {
  v = raw(v);
  if (v.type !== "isharo") throw new Error("Expected an isharo condition.");
  return v.value;
}
export function format(v, depth = 0) {
  v = raw(v);
  if (depth > 12) return "…";
  if (!v || v.type === "khali") return "khali";
  if(v.callable)return "<kam "+v.callable.name+">";
  if(v.task)return "<Task "+v.task.state+">";
  if(v.entries)return (v.unique?"Set{":"Map{")+[...v.entries.values()].map(([k,x])=>format(k,depth+1)+(v.unique?"":": "+format(x,depth+1))).join(", ")+"}";
  if (v.type === "isharo") return v.value ? "ha" : "na";
  if (v.items)
    return (
      "[" + v.items.map((c) => format(c.value, depth + 1)).join(", ") + "]"
    );
  if (v.fields)
    return (
      v.type +
      "{" +
      Object.entries(v.fields)
        .map(([k, c]) => k + ": " + format(c.value, depth + 1))
        .join(", ") +
      "}"
    );
  if (v.type === "dec") return Number(v.value.toPrecision(12)).toString();
  return String(v.value);
}
export function array(values, type = "any") {
  return {
    type: "qatar " + type,
    elementType: type,
    items: values.map((v) => cell(v, type)),
    fixed: false, version:0,
  };
}
export function defaultValue(type) {
  if(nullable(type))return nil();
  if (type === "adad") return integer(0);
  if (type === "dec") return decimal(0);
  if (type === "lafz") return string("");
  if (type === "isharo") return bool(false);
  if (type.startsWith("qatar ")) return array([], type.slice(6));
  return type === "khali" ? nil() : record(type);
}
export function convert(v, type, at) {
  v = raw(v);
  if(nullable(type))return v.type==="khali"?v:convert(v,type.slice(0,-1),at);
  if(v.parents?.includes(type))return v;
  if (type === "any") return v;
  if (v.type === "input") {
    const text = v.value.trim();
    if (type === "lafz") return string(v.value);
    if (type === "adad" && /^[+-]?\d+$/.test(text)) {
      try {
        const n = BigInt(text);
        if (n >= minInt && n <= maxInt) return integer(n);
      } catch {}
    }
    if (
      type === "dec" &&
      /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) &&
      Number.isFinite(Number(text))
    )
      return decimal(text);
    if (type === "isharo") {
      if (["ha", "true", "1"].includes(text)) return bool(true);
      if (["na", "false", "0"].includes(text)) return bool(false);
    }
    throw new Diagnostic(
      "RUN-01",
      6,
      at,
      `'${v.value}' is not a valid ${type} value.`,
    );
  }
  if (type === "dec" && v.type === "adad") return decimal(v.value);
  if (type.startsWith("qatar ") && v.items) {
    const el = type.slice(6);
    if (el === v.elementType) return v;
    return array(
      v.items.map((c) => convert(c.value, el, at)),
      el,
    );
  }
  if (type === v.type) return v;
  throw new Diagnostic("RUN-01", 6, at, `Cannot store ${v.type} in ${type}.`);
}
function freeze(v, seen = new Set()) {
  v = raw(v);
  if(v.entries){if(seen.has(v))return;seen.add(v);v.fixed=true;for(const[k,x]of v.entries.values()){freeze(k,seen);freeze(x,seen);}return;}
  if (seen.has(v)) return;
  seen.add(v);
  if (v.items || v.fields) {
    v.fixed = true;
    for (const c of v.items || Object.values(v.fields)) {
      c.fixed = true;
      freeze(c.value, seen);
    }
  }
}
class Env {
  constructor(parent = null) {
    this.parent = parent;
    this.values = new Map();
  }
  find(name) {
    return this.values.get(name) || this.parent?.find(name);
  }
}
function checked(n) {
  if (n < minInt || n > maxInt)
    throw new Error("adad arithmetic overflowed its 64-bit range.");
  return integer(n);
}
function binary(l, r, op) {
  l = raw(l);
  r = raw(r);
  if (["vec2", "vec3"].includes(l.type) && ["+", "-", "*", "/"].includes(op)) {
    const out = record(l.type);
    for (const [k, c] of Object.entries(l.fields))
      set(out, k, binary(c.value, r.fields ? field(r, k) : r, op), "dec");
    return out;
  }
  if (op === "+" && l.type === "lafz") return string(l.value + format(r));
  if (op === "==" || op === "!=") {
    let equal =
      l.type === r.type
        ? l.items || l.fields
          ? l === r
          : l.value === r.value
        : ["adad", "dec"].includes(l.type) &&
          ["adad", "dec"].includes(r.type) &&
          number(l) === number(r);
    return bool(op === "==" ? equal : !equal);
  }
  if (op === "&&" || op === "||")
    return bool(op === "&&" ? truth(l) && truth(r) : truth(l) || truth(r));
  if (["<", ">", "<=", ">="].includes(op)) {
    let a, b;
    if (
      (l.type === "lafz" && r.type === "lafz") ||
      (l.type === "adad" && r.type === "adad")
    ) {
      a = l.value;
      b = r.value;
    } else {
      a = number(l);
      b = number(r);
    }
    return bool(
      op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b,
    );
  }
  if (l.type === "adad" && r.type === "adad") {
    const a = l.value,
      b = r.value;
    if ((op === "/" || op === "%") && b === 0n)
      throw new Error("Division by zero.");
    return checked(
      op === "+"
        ? a + b
        : op === "-"
          ? a - b
          : op === "*"
            ? a * b
            : op === "/"
              ? a / b
              : a % b,
    );
  }
  const a = number(l),
    b = number(r);
  if (op === "/" && b === 0) throw new Error("Division by zero.");
  return decimal(
    op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : a / b,
  );
}
export function toPlain(v, depth = 0) {
  v = raw(v);
  if (depth > 20) return null;
  if (v?.items) return v.items.map((c) => toPlain(c.value, depth + 1));
  if (v?.fields)
    return Object.fromEntries(
      Object.entries(v.fields).map(([k, c]) => [
        k,
        toPlain(c.value, depth + 1),
      ]),
    );
  return v?.type === "adad" ? Number(v.value) : (v?.value ?? null);
}
function saveValue(w, v, depth = 0) {
  if (depth > 32) throw new Error("The save is nested too deeply.");
  v = raw(v);
  const kind = v.items
    ? 6
    : v.fields
      ? 7
      : { khali: 0, adad: 1, dec: 2, isharo: 3, lafz: 4, input: 5 }[v.type];
  if (kind === undefined) throw new Error("Unsupported save value.");
  w.u32(kind);
  if (kind > 0 && kind < 6) w.str(format(v));
  if (kind === 6) {
    w.str(v.elementType).u32(v.items.length);
    v.items.forEach((c) => saveValue(w, c.value, depth + 1));
  }
  if (kind === 7) {
    w.str(v.type).u32(Object.keys(v.fields).length);
    for (const [k, c] of Object.entries(v.fields)) {
      w.str(k).str(c.type);
      saveValue(w, c.value, depth + 1);
    }
  }
}
function loadValue(r, depth = 0) {
  if (depth > 32) throw new Error("Invalid nested save.");
  const kind = r.u32();
  if (kind === 0) return nil();
  if (kind === 1) return integer(r.str());
  if (kind === 2) return decimal(r.str());
  if (kind === 3) return bool(r.str() === "ha");
  if (kind === 4 || kind === 5) return string(r.str());
  if (kind === 6) {
    const type = r.str(),
      size = r.u32();
    if (size > 1000000) throw new Error("Save array is too large.");
    const values = [];
    for (let i = 0; i < size; i++)
      values.push(convert(loadValue(r, depth + 1), type));
    return array(values, type);
  }
  if (kind === 7) {
    const value = record(r.str()),
      size = r.u32();
    if (size > 10000) throw new Error("Save object is too large.");
    for (let i = 0; i < size; i++) {
      const name = r.str(),
        type = r.str();
      set(value, name, loadValue(r, depth + 1), type);
    }
    return value;
  }
  throw new Error("Invalid save value.");
}
function restore(current, saved) {
  current = raw(current);
  saved = raw(saved);
  if (current.fields && saved.fields && current.type === saved.type) {
    for (const [name, c] of Object.entries(saved.fields)) {
      if (current.fields[name] && !current.fields[name].fixed)
        current.fields[name].value = restore(
          current.fields[name].value,
          convert(c.value, current.fields[name].type),
        );
    }
    return current;
  }
  return saved;
}
export class VM {
  constructor(program, io = {}, files = []) {
    this.program = program;
    this.io = io;
    this.files = new Map(files.map((f) => [f.path, f]));
    this.globals = new Env();
    this.instructions = 0;
    this.limit = 10_000_000;
    this.depth = 0;this.tasks=[];this.nextTask=1;this.pumping=false;this.activeFrames=[];
    this.world = {
      active: false,
      dimension: 2,
      width: 960,
      height: 600,
      title: "My game",
      background: "#111327",
      actors: [],
      handlers: [],
      particles: [],
      hud: [],
      scene: "",
      camera: nil(),
      light: nil(),
      time: 0,
      over: false,
      won: false,
      message: "",
      paused: false,
    };
  }
  async run() {
    this.globals.values.set("dt", cell(decimal(1 / 60), "dec", true));
    this.globals.values.set("mouse_x", cell(integer(0), "adad", true));
    this.globals.values.set("mouse_y", cell(integer(0), "adad", true));
    return this.execute(this.program.code, this.globals);
  }
  async execute(code,env,name='main'){
    const frame={code,env,name,stack:[],traps:[],pc:0};const out=await this.executeFrame(frame);if(frame.suspended)throw Error('Synchronous frame cannot suspend.');return out;
  }
  async executeFrame(frame) {
    const {code,stack,traps}=frame;let env=frame.env,pc=frame.pc,quantum=0;frame.suspended=false;this.activeFrames.push(frame);
    try {
    const pop = () => {
        if (!stack.length) throw new Error("Invalid bytecode stack.");
        return stack.pop();
      },
      args = (count) => {
        if (count < 0 || count > stack.length)
          throw new Error("Invalid argument stack.");
        return stack.splice(stack.length - count, count).map(raw);
      };
    while (pc < code.length) {
      if(frame.cooperative&&quantum++>=10000){frame.suspended=true;return nil();}
      const ins = code[pc++];frame.env=env;frame.at=ins.at;
      if(this.io.debug)await this.io.debug(ins.at,this.activeFrames.map(f=>{const locals={};for(let e=f.env;e;e=e.parent)for(const[k,c]of e.values)if(!k.startsWith("$")&&!(k in locals))locals[k]=format(c.value);return {function:f.name||"main",at:f.at,locals};}));
      try {
        if (++this.instructions > this.limit)
          throw new Diagnostic(
            "RUN-LIMIT",
            6,
            ins.at,
            "Instruction limit reached. Check for an endless loop.",
          );
        if (stack.length > 1_000_000)
          throw new Diagnostic("RUN-LIMIT", 6, ins.at, "Stack limit reached.");
        switch (ins.op) {
          case OP.Push:
            stack.push(
              ins.a === 1
                ? integer(ins.text)
                : ins.a === 2
                  ? decimal(ins.text)
                  : ins.a === 3
                    ? bool(ins.text === "1")
                    : ins.a === 4
                      ? string(ins.text)
                      : nil(),
            );
            break;
          case OP.Load: {
            const c = env.find(ins.text);
            if (!c) throw new Error(`'${ins.text}' has no value yet.`);
            stack.push({ ref: c });
            break;
          }
          case OP.Read:
            stack.push(raw(pop()));
            break;
          case OP.Declare: {
            const [name, type] = ins.text.split("\x1f");
            if (env.values.has(name)) throw new Error("Duplicate variable.");
            const value = convert(pop(), type, ins.at);
            if (ins.a) freeze(value);
            env.values.set(name, cell(value, type, !!ins.a));
            break;
          }
          case OP.Pop:
            pop();
            break;
          case OP.Dup:
            if (!stack.length)
              throw new Error("Invalid duplicate instruction.");
            stack.push(stack.at(-1));
            break;
          case OP.Member: {
            const v = raw(pop());
            if(v.entries && ["lambai","size"].includes(ins.text)){stack.push(integer(v.entries.size));break;}
            if (v.items && ins.text === "lambai") {
              stack.push(integer(v.items.length));
              break;
            }
            if (!v.fields?.[ins.text])
              throw new Error(`Unknown field '${ins.text}'.`);
            stack.push({ ref: v.fields[ins.text] });
            break;
          }
          case OP.Index: {
            const index = raw(pop()),
              base = raw(pop());
            if (index.type !== "adad" || !base.items)
              throw new Error("Index an array with an adad value.");
            if (index.value < 0n || index.value >= BigInt(base.items.length))
              throw new Error(
                `Array index ${index.value} is outside its ${base.items.length} items.`,
              );
            stack.push({ ref: base.items[Number(index.value)] });
            break;
          }
          case OP.Array:
            stack.push(
              array(
                args(ins.a).map((v) => convert(v, ins.text, ins.at)),
                ins.text,
              ),
            );
            break;
          case OP.Vector: {
            const values = args(ins.a);
            stack.push(vector(...values.map(number)));
            break;
          }
          case OP.Binary: {
            const r = pop(),
              l = pop();
            stack.push(binary(l, r, ins.text));
            break;
          }
          case OP.Unary: {
            if(["pre++","post++","pre--","post--"].includes(ins.text)) {
              const target=pop();
              if(!target.ref||target.ref.fixed)throw new Error("Increment needs a writable numeric value.");
              const before=raw(target.ref.value);
              const next=convert(binary(before,integer(1),ins.text.endsWith("++")?"+":"-"),target.ref.type,ins.at);
              target.ref.value=next;stack.push(ins.text.startsWith("post")?before:next);break;
            }
            const v = raw(pop());
            stack.push(
              ins.text === "!"
                ? bool(!truth(v))
                : ins.text === "-"
                  ? v.type === "adad"
                    ? checked(-v.value)
                    : decimal(-number(v))
                  : v,
            );
            break;
          }
          case OP.Store: {
            const v = raw(pop()),
              target = pop();
            if (!target.ref)
              throw new Error("Expected a writable variable or field.");
            if (target.ref.fixed)
              throw new Error("A pakko value cannot be changed.");
            target.ref.value = convert(v, target.ref.type, ins.at);
            stack.push(target.ref.value);
            break;
          }
          case OP.Enter:
            env = new Env(env);
            break;
          case OP.Leave:
            if (!env.parent) throw new Error("Invalid scope.");
            env = env.parent;
            break;
          case OP.Unwind:
            for (let i = 0; i < ins.a; i++) {
              if (!env.parent) throw new Error("Invalid scope unwind.");
              env = env.parent;
            }
            break;
          case OP.Jump:
            pc = ins.a;
            break;
          case OP.JumpFalse:
            if (!truth(pop())) pc = ins.a;
            break;
          case OP.JumpTrue:
            if (truth(pop())) pc = ins.a;
            break;
          case OP.Call:
            stack.push(await this.invoke(ins.text, args(ins.a), ins.at));
            break;
          case OP.CallNamed: {
            const values=args(ins.a),[name,...labels]=ins.text.split("\x1f");stack.push(await this.invoke(name,values,ins.at,undefined,undefined,labels));break;
          }
          case OP.Invoke:{const values=args(ins.a),callee=pop();stack.push(await this.invokeValue(callee,values,ins.at,ins.text?ins.text.split("\x1f"):[]));break;}
          case OP.Closure:{let name=ins.text,receiver;if(ins.a===2){receiver=raw(pop());name=name.startsWith('$direct:')?name.slice(8):receiver.type+'.'+name;}const f=this.program.functions[name];if(!f)throw Error('Unknown function reference.');const signature=f.signature||'kam('+f.params.map(p=>p[0]).join(',')+')->'+(f.asynchronous?'Task<'+f.result+'>':f.result);stack.push({type:signature,callable:{name,receiver,env:ins.a===1?env:this.globals}});break;}
          case OP.Await:{const value=raw(pop()),t=value.task;if(!t)throw Error('@await requires Task<T>.');t.observed=true;if(t.state==='pending'){if(!frame.cooperative)throw Error('Synchronous frame cannot await.');const seen=new Set();for(let d=t;d?.frame;d=d.frame.waiting){if(seen.has(d)||d.frame===frame)throw Error('Cyclic task dependency.');seen.add(d);}frame.waiting=t;stack.push(value);pc--;frame.suspended=true;return nil();}frame.waiting=null;if(t.error)throw t.error;stack.push(t.result);break;}
          case OP.Method: {const values=args(ins.a),receiver=raw(pop()),[method,...labels]=ins.text.split("\x1f");stack.push(await this.method(receiver,method,values,ins.at,labels));break;}
          case OP.New: {
            const values = args(ins.a),
              fields = this.program.classes[ins.text];
            if (!fields || fields.length !== values.length)
              throw new Error("Invalid object constructor.");
            const object = record(ins.text);object.parents=this.program.parents?.[ins.text]||[];
            fields.forEach(([type, name], i) =>
              set(object, name, convert(values[i], type, ins.at), type),
            );
            stack.push(object);
            break;
          }
          case OP.Return:
            frame.done=true;return stack.length ? raw(pop()) : nil();
          case OP.Print:
            this.io.print?.(format(pop()) + "\n");
            break;
          case OP.Try:
            traps.push({ begin: pc, end: ins.a, env, size: stack.length });
            break;
          case OP.EndTry:
            traps.pop();
            break;
          case OP.Throw:
            throw new Error(format(pop()));
          case OP.Entity: {
            const values = args(ins.a * 2),
              [name, dim] = ins.text.split("\x1f"),
              data = record("@" + name, {
                jagah: vector(),
                jagah3d: vector(0, 0, 0),
                ghumao: vector(0, 0, 0),
                paimano: vector(1, 1, 1),
                width: decimal(40),
                height: decimal(40),
                raftar: decimal(0),
                rang: string("cyan"),
                visible: bool(true),
                vy: decimal(0),
              });
            for (let i = 0; i < values.length; i += 2) {
              const key = format(values[i]),
                type = data.fields[key]?.type || values[i + 1].type;
              set(data, key, convert(values[i + 1], type, ins.at), type);
            }
            const actor = {
              name,
              data,
              mesh: dim === "3",
              spawned: false,
              elapsed: 0,
              age: 0,
            };
            if (field(data, "paida").fields) {
              actor.spawnEvery = number(
                field(field(data, "paida"), "interval"),
              );
              if (actor.spawnEvery <= 0)
                throw new Error("Spawn interval must be positive.");
              set(data, "visible", bool(false));
            }
            this.world.actors.push(actor);
            this.globals.values.set(name, cell(data, "@" + name));
            break;
          }
          case OP.Bind: {
            const [kind, fn, scene] = ins.text.split("\x1f"),
              values = args(ins.a);
            if (kind === "timer" && number(values[0]) <= 0)
              throw new Error("har interval must be positive.");
            this.world.handlers.push({
              kind,
              fn,
              scene,
              args: values,
              elapsed: 0,
            });
            break;
          }
          case OP.Halt:
            frame.done=true;return nil();
          default:
            throw new Error("Unknown bytecode instruction.");
        }
        if (pc < 0 || pc > code.length)
          throw new Error("Invalid bytecode jump.");
        while (
          traps.length &&
          (pc < traps.at(-1).begin || pc >= traps.at(-1).end) &&
          ins.op !== OP.Try
        )
          traps.pop();
      } catch (error) {
        if (error.code === "RUN-LIMIT" || error.code === "RUN-CANCEL")
          throw error;
        const fault =
          error instanceof Diagnostic
            ? error
            : new Diagnostic("RUN-01", 6, ins.at, error.message);
        if (!traps.length) throw fault;
        const trap = traps.pop();
        env = trap.env;
        stack.length = trap.size;
        stack.push(string(fault.describe()));
        pc = trap.end;
      }
    }
    frame.done=true;return nil();
    }finally{frame.env=env;frame.pc=pc;this.activeFrames.pop();}
  }
  async invoke(name, args, at, receiver) {
    const fn = this.program.functions[name];
    if (!fn) return this.builtin(name, args, at);
    if (this.depth >= 256)
      throw new Diagnostic(
        "RUN-LIMIT",
        6,
        at,
        "Function call depth exceeded 256.",
      );
    if (args.length !== fn.params.length)
      throw new Error("Wrong number of function arguments.");
    const env = new Env(this.globals);
    if (receiver?.fields)
      for (const [k, c] of Object.entries(receiver.fields))
        env.values.set(k, c);
    if(receiver?.fields)env.values.set("paan",cell(receiver,receiver.type,true));
    fn.params.forEach(([type, name], i) =>
      env.values.set(name, cell(convert(args[i], type, at), type)),
    );
    this.depth++;
    try {
      const value = await this.execute(fn.code, env);
      return fn.result === "khali" ? nil() : convert(value, fn.result, at);
    } finally {
      this.depth--;
    }
  }
  path(value, at) {
    const text = format(value);
    if (/^[/\\]|^[A-Za-z]:/.test(text))
      throw new Diagnostic(
        "RUN-02",
        6,
        at,
        "Use a path inside your current folder.",
      );
    try {
      return normalizePath(text);
    } catch (error) {
      throw new Diagnostic("RUN-02", 6, at, error.message);
    }
  }
  writeFile(path, file) {
    this.files.set(path, { ...file, path });
    this.io.file?.({ path, ...file });
  }
  async builtin(original, args, at) {
    const name = original.startsWith("hisab.") ? original.slice(6) : original,
      get = (i) => {
        if (!args[i]) throw new Error(`Missing argument for ${name}.`);
        return raw(args[i]);
      },
      num = (i) => number(get(i));
    if (name === "budh") {
      if(this.world.active)throw Error("Console input is unavailable on the game rendering thread.");
      if (args.length) this.io.print?.(format(get(0)));
      if (!this.io.read) throw new Error("No input stream is connected.");
      return { type: "input", value: String(await this.io.read()) };
    }
    if (name === "$default") {
      const type = format(get(0)),
        value = defaultValue(type);
      for (const [fieldType, fieldName] of this.program.classes[type] || [])
        set(value, fieldName, defaultValue(fieldType), fieldType);
      return value;
    }
    if (name === "badal") {
      const value = get(0),
        type = format(get(1));
      if (type === "lafz") return string(format(value));
      if (value.type === "lafz" || value.type === "input")
        return convert({ type: "input", value: value.value }, type, at);
      if (type === "isharo")
        return bool(
          value.type === "isharo" ? value.value : number(value) !== 0,
        );
      if (type === "adad") {
        if (value.type === "adad") return value;
        if (value.type === "isharo") return integer(value.value ? 1 : 0);
        if (!Number.isSafeInteger(Math.trunc(number(value)))) {
          const n = number(value);
          if (n < -9223372036854775808 || n >= 9223372036854775808)
            throw new Error("The value exceeds adad range.");
        }
        return checked(BigInt(Math.trunc(number(value))));
      }
      if (type === "dec")
        return decimal(
          value.type === "isharo" ? (value.value ? 1 : 0) : number(value),
        );
      throw new Error("Unknown cast type.");
    }
    if (name === "lambai") {
      const value = get(0);
      if (value.items) return integer(value.items.length);
      if (value.type === "lafz") return integer([...value.value].length);
      throw new Error("lambai expects a string or array.");
    }
    if (name === "sindhi_lafz") return string(sindhiWord(number(get(0))));
    if (name === "sindhi_adad") {
      const value = sindhiNumber(format(get(0)));
      if (value === null) throw new Error("Unknown Sindhi number. Use a word from 0 through 1000, such as satt or hik sau satt.");
      return integer(value);
    }
    if (name === "sqrt" || name === "sin" || name === "cos")
      return decimal(Math[name](num(0)));
    if (name === "abs") {
      const value = get(0);
      return value.type === "adad"
        ? checked(value.value < 0n ? -value.value : value.value)
        : decimal(Math.abs(number(value)));
    }
    if (name === "floor" || name === "round")
      return checked(BigInt(name==="round"&&num(0)<0?-Math.round(-num(0)):Math[name](num(0))));
    if (name === "min" || name === "max") {
      const a = get(0),
        b = get(1);
      if (a.type === "adad" && b.type === "adad")
        return integer(
          name === "min"
            ? a.value < b.value
              ? a.value
              : b.value
            : a.value > b.value
              ? a.value
              : b.value,
        );
      return decimal(Math[name](number(a), number(b)));
    }
    if (name === "bina_tarteeb") {
      const a = get(0),
        b = get(1);
      if (number(a) > number(b))
        throw new Error("Random lower bound exceeds upper bound.");
      return a.type === "adad" && b.type === "adad"
        ? integer(
            Math.floor(number(a) + Math.random() * (number(b) - number(a) + 1)),
          )
        : decimal(number(a) + Math.random() * (number(b) - number(a)));
    }
    if (name === "assert") {
      if (!truth(get(0)))
        throw new Error(args[1] ? format(args[1]) : "Assertion failed.");
      return nil();
    }
    if (name === "uthao") throw new Error(format(get(0)));
    if (name === "waqt")
      return decimal(
        this.world.active ? this.world.time : performance.now() / 1000,
      );
    if (name === "likh") {
      const path = this.path(get(0), at);
      this.writeFile(path, { kind: "text", text: format(get(1)) });
      return nil();
    }
    if (name === "parh") {
      const path = this.path(get(0), at),
        file = this.files.get(path);
      if (!file) throw new Error(`Cannot read '${path}'.`);
      return string(file.text ?? new TextDecoder().decode(file.bytes));
    }
    if (name === "mahfooz") {
      const path = this.path(get(0), at),
        w = new Writer().bytes("JIMSAVE2");
      w.u32(this.globals.values.size);
      for (const [key, c] of this.globals.values) {
        w.str(key);
        saveValue(w, c.value);
      }
      this.writeFile(path, { kind: "binary", bytes: w.finish() });
      return nil();
    }
    if (name === "wapas_lao") {
      const path = this.path(get(0), at),
        file = this.files.get(path);
      if (!file?.bytes) throw new Error("Save file not found.");
      const bytes = file.bytes;
      if (new TextDecoder().decode(bytes.slice(0, 8)) !== "JIMSAVE2")
        throw new Error("Invalid save file.");
      const reader = new Reader(bytes);
      reader.p = 8;
      const count = reader.u32();
      if (count > 100000) throw new Error("Invalid save data.");
      const loaded = [];
      for (let i = 0; i < count; i++) {
        const key = reader.str(),
          value = loadValue(reader),
          target = this.globals.find(key);
        if (target && !target.fixed)
          loaded.push([target, convert(value, target.type, at)]);
      }
      for (const [target, value] of loaded)
        target.value = restore(target.value, value);
      return nil();
    }
    if (name === "$game") {
      Object.assign(this.world, {
        active: true,
        title: format(get(0)),
        dimension: num(1),
      });
      return nil();
    }
    if (name === "khirki") {
      const width = num(0),
        height = num(1);
      if (width < 160 || height < 120 || width > 3840 || height > 2160)
        throw new Error("Window size must be between 160×120 and 3840×2160.");
      this.world.width = width;
      this.world.height = height;
      return nil();
    }
    if (name === "pichaan") {
      this.world.background = format(get(0));
      return nil();
    }
    if (name === "dekhar") {
      this.world.hud.push(...args.map((v) => format(v)));
      return nil();
    }
    if (name === "$camera3d" || name === "$roshni") {
      const config = record(name.slice(1));
      for (let i = 0; i < args.length; i += 2)
        set(config, format(args[i]), args[i + 1]);
      this.world[name === "$roshni" ? "light" : "camera"] = config;
      return nil();
    }
    if (name === "camera.follow") {
      if (!this.world.camera.fields) this.world.camera = record("camera");
      set(this.world.camera, "follow", get(0));
      return nil();
    }
    if (name === "$scene") {
      if (!this.world.scene) this.world.scene = format(get(0));
      return nil();
    }
    if (name === "tabdeel_manzar") {
      this.world.scene = format(get(0));
      return nil();
    }
    if (name === "$tilemap") {
      this.globals.values.set("$tilemap:" + format(get(0)), cell(get(1)));
      return nil();
    }
    if (name === "random_top") {
      if (num(0) <= 0) throw new Error("Spawn interval must be positive.");
      return record("spawn", { interval: decimal(num(0)) });
    }
    if (name === "patrol" || name === "chase") {
      const value = record("behavior", { kind: string(name) });
      args.forEach((arg, i) => set(value, "arg" + i, arg));
      return value;
    }
    if (name === "jeet" || name === "haar") {
      this.world.over = true;
      this.world.won = name === "jeet";
      this.world.message = args[0]
        ? format(args[0])
        : this.world.won
          ? "You won!"
          : "Game over";
      return nil();
    }
    if (name === "dhun" || name === "wajai") {
      this.io.sound?.({ name: format(get(0)), loop: name === "dhun" });
      return nil();
    }
    if (name === "awaz") {
      if (num(0) < 0 || num(0) > 100)
        throw new Error("Volume must be between 0 and 100.");
      this.io.sound?.({ volume: num(0) });
      return nil();
    }
    if (name === "chup") {
      this.io.sound?.({ mute: true });
      return nil();
    }
    if (name === "khatam") {
      set(get(0), "visible", bool(false));
      return nil();
    }
    if (name === "chalao") {
      const value = get(0),
        animation = format(get(1));
      if (!field(value, "anim_" + animation).fields)
        throw new Error("Unknown animation.");
      set(value, "forced_animation", string(animation));
      set(value, "animation_time", decimal(0));
      return nil();
    }
    if (name === "paida") {
      const source = get(0);
      if (!source.fields) throw new Error("paida expects an actor.");
      if (this.world.actors.length > 3000)
        throw new Error("Entity pool limit reached.");
      const data = record(source.type);
      for (const [key, c] of Object.entries(source.fields)) {
        let value = c.value;
        if (["vec2", "vec3"].includes(value.type)) {
          const copy = record(value.type);
          for (const [k, f] of Object.entries(value.fields))
            set(copy, k, f.value, f.type);
          value = copy;
        }
        set(data, key, value, c.type);
      }
      set(data, "visible", bool(true));
      if (args[1])
        set(data, this.world.dimension === 3 ? "jagah3d" : "jagah", get(1));
      this.world.actors.push({
        name: source.type.slice(1),
        data,
        mesh: this.world.dimension === 3,
        spawned: true,
        elapsed: 0,
        age: 0,
      });
      return data;
    }
    if (name === "chining") {
      const p = args[1] ? toPlain(args[1]) : { x: 0, y: 0, z: 0 },
        count = Math.min(2000, args[2] ? num(2) : 20);
      for (let i = 0; i < count && this.world.particles.length < 5000; i++) {
        const angle = Math.random() * Math.PI * 2,
          speed =
            this.world.dimension === 3
              ? 2 + Math.random() * 4
              : 40 + Math.random() * 140;
        this.world.particles.push({
          x: p.x || 0,
          y: p.y || 0,
          z: p.z || 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.8,
        });
      }
      return nil();
    }
    if (name === "$wallet") {
      this.wallet = format(get(0));
      return nil();
    }
    if (name === "$shop") {
      this.world.shop = args;
      return nil();
    }
    throw new Error(`Unknown runtime function '${name}'.`);
  }
  snapshot() {
    return {
      ...this.world,
      actors: this.world.actors.map((actor) => ({
        name: actor.name,
        mesh: actor.mesh,
        age: actor.age,
        data: toPlain(actor.data),
      })),
      tilemaps: [...this.globals.values]
        .filter(([name]) => name.startsWith("$tilemap:"))
        .map(([, c]) => toPlain(c.value)),
      handlers: undefined,
      shop: undefined,
      camera: toPlain(this.world.camera),
      light: toPlain(this.world.light),
      hud: this.world.hud.map((name) => ({
        name,
        value: format(this.globals.find(name)?.value || string("")),
      })),
    };
  }
}

runtimeV3(VM,Env,{raw,integer,decimal,string,bool,nil,cell,array,convert,number,truth,format,operation:binary,Diagnostic});
