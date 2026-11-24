# Studio 0.16.0 workspace

The supplied light and dark IDE images guide this release's layout and palette.
The implemented source editor continues to accept actual Jimsabz syntax; sample
syntax and illustrative pipeline stages in the images are not language changes.

## Workspace controls

| Control | Behavior |
| --- | --- |
| Home / Project | Existing workspace browser |
| Code | Focus the current editor |
| Run / Run Code | Existing worker and separate interactive output window |
| Build | Existing compiler check without launching a new output window |
| Debug | Existing separate-window debugger |
| Export icon | Source, folder, bytecode and Windows executable exports |
| Tools | Existing Code Madadgar tools, notes, history and voice options |
| 3D Lab | Existing 3D compiler journey with actual evidence |
| Search / Ctrl K | Find source text or file names and navigate to the matching line |
| Theme / Settings | Persist dark or light workspace appearance |

Project Space retains file/folder creation, opening, renaming, Trash and project
selection. The editor adds a visual minimap and current-line tint. The agent
has a compact mascot, supported quick actions, a composer and its original
review/apply/undo workflow. The previously removed task checklist stays removed.

## Compiler views

Journey presents the existing seven stages: lexical analysis, syntax analysis,
AST generation, semantic analysis, code generation, asset validation and running
the program. Results and timing come from the original compiler/worker state.
No success is displayed before a successful compilation.

Output mirrors the real Run output and directs input to the separate window.
Problems displays the actual diagnostic code, stage and source location. Debug
shows the current pause information; the existing Run window supplies debugger
controls. Logs shows actual stage states, details and measured compiler timing.
Dock tabs support arrow keys, Home and End. Each phase retains its original
inspection action. Narrow layouts move the agent below the editor and retain
Output as a tab when the output preview column is hidden.

## Executed verification

88 existing automated checks passed:

- 36 request, program behavior, account boundary and native compiler checks.
- 9 separate-window lifecycle and bridge checks.
- 17 compiler journey evidence, error, replay and 3D checks.
- 26 file, folder, Trash, import and export checks.

Browser observations at 1363 x 936 included both themes without document
horizontal overflow, workspace creation, compile-only Build, Run with 12 and 8
producing Sum: 20, matching IDE output, and an undeclared variable reporting
SEM-02 in Semantic analysis. Search moved to the matching fourth source line.
Settings theme changes, editor maximize/restore, Tools, local percentage source
generation, review/apply, 3D compiler evidence and keyboard dock navigation worked.
After the final UI edits, the percentage program accepted 80 and 90 in the
separate window, printed total 170 and percentage 85%, and mirrored that output
in the IDE. The task checklist remained absent.

84 protected compiler/runtime/core/native, training and agent engine/model files
were compared with the baseline and were unchanged. Agent panel logic is also
unchanged from 0.15.1. Native binaries were retained without rebuilding.
Windows launching and narrow-screen browser execution were not performed.
