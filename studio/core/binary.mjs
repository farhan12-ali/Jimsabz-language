const encoder = new TextEncoder();
export class Writer {
  constructor() {
    this.parts = [];
    this.size = 0;
  }
  bytes(value) {
    const b =
      typeof value === "string"
        ? encoder.encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
    this.parts.push(b);
    this.size += b.length;
    return this;
  }
  u32(n) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, Number(n) >>> 0, true);
    return this.bytes(bytes);
  }
  u64(n) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(n), true);
    return this.bytes(bytes);
  }
  str(text) {
    const bytes = typeof text === "string" ? encoder.encode(text) : text;
    this.u32(bytes.length);
    return this.bytes(bytes);
  }
  finish() {
    if (this.size > 256 * 1024 * 1024)
      throw new Error("The export is too large.");
    const out = new Uint8Array(this.size);
    let p = 0;
    for (const part of this.parts) {
      out.set(part, p);
      p += part.length;
    }
    return out;
  }
}
export class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.p = 0;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u32() {
    if (this.p + 4 > this.bytes.length)
      throw new Error("Truncated binary file.");
    const n = this.view.getUint32(this.p, true);
    this.p += 4;
    return n;
  }
  str() {
    const n = this.u32();
    if (n > 64 * 1024 * 1024 || this.p + n > this.bytes.length)
      throw new Error("Invalid binary string.");
    const b = this.bytes.slice(this.p, this.p + n);
    this.p += n;
    return new TextDecoder().decode(b);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function encodeBytecode(program) {
  const w = new Writer(),
    params = (items) => {
      w.u32(items.length);
      for (const [type, name] of items) {
        w.str(type);
        w.str(name);
      }
    },
    code = (items) => {
      w.u32(items.length);
      for (const i of items)
        w.u32(i.op)
          .u32(i.a)
          .str(i.text)
          .str(i.at.file)
          .u32(i.at.line)
          .u32(i.at.col);
    };
  w.str(program.title || "").str("");
  code(program.code);
  const functions = Object.entries(program.functions).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  w.u32(functions.length);
  for (const [name, f] of functions) {
    w.str(name).str(f.result).str(f.owner);
    params(f.params);
    code(f.code);
    if(program.format>=3){w.u32((f.variadic?1:0)|(f.asynchronous?2:0)).str(f.signature||"").u32((f.defaults||[]).length);for(const d of f.defaults||[])code(d);}
  }
  const classes = Object.entries(program.classes).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  w.u32(classes.length);
  for (const [name, fields] of classes) {
    w.str(name);
    params(fields);
  }
  w.u32(program.assets.length);
  for (const asset of program.assets) w.str(asset);
  if(program.format>=3){w.u32(classes.length);for(const[name]of classes){w.str(name).u32(program.typeFlags?.[name]||0);const parents=program.parents?.[name]||[];w.u32(parents.length);for(const p of parents)w.str(p);}}
  const bytes = w.finish();
  if (bytes.length > 64 * 1024 * 1024)
    throw new Error("Bytecode exceeds 64 MiB.");
  return new Writer()
    .bytes(program.format>=3?"JIMJBC3\n":"JIMJBC2\n")
    .u32(bytes.length)
    .u32(crc32(bytes))
    .bytes(bytes)
    .finish();
}
export function bundleExecutable(runtime, program, files) {
  if (runtime[0] !== 77 || runtime[1] !== 90)
    throw new Error("The Windows runtime is missing or invalid.");
  const w = new Writer();
  w.str(encodeBytecode(program));
  w.u32(program.assets.length);
  for (const path of program.assets) {
    const file = files.find((f) => f.path === path);
    if (!file) throw new Error(`Missing asset: ${path}`);
    w.str(path).str(file.bytes || encoder.encode(file.text || ""));
  }
  const payload = w.finish();
  return new Writer()
    .bytes(runtime)
    .bytes(payload)
    .bytes("JIMEXE2!")
    .u64(payload.length)
    .finish();
}
export function zipFiles(folder, files) {
  const local = new Writer(),
    central = new Writer();
  let offset = 0,
    count = 0;
  for (const file of files) {
    const name = encoder.encode(`${folder}/${file.path}${file.kind === "folder" ? "/" : ""}`),
      data = file.bytes || encoder.encode(file.text || ""),
      crc = crc32(data);
    const head = new Writer().u32(0x04034b50);
    head
      .bytes(new Uint8Array([20, 0, 0, 8, 0, 0, 0, 0, 0, 0]))
      .u32(crc)
      .u32(data.length)
      .u32(data.length);
    head
      .bytes(new Uint8Array([name.length & 255, name.length >>> 8, 0, 0]))
      .bytes(name);
    const header = head.finish();
    local.bytes(header).bytes(data);
    central
      .u32(0x02014b50)
      .bytes(new Uint8Array([20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0, 0]))
      .u32(crc)
      .u32(data.length)
      .u32(data.length)
      .bytes(
        new Uint8Array([
          name.length & 255,
          name.length >>> 8,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ]),
      )
      .u32(0)
      .u32(offset)
      .bytes(name);
    offset += header.length + data.length;
    count++;
  }
  const directory = central.finish(),
    footer = new Writer()
      .u32(0x06054b50)
      .u32(0)
      .bytes(
        new Uint8Array([count & 255, count >>> 8, count & 255, count >>> 8]),
      )
      .u32(directory.length)
      .u32(offset)
      .bytes(new Uint8Array(2))
      .finish();
  return new Writer()
    .bytes(local.finish())
    .bytes(directory)
    .bytes(footer)
    .finish();
}
