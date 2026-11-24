# Jimsabz language v3.0 preview — Studio 0.10.0

This release extends the existing C++ compiler and stack VM. It retains .jimsabz source, newline-separated statements, curly braces, budh input, budhai output, Roman Sindhi/Unicode aliases, game constructs and the native 2D/3D runtime. New attributes use explicit contextual labels; no unreviewed Sindhi translations have been invented.

## What is implemented

| Capability | Syntax and behavior |
| --- | --- |
| Inheritance | `qism Child : Base, Named` — one class base, multiple interfaces; base fields precede derived fields |
| Interfaces | `@interface qism Named { kam name() -> lafz }`; concrete classes must implement required methods |
| Polymorphism | `@virtual`, `@override`, `@abstract`, `@final`; runtime dispatch preserves actual object type through a base/interface reference |
| Encapsulation | `@public` (default), `@private`, `@protected` on fields/methods; checked access follows declaring class |
| Constructors | `kam naon(adad value = 0) { ... }`; synchronous, khali-returning, positional fixed parameters; field defaults run in declaration/global scope before the body |
| Base construction | If a base has a custom constructor, each derived constructor must start with `paan[Base].naon(...)`; missing initialization is SEM-143 |
| Function parameters | Defaults, named arguments, final variadic parameter `adad ...values`, array spread `...values`; positional arguments precede named arguments |
| Overloading | Signature selection prefers exact parameter types over widening; ambiguity and duplicate signatures are errors |
| Function values | `kam(adad)->adad f = ...`; typed function references and bound methods |
| Closures | Local kam declarations and `kam(adad x)->adad => x*2`; lexical variables captured by shared cell, including mutation after the outer call returns |
| Generics | `kam identity<T>(T value) -> T`, `qism Box<T>`; inferred function arguments or explicit `identity::<adad>(7)` |
| Constraints | `T: Numeric`, `Comparable`, `Hashable`, or nominal class/interface constraint; bounded compile-time specialization |
| Dictionaries | `Map<lafz,adad> m = naon Map<lafz,adad>()`, after `kharna Collections` |
| Sets | `Set<lafz> s = naon Set<lafz>()`; duplicate add returns na; insertion order retained |
| Nullable values | `adad? value`, `khali`, `??` fallback, checked `Core.unwrap(value)`; no flow narrowing or optional chaining |
| Collections | Map set/get/tryGet/has/remove/keys/values/clear; Set add/contains/remove/values/keys/clear; primitive keys; 0-based arrays with map/filter/reduce/insert/reverse/contains |
| Iteration | `gin key andar dictionary` iterates keys; set iterates values; arrays iterate elements. Structural changes during iteration/callbacks raise a catchable fault. Keys/values snapshots can be iterated independently. |
| Async | `@async kam`, `Task<T>`, `@await`, non-blocking `Async.sleep(seconds)`, `Async.run(task)` console boundary, cancel/isDone |
| Debugger | IDE Debug button; pause at entry, breakpoints, step into/over/out, call stack, selected-frame variables, source navigation; native JSON pause events |

Existing typed arrays and record construction remain supported. A class without a custom constructor still accepts fields in declaration order, omitting trailing defaults.

## Important rules

Explicit call arguments evaluate left to right, then omitted defaults evaluate in parameter order, once per call. Earlier parameter values are available in later defaults. A required parameter cannot follow a default; only the final parameter can be variadic. Named/spread calls through a plain function type do not retain declaration metadata. Generic functions specialize from exact inferred types; explicit types can request permitted numeric widening. Generic methods/local generic declarations, variance, partial specialization and first-class generic function values are not implemented.

Closures retain references to lexical bindings. Separate outer calls create independent captured bindings. Native C++ shared ownership is supplemented by iterative tracing of VM roots to break unreachable cycles; collection does not move objects or run user finalizers. Embedders retaining a Value outside VM state must pin it in VM.hostRoots. No user-level destructor/RAII syntax or hard real-time GC guarantee is provided.

The async scheduler resumes task frames cooperatively on one VM thread, with a 10,000-instruction quantum and an overall instruction budget. Game clocks drive timers while games run. Await suspends a task; Async.run is rejected on an active game loop. Native async file operations use bounded host workers and copy only path/text into them. Cancellation stops further task execution and raises RUN-TASK-CANCEL when observed. A file write already started may finish after cancellation. Task cancellation does not roll back external work. Console programs must explicitly wait for tasks they need; exiting a program does not wait forever on unobserved tasks. Thread creation, mutexes, channels, parallel language execution, async networking and structured task groups remain future work.

