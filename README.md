# Jimsabz Studio 0.19.0

Run Code now opens the **3D Compiler Factory in the second Run window**. Follow
blue-and-silver officers through six connected rooms, inspect real compiler
evidence and interactive parser/AST trees, then view actual VM output, input,
games, debugger frames, event logs and downloadable compilation reports.

The existing compiler runs first; the VM waits for the animated handoff or
**Run now**. Pause/Restart control the presentation. **Stop** terminates the
actual Worker; **Run again** recompiles the editor's latest source.
The compiler grammar, analyzer, code generator, VM, game engine and native
runtime retain their implementations.

Read [the factory guide](docs/COMPILER-FACTORY-0.19.0.md) for controls and limits.
All eight professional tools from [Studio 0.18](docs/PROFESSIONAL-0.18.0.md)
remain available. Open **Develop** (Ctrl Shift P) to use them.

- Open `Start-Studio.cmd` for the desktop IDE.
- Open `Start-Build-Server.cmd` for the local IDE and EXE API (Node 20+).
- Run `node api/server.mjs --workspace "C:\path\to\your-project"` for disk/Git integration.
- Click Run Code; allow the second window or use the new-tab alternative shown when blocked.
- Run `node --test --test-concurrency=2 tests/*.test.mjs` for the full development suite.
- Run `node --test tests/compiler-factory.test.mjs` for factory integration checks.

The local agent requires no Ollama, cloud model or API key. Windows EXE
execution, installer installation and publisher signing require a Windows
release machine; this Linux verification does not certify those operations.

The following sections retain previous release notes. The 0.19 factory guide,
0.18 professional guide and current v3 language guide supersede older limits.

---

# Jimsabz Studio 0.17.0 — Standalone Windows EXE API

Click **EXE** in the editor toolbar, choose a filename, then select
**Build & download .exe**. Export → Standalone Windows app opens the same dialog.
The API compiles the project and embeds the native C++ runtime, bytecode and
referenced assets into one Windows 10/11 x64 executable. The resulting program
needs no Jimsabz, Node.js or GCC installation on the destination computer.

For the local API, run **Start-Build-Server.cmd**, then open
**http://127.0.0.1:45426/**. Node.js 20+ is required only for hosting the local
API; no npm installation is needed to run it. **Start-Studio.cmd** retains the
native launcher; its EXE dialog can use **Build on this device** for local export.
The hosted IDE supplies the same API on its own origin.

The build endpoint is **POST /api/build/exe**. Health is **GET /api/build/health**.
Source errors return actual compiler diagnostics. Successful responses are binary
.exe downloads with a filename and SHA-256 checksum. The build service does not
execute the user's program or retain uploaded projects.

137 checks passed: 26 API/native-payload/frontend/HTTP checks, 94 compiler/VM/
agent/export regressions, 9 Run-window checks and 8 packaged Worker checks.
The browser downloaded matching API/local executables; the downloaded payload
executed in the native Linux VM. Windows launching was not run in this environment.
The compiler, VM, native binaries, language and agent engine remain unchanged.

See [the EXE API guide](docs/WINDOWS-EXE-API.md) for setup, API examples, limits,
GCC/MinGW rebuilding and exact verification scope.

---

# Jimsabz Studio 0.16.0 — Neon & Lavender Workspace

The IDE follows the supplied dark and light references: a purple command bar,
Project Space, source tabs, a code minimap, a Code Madadgar dock, and compiler
views for Journey, Output, Problems, Debug and Logs. Switch themes from the top
bar or Settings. Project search (Ctrl K) finds files and source lines.

**Run Code still opens a separate window for program input and output.**
The IDE Output view mirrors the real run output. Build uses the existing compiler
check action. Debug, compiled exports, 3D compiler visualization, project files,
and agent review/apply/undo retain their existing implementations.

All compiler, VM, native runtime, language, training and agent engine files are
unchanged. The visual adapter reads their real state and shows pending, success
and failure results; it does not simulate compilation or execution.

88 automated checks passed. Both themes, interactive Run, semantic diagnostics,
project search, keyboard compiler tabs, editor maximize, local agent generation,
review/apply and the 3D compiler were also exercised in the browser.
Windows launching and narrow-screen browser execution were not performed.
See [the workspace release notes](docs/IDE-WORKSPACE-0.16.0.md).

Extract the full ZIP and open **Start-Studio.cmd** on Windows.

---

# Jimsabz Studio 0.15.1 — Code Madadgar

The agent chat no longer displays the task-progress checklist. Generated code,
compiler/runtime/test evidence, review controls and the separate Run window remain.

