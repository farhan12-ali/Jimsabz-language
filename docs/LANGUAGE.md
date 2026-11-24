> Current release: see [Jimsabz v3 preview](V3-LANGUAGE.md). The text below documents the retained v2.6 baseline.

# Jimsabz language v2.6 — Studio 0.9.0

Files are UTF-8 and use `.jimsabz`. Identifiers are case-sensitive. A newline ends a statement; only `gin` loop headers use semicolons. Blocks use `{ ... }`. Comments use `//` or `/* ... */`.

## Types and expressions

```jimsabz
adad count = 7
dec speed = 3.5
lafz name = "Farhan"
isharo alive = ha
pakko adad LIMIT = 100
qatar adad values = [10, 20, 30]
qatar qatar adad grid = [[1, 2], [3, 4]]
```

Uninitialized primitive variables receive zero, false, or an empty string. Arrays are dynamic. `values.lambai`, `values.joryo(40)` and `values.kadh(0)` get length, append, and remove/return an element. Out-of-range indices raise a runtime fault. A `pakko` container and its shared contents are immutable.

`adad` uses checked signed 64-bit arithmetic. Integer division truncates toward zero. `dec` uses finite double-precision values. Integers widen to decimals; decimals require `badal(value, adad)` to narrow. String concatenation formats a primitive value when the left operand is `lafz`.

Precedence, highest first: member/index/call/grouping/postfix increment; prefix increment/sign/negation; `* / %`; `+ -`; ordering; equality; AND; OR; assignment. Assignment is right-associative. AND/OR short-circuit. Other operands and arguments evaluate left to right.

| Symbol | Sindhi-inspired alias |
| --- | --- |
| `==` | `barabar` |
| `!=` | `na_barabar` |
| `>` | `wado` |
| `<` | `nandho` |
| `>=` | `wado_barabar` |
| `<=` | `nandho_barabar` |
| `&&` | `ain` |
| `\|\|` | `ya` |
| `!` | `naheen` |

## Input and output

```jimsabz
lafz name = budh("Name: ")
adad age = budh("Age: ")
budhai name + " is " + age
```

Input converts to the target primitive type at assignment. Boolean input accepts `ha`/`na`, `true`/`false`, or `1`/`0`. Invalid numbers and a closed input stream raise catchable runtime faults.

`budh(...)` is input. `budhai expression`, `budhai(expression)` and `budhai = expression` all print output. `budha expression` is a compatibility output alias. Migrate older `budhai(...)` input assignments to `budh(...)`; the semantic analyzer reports a specific migration hint. Studio does not rewrite saved user files.

## Branches and loops

```jimsabz
jey (count >= 5) {
    budhai "Ready"
} na_ta {
    budhai "Waiting"
}

wori (count < 10) {
    count += 1
}

gin (adad i = 0; i < 3; i += 1) {
    budhai i
}

gin item andar values {
    budhai item
}
```

`gin (; condition;)` omits initialization/update; `gin (;;) { ... }` repeats until `rok`. Prefix/postfix `++` and `--` accept numeric variables, fields and indexed elements. Postfix returns the old value; prefix returns the new one. The target is evaluated once, and failed arithmetic does not store a partial result. Compound assignments support `+= -= *= /= %=`.

`rok` exits a loop/switch, and `agty` starts the next loop iteration. `chundo(value)` supports `halat expression:` and `aam:`. A matched branch does not fall through into another branch.

## Functions and classes

```jimsabz
kam double_it(adad n) -> adad {
    wapas n * 2
}

qism Student {
    lafz name
    adad marks
    kam passed() -> isharo {
        wapas marks >= 50
    }
}
Student person = naon Student("Farhan", 86)
budhai person.passed()
```

Parameters and non-void return values have explicit types. A function without `-> Type` returns `khali`. Construction supplies fields in declaration order. Fields may have type-checked default expressions. Omit only trailing fields with defaults; earlier provided values are available to later default expressions. Defaults execute once per omitted field in declaration/global scope, and arrays/objects are created afresh for each instance. Use explicit `naon` to apply these expressions. A bare uninitialized class variable retains legacy zero/empty field values. Constant fields are rejected. Inside a method, `paan` refers to the current object: use `paan.field`, `paan.method(...)`, or return/pass `paan`. The receiver binding cannot be reassigned; mutable fields remain writable. Objects passed to functions or stored in arrays preserve their identity. There is no inheritance or user-defined constructor syntax.

## Exceptions, files and saves

```jimsabz
azmai {
    adad value = budh("Number: ")
    budhai value
} pakar (error) {
    budhai error
}

likh("notes.txt", "Saved text")
budhai parh("notes.txt")
mahfooz("save.jimsave")
wapas_lao("save.jimsave")
```

Paths stay within the project folder. Standalone exports instead keep user files in their persistent per-game data folder. Arrays, global variables, objects, and named entity fields can be saved; a complete runtime snapshot including spawned pools and timer/audio state is not yet supported. `uthao(message)` raises an error; `assert(condition, message)` checks an invariant.

## Modules and built-in libraries

```jimsabz
kharna "modules/math.jimsabz"
kharna gui
kharna audio
kharna hisab
```

Module paths are relative to the importing file and stay inside the project. A `jimsabz.json` marker identifies the project root; otherwise the entry file's folder is the root. Imported definitions share the program scope.

