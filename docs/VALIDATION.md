# Studio 0.2 validation

- Native compiler/CLI: 72/72 regressions pass, including output shorthand, typed input, sum, functions, arrays, classes, imports, failures, persistence, bytecode corruption and standalone exports.
- Native runtime: 15/15 tests pass, including rendering, physics, scenes, limits, cancellation, real loopback UDP and generated-sprite executable bundling.
- Browser/compiler/agent/export suite: 90/90 checks pass. Browser JBC2 is executed in the native VM for terminal output, input sum, functions, a generated 2D game and a basic 3D scene.
- Local agent: 384 validated Jimsabz targets, 299 training requests, 85 held-out phrasings; 79/85 classification accuracy on the curated set. This does not measure general game invention or LLM capability.
- Chromium UI: Farhan output; input 12 and 8 gives 20; a lafz/adad mismatch fails semantic analysis and blocks later steps; blank 2D starter has no entities; a suggested actor renders; agent writes a new racing source file; the generated game runs; 3D starter/object preview, compiler inspector, source/folder/JBC/EXE exports and save persistence are checked.
- C++ Studio host: packaged HTML, JavaScript modules and model served with correct MIME types; heartbeat succeeds; traversal returns 404; cross-host requests return 403.
- Windows console and GUI subsystem PE x64 binaries cross-compile. Actual Windows execution remains unverified here; see WINDOWS_CHECKS.md.

Native numerical benchmarks remain in build/benchmark-*.json. They describe this Linux test host, not the user's Lenovo laptop or browser performance.

## Studio 0.2.1 run window

Eight lifecycle checks cover popup creation, blocked windows, late handshakes, input replay, origin/source/session checks, stale run IDs, rerun, close cancellation, errors and bounded output. Chromium UI checks verify Farhan in a separate window, 12 + 8 = 20 through popup input, Run again, Stop, closing while input is pending, error navigation, and game ticks/keyboard/pause in the separate window. The editor remains open throughout. Windows execution remains unverified here.

## Studio 0.2.2 editor layout

Chromium at 1363 × 936 gives the code area 1079 × 673 pixels in the default layout and 1301 × 800 pixels when maximized. Maximize and Restore panels work; opening the optional agent restores the panels. A semantic type error also restores panels and expands the compiler journey automatically. Running `budhai = "Farhan"` from the maximized editor still opens a separate window and prints Farhan. JavaScript syntax checking passes. The native compiler and runtime are unchanged in this layout update.

## Studio 0.3.0 Jimsa agent

The greeting is visible in the welcome panel and a conversational salam does not create a file. Chromium checks observed the first line of a two-line generated program before completion, verified its Farhan output in the separate window, stopped a 54-line request after two lines, and resumed with a Roman Urdu sum request. The generated sum accepts 12 and 8 and prints 20. Stopped drafts remain editable and existing files are preserved. Six automated writing checks cover exact line/source preservation, Unicode, blank lines, CRLF, cancellation before and during writing, and a new request after stopping. The dataset validator rejects foreign syntax before training. The native compiler/runtime are unchanged.

## Studio 0.4.0 additions

Marks/report/voice/theme suite: 25 checks with native interoperability, including exact 50/70/90 boundaries, fractional percentages, retrying invalid marks, four-subject maximums, all if/else branches, Roman Sindhi names, the user’s full request, supported report starters, explicit unsupported requirements, multiple compilable files, attachment limits, voice partial/final results and denied permission recovery, and persistent theme synchronization. Native source and browser JBC2 both produce total 270, percentage 90 and grade B for 80/90/100. Chromium extracted matching text from PDF, DOCX and TXT reports, created main.jimsabz and PROJECT-PLAN.md, and ran the resulting interactive program successfully. Actual microphone capture and Windows execution remain unverified.


## Studio 0.5.0

- 91/91 core browser/compiler/VM/agent/export checks with native interoperability.
- 25/25 marks/report/voice/theme checks; 8/8 Run-window and 6/6 writing lifecycle checks.
- 25/25 new flexible-agent/number checks: all 0–1000 word round-trips and literals; semantic and runtime failures; existing identifiers; full numeric range; 1, 7, 12, 1000 and 1001 subject counts; runtime count/range validation; averages, named subjects, custom questions and per-subject percentages; quoted/inclusive grades; 1000 data-driven rules; digit/Sindhi/English counts; general statistics; contextual language help and follow-ups; every help example compiles; CSV completeness; native source and browser JBC2 agreement.
- 72/72 native CLI regressions and 15/15 runtime tests pass after the compiler changes.
- 433 compiler-validated training targets, 333 training and 100 held-out requests; raw classifier accuracy 88/100 on the expanded curated set. Explicit request parsing and Q&A are separate from that score.
- Native Windows CLI and GUI rebuilt using MinGW-w64. Actual Windows execution remains unverified.


## Studio 0.6.0 — 3D compiler journey

