# Compiler Factory — Studio 0.19.0

## Open and run

Click **Run Code** in the existing editor. The original IDE remains available;
the separate Run window now contains the integrated Compiler Factory. Allow
popups for Studio. If a popup is blocked, click **Open the factory in a new tab**
in the editor notice. This alternative opens the same authenticated Run view.
It still requires the browser to allow a user-initiated tab.

The entry source and project files are captured together when Run is clicked.
The paper preview, compiler, VM and report all use that captured snapshot.
Editing in the IDE marks the older factory snapshot as changed; it does not
change a program already waiting or running. Use **Run again** for new source.

The real existing compiler runs immediately in its Worker. The journey presents
its recorded events at a readable pace. After all six phases pass, the existing
VM waits for the package to reach the execution environment, or for **Run now**.
Compilation errors never unlock this handoff. A one-shot gate checks the run ID.

## The six rooms

| Room | Actual compiler evidence |
| --- | --- |
| Lexical analysis | Tokens and source positions from the existing lexer |
| Syntax analysis | The existing parser's returned tree, before imports expand |
| AST generation | The expanded AST, before semantic elaboration |
| Semantic analysis | Resolved declarations, signatures and library imports |
| Code generation | Real JBC2/JBC3 instruction disassembly and instruction count |
| Asset validation | Required workspace resources and real asset warnings |

The room order is the existing compiler's order. Runtime is a separate final
environment, not an invented seventh compilation phase. Missing assets block
execution even if bytecode was already generated.

Two blue-and-silver robots stand at the entrance: the delivery officer and the
guide. Each glass/metal room has a matching officer, workstation, monitor,
keyboard, chair, holographic tools and glowing route. The delivery officer
brings the source document to Room 1. Subsequent packages follow the connected
conveyor route. Room-specific tools use the real captured artifact counts.
Robots are procedural geometry following the blue/silver reference family;
no official mesh file was supplied or imported.

## Navigation and controls

| Section | Behavior |
| --- | --- |
| Journey | Orbit, zoom and inspect six rooms and the source delivery |
| SVG Output | Export the actual phase-state/output diagram; capture an actual game frame in SVG |
| Problems | Exact compiler/runtime diagnostics and editor source-location buttons |
| Debug | Real phase representations and the existing live VM debugger |
| Logs | Chronological compiler/VM events with timestamps and text download |
| Results | Actual console output, interactive input or the original game canvas |
| Parse Tree | Expand, collapse, select, pan, zoom and locate parser nodes |
| AST Tree | Inspect actual expanded AST nodes with the same controls |
| Compilation Report | Actual statuses, measured timings, errors, warnings, artifact counts, source hash and JSON download |

Start, Pause, Resume, Restart and Previous/Next Phase control presentation.
They do not claim to suspend or rerun an already completed compilation.
Restart replays the captured journey; it cannot execute the same VM twice.
**Stop** terminates the real Worker. **Run again** recompiles the current editor.
Reset Camera, Zoom In/Out and Auto Camera change the 3D viewpoint. Drag or use
arrow keys on the canvas; Home resets it. Select a room to pause and inspect it.

When a compiler phase fails, the package stops in that room, its status and
officer's visor turn red, and later phases remain **Not Executed**. The exact
diagnostic remains available in Problems and the report. Execution stays
**Not Run**. The user can return to the editor, correct the source and run again.

The report's phase timings are measured by the existing compiler. That compiler
does not expose elapsed time for failed phases, so those cells show a dash and
JSON `null`. VM wall time is reported when execution ends; it includes input or
debugger waits and excludes journey animation. No frame-rate or memory
benchmark is inferred from animation. A live game has no completed execution
time until it ends; Stop is reported as stopped.

## Preserved runtime behavior

Console text comes from real VM print hooks. Input uses the original request /
accept bridge. Games use the existing Renderer, actual VM snapshots, key/mouse
events, audio and 60 Hz simulated tick request. Debug starts with the existing
Debug button and retains Continue, Step Into/Over/Out, breakpoints, call stack,
locals and source navigation. The terminal stays readable after completion.
Clearing the visible console does not remove the report's captured output;
typed input echoes are excluded from the program-output field.

The original compiler grammar, semantic analyzer, code generator, VM, game
engine, native C++ source, native executables and classifier model are retained.
Integration edits add tree capture to compiler-trace, authenticated factory
events to run-window, and the execution handoff/timing to worker. The original
3D Lab learning view and all professional tools from 0.18 remain available.
No inference service, model installation, Ollama or API key is introduced.

## Themes, accessibility and bounds

IDE theme changes synchronize with the factory via both the normal storage
event and the authenticated bridge. The dark scene uses navy/cyan lighting;
the light scene uses bright metallic/glass materials. Robot colors are retained.
Keyboard tabs, room buttons and tree items expose accessible names and states.
Reduced-motion preference starts the journey paused; **Run now** remains usable.

The local renderer uses WebGL when available and a projected Canvas fallback
when WebGL is unavailable. It uses no downloaded 3D library. The factory is
drawn at a capped presentation rate separate from the game simulation.
Browser/device compatibility still requires testing on target Windows hardware;
the current browser check observed the Canvas fallback, not hardware WebGL.

The parser exposes an abstract parsed structure, not a separate concrete
grammar/CST. Parse Tree labels disclose this. Tree snapshots contain at most
6,000 nodes while retaining the full node count; the SVG inspector displays at
most 900 visible nodes. Expand/collapse branches to inspect captured data.
Earlier evidence previews retain the existing 320-row / 28,000-character
limits. Output buffers trim after 250,000 characters and retain a bounded tail;
the report marks truncation. Event history retains at most 1,500 events.
These limits never change compiler/VM behavior.

The downloadable bytecode is generated by the existing encoder; it is not a
Windows executable. The separate **EXE** action and its API remain available.
Windows execution, installer installation and publisher signing were not run
in the Linux development environment.

## Validation

Run `node --test tests/compiler-factory.test.mjs` for actual Worker handoff,
compiler-failure, input/debug, game-tick, tree, report, lifecycle, route and
bridge checks. Run `node --test --test-concurrency=2 tests/*.test.mjs` for all
existing compiler/VM/agent/native/API regressions. Current logs and the
acceptance record are in `docs/validation/`.