| Library | Commands |
| --- | --- |
| `gui` | `khed`, `kirdar`, sprites, tilemap grids, 2D collisions |
| `gui3d` | `khed3d`, `mujassamo`, primitives/OBJ, 3D collisions, camera, lights |
| `audio` | `dhun`, `wajai`, `awaz`, `chup()` |
| `hisab` | `sqrt`, `sin`, `cos`, `abs`, `floor`, `round`, `min`, `max`, `bina_tarteeb` |
| `waqt` | `waqt()` monotonic seconds; game time while a world is active |
| `shabak` | `shabak.host(port)`, `.connect(ip, port)`, `.send(text)`, `.receive()`, `.close()` |

`shabak.receive()` is non-blocking and returns an empty string when no peer packet is available. A host learns its peer from the first packet before it can reply. Packets are limited to 60,000 bytes and ports to 1024–65535. Actor state replication is not automatic in this version.

## Games

See the complete examples for entity blocks and events. Important properties:

| Construct | Meaning |
| --- | --- |
| `khirki W, H` | Window size, from 160×120 to 3840×2160 |
| `pichaan #RRGGBB` | Background color |
| `jagah: (x, y)` | 2D top-left position; y increases downward |
| `jagah3d: (x, y, z)` | 3D world position; y increases upward |
| `ghumao: (x, y, z)` | Euler angles in degrees |
| `paimano: (x, y, z)` | 3D scale |
| `qabu: arrows / wasd / arrows_platformer / wasd_3d` | Native controls |
| `raftar` | 2D speed in pixels per 60 Hz tick; 3D speed in units/second |
| `wazan`, `chhal`, `thandho` | Gravity acceleration, jump impulse, solid platform |
| `tasveer: "path" (size: W, H)` | Sprite and displayed size |
| `harkat "run": frames(0..5, fps: 12)` | Horizontal sheet animation |
| `chalao(entity, "attack")` | One-shot animation |
| `har seconds second { ... }` | Fixed-step interval handler |
| `takkar(A, B)` / `takkar3d(A, B)` | Collision handler |
| `on_key("SPACE")` | One event per key press |
| `on_click("left")` | Mouse click event |
| `dekhar(score, lives)` | Live variable HUD |
| `manzar Name`, `tabdeel_manzar("Name")` | Scene-filtered entities and handlers |
| `chal_ai: patrol(low, high)` / `chase(Target)` | Native movement behaviors |

Sprite sheets use equal-width horizontal frames; their count is the highest declared frame index plus one. Named 2D actors with `paida: random_top(interval)` spawn cloned instances. In a collision handler, the matching entity name temporarily refers to the collided instance, so `khatam(TrafficCar)` removes the correct instance.

The runtime uses a 1/60-second simulation step. Timer callbacks can catch up at most four times per tick. There is a 10-million-instruction budget per console run or game tick and a 256-call depth limit. Use these diagnostics to fix endless loops rather than assuming the GUI has frozen.

## Implemented Sindhi-script aliases

This table defines the subset implemented by this release; it is not a claim of a complete reviewed Sindhi language dictionary.

| Script | Canonical token |
| --- | --- |
| `جي` | `jey` |
| `ڪردار` | `kirdar` |
| `ها` | `ha` |
| `نه` | `na` |
| `عدد` | `adad` |
| `لفظ` | `lafz` |
| `ڪم` | `kam` |
| `واپس` | `wapas` |
| `ٻڌاءِ` | `budhai` |
| `ٻڌ` | `budh` |



## Roman Sindhi numbers (Studio 0.5.0)

`adad_` introduces an explicit number-word literal. Underscores separate words. Bare words remain legal variable names, so existing identifiers such as `hik` are preserved.

| Literal | Numeric value |
| --- | ---: |
| `adad_hik` | 1 |
| `adad_satt` | 7 |
| `adad_sau` or `adad_hik_sau` | 100 |
| `adad_hik_sau_satt` | 107 |
| `adad_panj_sau_satasi` | 587 |
| `adad_hazar` | 1000 |

`sindhi_lafz(adad)` converts 0–1000 to its Roman Sindhi text. `sindhi_adad(lafz)` converts a recognized word back to an integer; spaces, underscores and hyphens are accepted. Unknown literals fail lexical analysis; wrong function argument types fail semantic analysis; invalid conversion text or an out-of-range value produces a runtime error. These helpers do not restrict ordinary signed 64-bit numeric literals or input counts.

`studio/assets/Sindhi-Numbers-0-1000.csv` lists all 1,001 canonical words, literals and suggested identifiers. Spellings are project-defined ASCII Romanizations with common aliases. The numeral reference is George Stack's grammar hosted by Sindhi Language Authority: https://library.sindhila.org/public/index.php/book/35/read/1216 . This is a source for numeral formation, not an assertion of a universal Roman spelling standard.

Edit `studio/core/sindhi-numbers.json`, then run `node scripts/sync-sindhi-numbers.mjs` to refresh browser data, native tables and the CSV. Rebuild both native executables after changing the vocabulary.

Use `qatar` arrays, `gin`/`wori` loops and `kam` functions to process user-selected counts. One reusable loop can read seven, one thousand, or runtime-selected subjects; a separate keyword for each variable is unnecessary.