Map/Set keys are adad, dec, lafz or isharo. A missing Map.get throws; Map.tryGet returns T?. Mapping iteration follows insertion order, not sorted order. Bounds, key, arity, mutation and immutable-alias failures are checked. Containers are bounded to one million entries. Array length and collection size are read-only. Array map/filter/reduce callbacks are synchronous, statically typed functions. Replacing a dictionary value does not invalidate its key iterator; adding/removing keys does.

## Standard library contracts

Import each namespace with `kharna Namespace`. Existing gui/gui3d/audio/hisab/waqt/shabak imports remain available. The following table is the actual implemented API, not a future wish list. Types are checked at compile time; runtime I/O and invalid operations raise faults handled by azmai/pakar.

| Module | Functions and return types | Error/implementation notes |
| --- | --- | --- |
| Core | typeName(value): lafz; text(value): lafz; unwrap(T?): T | unwrap(khali) fails; introspection does not introduce unchecked Any variables |
| Math | sqrt/sin/cos/abs(dec): dec; min/max/pow(dec,dec): dec; clamp(dec,dec,dec): dec; floor/round(dec): adad | Integer widening allowed; non-finite results, overflow, invalid clamp bounds fail. Rounding halves away from zero. |
| String | length(lafz): adad; contains/startsWith/endsWith(lafz,lafz): isharo; trim/upperASCII/lowerASCII(lafz): lafz; split(lafz,lafz): qatar lafz; join(qatar lafz,lafz): lafz | length counts UTF-8 code points, not grapheme clusters. Case transforms are deliberately ASCII-only. Empty split delimiter fails. |
| Collections | Map<K,V>, Set<T> constructors and methods described above | Ordered primitive-key lookup; checked key/value types; snapshots return typed arrays |
| FileSystem | readText(lafz): lafz; writeText(lafz,lafz): khali; readTextAsync(lafz): Task<lafz>; writeTextAsync(lafz,lafz): Task<khali>; exists(lafz): isharo; list(lafz): qatar lafz | Paths remain in project/data directory. Native uses filesystem, browser uses workspace files; text limit 16 MiB; native directory results sorted. Synchronous APIs reject active game use. |
| IO | readText(prompt: lafz): lafz; write/writeLine(lafz): khali | Host input may wait; EOF/missing input fails. Do not call blocking input on rendering paths. |
| DateTime | now(): dec; isoUTC(dec): lafz | Epoch seconds; UTC formatting; accepted timestamp range 0..253402300799 |
| Random | seed(adad): khali; integer(adad,adad): adad; decimal(): dec | Inclusive integer bounds; invalid bounds fail. Not cryptographic. Seeded sequences are runtime-specific. |
| Logging | info(lafz): khali; warn(lafz): khali | Routes through the host output/warning hooks |
| Testing | truth(isharo,lafz): khali; equal(T,T,lafz): khali | Failed checks raise RUN-TEST; reference types compare identity |
| Async | sleep(dec): Task<khali>; run(Task<T>): T; cancel(Task<T>): khali; isDone(Task<T>): isharo | Seconds, bounded pending queue; real suspension; cooperative game ticks; catchable task failures |

JSON, regex, HTTP/TLS, process control, package registry and security APIs are not part of this implementation. Existing shabak native networking remains synchronous/platform-specific. Web/backend/desktop platform support must be evaluated against real host integrations.

## Grammar additions (EBNF fragment)

```ebnf
attribute       = "@", ("async" | "interface" | "abstract" | "virtual" | "override" | "final" | "public" | "private" | "protected") ;
generic_params  = "<", name, [ ":", type ], { ",", name, [ ":", type ] }, ">" ;
function        = { attribute }, "kam", name, [ generic_params ], parameters, [ "->", type ], block ;
parameters      = "(", [ parameter, { ",", parameter } ], ")" ;
parameter       = type, [ "..." ], name, [ "=", expression ] ;
class           = { attribute }, "qism", name, [ generic_params ], [ ":", type, { ",", type } ], "{", { field | function | signature }, "}" ;
signature       = "kam", name, parameters, [ "->", type ], newline ;
lambda          = "kam", parameters, "->", type, ( "=>", expression | block ) ;
await           = "@", "await", unary_expression ;
call_argument   = [ name, ":" | "..." ], expression ;
type            = primitive | name, [ "<", type, { ",", type }, ">" ], [ "?" ]
                | "qatar", type | "kam", "(", [ type, { ",", type } ], ")", "->", type ;
```