15/15 new checks cover real lexer/parser/AST/symbol/instruction/asset evidence, opt-in capture without program changes, pre-expansion parser snapshots, imported source locations, lexical/syntax/semantic/asset failures, blocked later phases, runtime readiness, bounded previews with complete counts, pause/resume/speed and stopping at an error, camera perspective and visibility at several viewport sizes. The 91 core/interoperability, 25 v4 and 25 v5 checks also pass; Run-window and writing lifecycle checks are preserved.

The visualization is an educational replay of recorded compiler results. Compiler timings exclude animation. Compile-only does not execute the program. Runtime output uses actual worker messages. WebGL draws the 3D geometry with a projected Canvas fallback. Windows host binaries were not changed for this IDE feature, and Windows execution remains unverified in this environment.


## Studio 0.7.0 — language v2.6

- 42 language checks pass through browser execution, native source compilation, and browser-generated JBC2 executed in the native VM: canonical input/output, typed recursion, object/array identity, default expressions and overrides, current-object method calls, increments, loops and arithmetic faults. Includes 1, 7 and 1000 numeric inputs.
- 92 core/browser/export/native interoperability checks; 24 marks/report/voice/theme checks; 25 flexible-agent/number checks; 17 compiler-journey checks; 8 Run-window lifecycle checks; 6 line-writing checks.
- Native regression suite: 72/72; runtime suite: 15/15. Benchmark JSON files are regenerated by test-linux.sh.
- All 453 training targets compile: 348 training requests and 105 held-out requests. Raw classifier score: 92/105 (87.6%). The classifier and builders remain constrained; this is not arbitrary code generation.
- Chromium UI: class code accepts a runtime count, reads 12 and 18 and prints Kul: 30 in a separate window; Jimsa writes an object example line by line; Q&A explains budh/budhai and paan; a wrong field default fails at semantic analysis and blocks later phases; the 3D inspector shows real class fields/method signatures.
- Save regression: after a second, unchanged editor tab closes, the new source file and its contents survive reloading. Unchanged tabs no longer flush stale workspaces on unload. Concurrent edits remain last-write-wins.
- Windows CLI and GUI rebuilt with MinGW-w64. PE x64 console/GUI subsystems and system-only DLL imports inspected. Windows execution acceptance remains outstanding; see WINDOWS_CHECKS.md.


## Studio 0.8.0 — files and folders

- 26/26 file/folder checks: path validation, inferred and explicit folders, atomic rename conflicts, case-only rename, relative import rewriting with execution, source and binary preservation, entry/active selection, recursive Trash deletion, collision-safe restore, empty-folder ZIP export and stale-tab deletion guards.
- 92/92 compiler/VM/agent/export and native interoperability checks; 17/17 compiler journey checks; 8/8 separate Run-window checks. Browser module syntax checks pass.
- Chromium UI checks: created a separate test workspace and nested module; renamed the main folder, subfolder and source file; confirmed imports changed; cancelled deletion; deleted/restored a subfolder and file across reloads; deleted/restored the whole test workspace across reloads; rejected a conflicting rename with an inline error. The restored program compiled and printed 12 in its separate Run window. File actions and keyboard Escape checked in light and dark themes. Existing workspaces were preserved.
- Deletion is recoverable Trash in the Studio working copy. Original disk files are not renamed/deleted. Export folder includes the current structure and empty folders, excluding Trash. Assets' string paths need manual updates after rename.
- This release changes the Studio UI and browser workspace management. The bundled native compiler/runtime and source remain 0.7.0, language v2.6; no native compiler or Windows binary behavior changed. Prior Windows execution limitations still apply.


## Studio 0.9.0 — presentation build

- 25/25 presentation checks passed in the browser VM, native source execution and browser-bytecode/native VM execution. Includes all seven samples, an AST check for all six requested language constructs, 1/7/1000 runtime-selected subjects, strict grade boundaries, invalid-input recovery, configurable maximum marks, genuine failure results and fixture consistency. See build/presentation-checks.json.
- Current checks: 92 core/agent/export/native interoperability; 42 language v2.6; 26 file/folder/Trash; 17 compiler journey; 8 Run-window lifecycle. Native CLI regressions 72/72 and runtime 15/15; current benchmark JSON regenerated. Browser module syntax checks pass.
- Chromium: Language examples started unchecked, then fresh checks reported 7/7; Open demo folder created seven editable files. Running the marksheet with Farhan, 3, 90, 80, 70 produced total 240, percentage 80%, average 80 and grade B. The 3D semantic inspector showed 16 real symbols, including class fields and method/function signatures. Both panel themes were inspected. Existing workspaces were preserved.
- Native compiler/runtime source is unchanged at 0.7.0 (language v2.6). Linux binary rebuilt here. Windows binaries are retained from the previous release; Windows execution remains unverified in this Linux environment. Check-Presentation.cmd is supplied for a real Windows rehearsal and is not represented as an already-passed Windows test.