## Code Madadgar panel

The agent panel follows the new neon workspace reference: a compact robot
profile, dark chat surface, six quick actions and a bottom composer with Code,
Search, Attach and Voice. The gear opens the existing tools, projects, learning
and voice-language options. The trash icon opens conversation history with
reviewable clearing controls. Search uses bundled Jimsabz documentation.

Only the agent interface and release notes changed. The local model, request
planner, generators, compiler, VM, native binaries and separate Run window are
unchanged from 0.14.0. See docs/AGENT-PANEL-0.15.0.md for checks and controls.

## More capable local requests

Code Madadgar now understands polite and misspelled programming requests, shows
complete source with Copy code, and preserves input counts and requested arrays,
functions, averages and maxima. “Two inputs of marks and their precentage”
generates a two-subject percentage program with a stated maximum.

Login requests generate a working local demo account workflow; gaming hub
requests add guarded native 3D gallery scenes and sign out. Passphrases are
visible in the Run console and accounts last for one run. This is not a
production account service. See docs/PROFESSIONAL-AGENT-0.14.0.md and the runnable
examples under examples/agent/ for the implemented behavior and checks.

The compiler, VM, native binaries and separate Run window are retained.

## Agent interface update

The agent panel follows the supplied purple Jimsabz reference: a welcome banner
with a local mascot, Chat / Tools / Projects / Learning tabs, conversation
avatars, quick actions and a compact message composer. Tabs support arrow keys,
Home and End. The interface retains report attachments, voice controls,
knowledge search, project notes, history and review/apply/undo.

This is an interface update. The compiler, bytecode VM, local agent engine,
native binaries and separate output-window implementation are unchanged.
**Run code** still opens a second window for program input and output.
Read [the UI release checks](docs/AGENT-UI-0.13.0.md).

## Built-in local Code Madadgar

Code Madadgar now works immediately using its included trained intent classifier,
Jimsabz knowledge, language-specific generators and the actual compiler/VM.
The model-server connection and its settings have been removed.

**Windows:** extract the full ZIP, run `Start-Studio.cmd`, open **Code Madadgar**
and type a request. No model installation, account, API key or external AI service
is required. Existing projects, compiler visualization, Run window and language
features are retained.

Ask for dynamic marksheets, arrays, functions, classes, sums and supported game
starters; ask language questions; check, run and test your current code; or
request a supported compiler repair. Review a generated patch before applying it.
See [setup and examples](docs/CODE-MADADGAR.md), [actual capabilities](docs/MADADGAR-PROFILE.md)
and [executed checks](docs/MADADGAR-VALIDATION.md).

This is a small trained classifier plus verified generators and language tools.
It does not synthesize every possible program from unrestricted prose. Complete
Jimsabz source supplied by the user can still be compiled/run across the language.
Chats do not silently retrain the classifier; the trainer and curriculum remain included.

The previous compiler/language release is retained below.

## Language v3 preview

The C++ compiler/runtime is now 0.8.0. Implemented in both the native VM and browser IDE: inheritance/interfaces, virtual dispatch and visibility, generic functions/classes, escaping closures, defaults/named/variadic arguments, dictionaries/sets, nullable collection lookup, cooperative async/await, eleven general-purpose library namespaces, and a source-level debugger. Click **v3 examples**, then **Run code** or **Debug**. Read [the v3 language guide](docs/V3-LANGUAGE.md) for exact syntax, contracts and current limits. The previous C++/JBC/game architecture is retained; JBC2 remains readable and new metadata uses JBC3.

This is an implemented preview, not a claim that the entire production roadmap is complete. LSP/DAP/VS Code, threads/channels, HTTP/TLS, package registry and additional library families remain pending. Windows binaries are cross-compiled; Windows execution is unverified on this Linux host.

The following sections describe earlier milestones and their historical validation.

## Present the language

Choose **Language examples** in the sidebar. **Check all examples** compiles and executes seven editable programs with sample inputs; statuses come from real results. **Open demo folder** creates a separate program folder and opens the complete marksheet. It uses variables, conditions, loops, functions, dynamic arrays and objects together, taking the subject count at runtime.

For a quick live demonstration, run the marksheet and enter `Farhan`, `3`, `90`, `80`, `70` separately. It prints total **240**, percentage **80%**, average **80** and grade **B**. The sample grading rules are strict: >90 A, >70 B, >50 C, otherwise F. Open **3D compiler** to inspect its actual compiler artifacts.