Type aliases in namespace syntax: Collections.Map, Collections.Set and Core.Task normalize to Map, Set and Task. Parent access is `paan[Base]`; this is a statically checked view, not array indexing. Blocks/newline rules and existing game grammar are unchanged. Interface signatures omit bodies; concrete functions need bodies. New labels remain contextual attributes, not new Roman Sindhi translations.

| Precedence, low to high | Associativity |
| --- | --- |
| = += -= *= /= %= | right |
| ?? | right |
| ya / || | left |
| ain / && | left |
| == != / Sindhi aliases | left |
| < <= > >= / Sindhi aliases | left |
| + - | left |
| * / % | left |
| unary + - ! naheen @await, prefix ++ -- | right |
| calls, member/index, postfix ++ -- | left |

## Compiler, AST and bytecode

The lexer recognizes @, ?, ??, =>, :: and .... Parser nodes retain defaults, generic parameters, constraints, bases, attributes and type arguments. The semantic elaborator specializes generic classes, flattens inherited fields/methods, checks contracts and resolves stable method slots. Semantic analysis adds lexical callable symbols, overload binding, generic function instantiation, nominal conversions and Task/nullable checks. New nodes are lambda, await, spread and baseview; local functions retain lexical environments. Code generation emits callable captures, indirect calls, labeled calls and suspension points. The runtime retains suspended task stack/environment/PC/traps and typed defaults.

JBC3 preserves existing opcodes 0..29 and adds CLOSURE=30, INVOKE=31, CALL_NAMED=32, AWAIT=33. CLOSURE uses mode 0 for global, 1 for lexical, 2 for bound method; its text identifies a function/method slot. INVOKE takes the callable below N arguments; CALL_NAMED names the function. Call labels are U+001F-separated strings (empty positional label; `*` spread). AWAIT consumes a Task and eventually pushes its result. Function records add flags (variadic=1, async=2), signature and parameter-default instruction vectors. Class records add abstract/interface flags and transitive parent names. Header is JIMJBC3 followed by newline, payload byte length and CRC32. The standalone JIMEXE2 trailer can wrap JBC3. Programs requiring no new metadata/opcodes remain JBC2. New readers accept both; old readers reject JBC3. A control-flow verifier checks reachable operand stack heights, jumps, opcode/metadata bounds and await placement; runtime conversions and checks remain necessary. This is not a proof of full type-safety of arbitrary hostile bytecode.

## Debugging

In Studio click **Debug**. The run window pauses before execution. Continue (F5), Step over (F10), Step into (F11), Step out and Show source operate on the live VM. Select a call-stack frame to inspect its visible variables. Enter `main.jimsabz:8, modules/math.jimsabz:12` to set breakpoints, then Continue. Line stepping pauses on source-line/frame changes; a one-line loop has coarse stepping. Local variables do not appear until their declarations execute. Stop terminates the worker. Changing source requires restarting the debug session.

Native CLI: `build/jimsabz debug examples/v3/escaping-mutable-closure.jimsabz`. Pause events are JSON lines on stderr; ordinary program output stays on stdout. Send `step`, `next`, `out`, `continue`, `break file.jimsabz:line`, `clear file.jimsabz:line` or `quit` on stdin. Program input uses the same stream once resumed. This is an embeddable CLI protocol, not a DAP server. Native runtime faults include function call sites. There is no full VS Code LSP/DAP extension, expression watch evaluator, symbol refactoring, reverse debugging or native multithread debugger yet.

## Compatibility and tests

The release preserves existing program and game tests. Correct named argument binding replaces the old behavior that discarded labels; callers that relied on ignored/misspelled labels must fix them. Existing qism field constructors and defaults remain. Array iteration now detects structural mutation; iterate a snapshot or change elements without changing size/order. v3 defaults/closures/async programs use JBC3 and need runtime 0.8.0. No automatic project conversion is required. Legacy mahfooz snapshots do not serialize function values, tasks or Map/Set containers; save their plain data explicitly.

`tests/v3-cases.json` is the shared source/expected-output/negative fixture catalog. `python tests/v3_features.py` executes native source and native-compiled bytecode; `node tests/v3-browser.test.mjs` executes browser source and browser-produced bytecode in the native VM. `tests/debugger.test.mjs` drives the real VM/controller, and `tests/v3_runtime.cpp` exercises escaping closures, cyclic data and non-blocking game ticks under sanitizers. Original regression/runtime/UI suites remain required. Windows binaries are cross-compiled here; interactive execution on Windows must be checked on Windows.

## Working examples

Use the **v3 examples** button to open an independent file without overwriting existing work. Portable sources are included under examples/v3. The examples cover each implemented feature and import the actual libraries they use. They are console language demonstrations; game projects still begin from blank 2D/3D templates.