All examples are ordinary language programs; no games are preloaded. Opening an individual example creates a new source file. The existing editor, separate Run window, themes, file management and agent remain available. Checks run in a separate worker and can be stopped; closing the examples panel stops an unfinished check.

The download includes `PRESENTATION.md`, source examples in `examples/presentation`, input/output fixtures and **Check-Presentation.cmd** for a Windows rehearsal without Node.js or Python. Windows execution must be verified on Windows. The native compiler/runtime remains 0.7.0 and language v2.6. The 25 presentation checks cover the samples, grading boundaries, runtime input counts and error recovery. Run `node tests/presentation.test.mjs`; set `JIMSABZ_NATIVE` to include native source and browser-bytecode/native-VM comparisons.


## Files and folders

Use the three-dot menu beside a file, subfolder or the main folder name to rename or delete it. Right-click opens the same menu; keyboard users can Tab to it and use the arrow keys and Escape. New subfolder creates empty or nested folders.

Deletion first shows the affected name and file count, then moves the item to **Trash**. Trash survives reloads and supports restoring files, subfolders and whole workspaces. Restore refuses conflicting paths; rename or remove the conflicting live item first. Nothing is permanently purged by these controls.

Renaming a subfolder updates its contained paths, the active file and program entry. Relative Jimsabz module imports are rewritten using lexer tokens, including imports inside a file that moved. Comments and ordinary strings stay unchanged. Lexically invalid source is preserved with a warning to check its imports. Image/sound paths and other string-based references require manual updates.

These actions change the Studio working copy. Original disk files/folders are unchanged. **Export folder** writes the updated folder structure to ZIP, including empty folders and excluding Trash. The existing Save file action writes to a previously selected disk file or asks for a new location after a file rename/move detaches its old file handle.

Run `node tests/files.test.mjs` for 26 file/folder, Trash, collision, import and ZIP checks. This is a Studio-only release; language v2.6 and the native compiler/runtime 0.7.0 are unchanged.


## Language v2.6

`budh(...)` is the input function and `budhai expression` is output, including `budhai(expression)`. `budhai = "Farhan"` remains a print shortcut; `budha` remains a compatibility output alias. Update old input assignments such as `adad n = budhai("Number: ")` to `adad n = budh("Number: ")`; the compiler explains this migration. Saved user files are never silently rewritten.

The compiler supports typed functions and recursion, nested dynamic arrays, classes/objects and methods, `jey`/`na_ta`, counter/foreach/while loops, `rok`/`agty`, arithmetic and compound assignment. Supported features include type-checked field defaults, omitted trailing constructor arguments, `paan` for the current object, prefix/postfix `++`/`--`, and optional `gin` header parts. Types and names are checked from the AST; there is no fixed input/subject count in the language.

```jimsabz
qism Talib {
    lafz naam = "Farhan"
    qatar dec nishan = []
    kam joryo(dec ang) { paan.nishan.joryo(ang) }
    kam kul() -> dec {
        dec natijo = 0.0
        gin ang andar paan.nishan { natijo += ang }
        wapas natijo
    }
}
Talib pheru = naon Talib()
adad tadaad = budh("Ketira mazmoon? ")
gin (adad i = 0; i < tadaad; i++) {
    dec ang = budh("Nishan: ")
    pheru.joryo(ang)
}
budhai pheru.naam + ": " + pheru.kul()
```

Use explicit `naon` to apply field expressions. Defaults may use earlier fields and globals; each new object receives fresh array/object defaults. Custom constructors, inheritance and constant fields are not implemented. The language retains runtime memory, instruction and call-depth limits.

Jimsa now includes a compiler-checked class/object example builder with requested or runtime numeric input counts, plus updated language Q&A and completion. Its local classifier is trained on 453 Jimsabz targets; it remains a constrained assistant rather than an arbitrary-code model.


An editable IDE and real compiler for Jimsabz. The large editor stays open while Run launches a separate input/output or game window. Compiler journey shows actual lexer, parser, AST, semantic, code-generation, asset and runtime results. Users start with ordinary folders or blank 2D/3D projects; games are not preloaded.

## 3D compiler journey

Select **3D compiler** in the main toolbar, or **Explore in 3D** below the editor. The full-window view compiles the active source without executing it. An orbitable 3D scene follows seven real phases: lexical analysis, syntax analysis, AST construction, semantic analysis, code generation, asset validation and runtime.

- Rotate by dragging or with the camera buttons; scroll or use +/− to zoom. Arrow keys control a focused canvas, and Home or Reset view restores the camera.
- Replay, pause, continue, or use Previous / Next phase. Playback speed changes animation only. Reduced-motion preferences disable automatic replay; manual controls remain available.
- Select a phase to inspect its real artifacts: token kinds and source positions, the parser tree, the expanded AST, symbol types and imported libraries, JBC2 instructions and asset references. Selecting a token highlights its source line.
- The semantic inspector includes class names, fields and qualified method signatures. A failed phase is red. Later phases are blocked and have no fabricated results. Show error in editor returns to its exact file and location.
- Run program opens the existing separate output window. Compilation alone leaves runtime **Ready to run**, rather than claiming the program executed. Runtime output is captured from the real worker messages.
- Source changes mark the previous trace as stale. Compile again to refresh it. Closing the 3D view stops its animation and keeps the editor source intact.

`studio/core/compiler-trace.mjs` records evidence only when requested by the IDE worker. Sampling limits keep inspectors responsive; counts cover the complete result. `studio/core/compiler-scene.mjs` renders 3D geometry using WebGL with a projected Canvas fallback. No external graphics service or dependency is required.

Run `node tests/compiler-journey.test.mjs` for 17 evidence, failure, playback and camera checks. Existing compiler/VM/export and Run-window checks continue to pass.

## Jimsa improvements

- Ask questions about Jimsabz types, input/output, arrays, functions, conditions, loops, number words, compiler phases, modules, files and games. Answers include Jimsabz examples and contextual follow-up buttons. Questions do not create source files.
- Request marksheets for 7, 100, 1000 or another positive subject count. A request without a count asks for it at runtime. Programs use typed arrays, reusable functions and loops. They calculate total, percentage, requested average and grade.
- Set per-subject maximum marks, subject names, input question text, per-subject percentages and grade thresholds. For example: `Write a marksheet for 7 subjects with average; >= 90: A, >= 70: B, >= 50: C, otherwise F`. Strict defaults remain >90 A, >70 B, >50 C, otherwise F.
- Follow up with `Change to twelve subjects with average`. The next file adapts the previous request while preserving existing files. Inconsistent names/counts produce an explanation before source is written.
- Total/average requests also accept variable numeric input counts, and arrays can be passed to functions.

The local model has 453 compiler-validated Jimsabz targets: 348 training requests and 105 held-out requests. Raw intent-classifier accuracy is 92/105 on this small curated set. Explicit numeric-request routing and language help supplement classification. This is a constrained statistical assistant with request parsers and compiler-checked builders, not a general code LLM. Chats and attachments do not automatically retrain it. No external AI API is used.

## Roman Sindhi number words

```jimsabz
adad tadaad = adad_satt
budhai tadaad                         // 7
budhai sindhi_lafz(adad_hazar)         // hazar
budhai sindhi_adad("hik sau satt")     // 107
```

All 0–1000 words have literals with the `adad_` prefix, completion and highlighting. Bare names such as `hik` remain identifiers. Ordinary numeric literals still support the full signed 64-bit `adad` range; input counts are not limited to 1000. See `studio/assets/Sindhi-Numbers-0-1000.csv` and the canonical vocabulary in `studio/core/sindhi-numbers.json`. ASCII Roman spellings are project-defined with common aliases, based on the numeral chapter linked in that data file.

To regenerate JS/CSV data, run `node scripts/sync-sindhi-numbers.mjs`; the desktop source also refreshes its native table. Extend the corpus with `node tests/make-curriculum.mjs`, then run `python3 training/train.py`. See `training/README.md`.

## Run and verify

The desktop ZIP includes the native C++ compiler/runtime, Windows launcher, source, tests, examples, trainer and this browser UI. Extract all files on Windows 11 and run `Start-Studio.cmd`. Browser working copies are device-local. Save `.jimsabz` source or export the folder to move work between computers.

Checks for this release: 92 core/browser/native interoperability checks, 24 marks/report/voice/theme checks, 25 flexible-agent/number checks, 8 separate-window lifecycle checks and 6 writing lifecycle checks. Native coverage includes 72 CLI regressions and 15 runtime tests. Set `JIMSABZ_NATIVE` to the native CLI path to include native interoperability. The new language suite adds 42 checks across browser execution, native source compilation and browser bytecode in the native VM. Run `node tests/language-v7.test.mjs`, `node tests/browser.test.mjs`, `node tests/features-v4.test.mjs`, `node tests/features-v5.test.mjs`, `node tests/run-window.test.mjs` and `node tests/agent-writing.test.mjs`.

Windows binaries are cross-compiled PE x64 files and still require execution checks on Windows. Existing file uploads, voice controls and light/dark themes are preserved. Browser speech availability depends on the browser and its speech service.
