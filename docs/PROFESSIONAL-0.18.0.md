# Jimsabz Studio 0.18.0 — professional development tools

Studio 0.18.0 extends all eight requested areas. The compiler grammar, semantic
analysis, stack VM, native binaries and separate interactive Run window retain
their existing implementation. Studio version and language version are separate:
this package contains native compiler/runtime 0.8.0 and the implemented v3 preview
with its v2.6 baseline. The creator's original v2.5 brief is not a conformance claim.

## Open the tools

Choose **Develop**, or press **Ctrl Shift P**. Tabs open Code tools, Tests,
Recovery, Source control, Scene & assets, and Windows release. The left rail
also opens frequently used tools. Run Code continues to open a second window.

## 1. Compiler-backed editor assistance

The active entry and its imported files are compiled in a separate analysis
worker after a short typing delay. The live indicator opens actual diagnostics,
including their code, file, line and column. Analysis does not execute source or
alter the Build/Run pipeline. A timeout stops expensive analysis workers.

The parser provides declarations, lexical scopes, source locations and function
parameters. Editor completion uses this information and existing language
snippets. Hover over a known name for its type/signature. The lower editor strip
shows symbol or call information.

- F12: go to a known definition.
- Shift F12: list bound references.
- F2: preview and apply a symbol rename.
- Alt Shift F: format indentation.

Safe rename supports variables, constants, parameters and unambiguous free
functions. It checks collisions, stale source and compiler validity before
enabling Apply. Generic functions, overloaded names, fields and class renames
are deliberately not rewritten. Named-argument parameter renames are refused.
Advanced binding/navigation is limited; this is an in-product language service,
not an LSP server or a claim that every v3 refactoring is implemented.

Formatting reindents source without merging statements or changing newline
termination. It preserves tokens and multiline comment contents. A checkpoint
is saved before applying formatting or a reviewed rename.

## 2. Broader local agent planning

The existing trained classifier and generators remain available. No model
service, API key or Ollama installation is required. The classifier is reused
from the 0.14 training run; there is no new neural model training in 0.18.

A new compositional numeric planner combines requested operations:

- Total, average, minimum and maximum.
- Ascending/descending heapsort and median.
- Search for a specified value, or ask for a search value at runtime.
- Literal arrays, requested counts from 1 through 1,000, or a runtime count.
- Separate main source and reusable calculation module.
- Optional report saving to a requested `.txt` filename.
- Follow-up requests that preserve previous operations and edit the known generated
  source/module pair in place. If source was customized, a separate draft preserves it.

Try: `Write a program for 12 numbers with total, median, maximum and sorting`.
Then: `Add minimum and search for 42`.

An interactive calculator supports +, -, *, / and division-by-zero handling.
These builders compile and execute sample expected-output fixtures in the real
VM. Failed checks disable Apply. The existing staged review, reject and undo
workflow remains in place. Unsupported open-ended synthesis remains outside the
local classifier/planner's scope. The agent is not an unrestricted generative LLM.

## 3. Windows release tooling

EXE export uses the existing native runtime and embeds bytecode and referenced
assets. Packaged game resources retain the existing asset pipeline. Native FileSystem
operations read/write the separate per-program user-data directory. An arbitrary
project text file is not automatically seeded into that directory. Programs that
need initial user-data files must create them explicitly.

Run `npm run test:release` for runtime integrity, PE64 export and checksum tests.
On Windows x64 it also executes exported console/input/module/array/file examples
from empty directories and compares exact output. On other hosts those execution
checks report **Not Run**.

On Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/test-windows-release.ps1
```

The GitHub workflow runs the same checks on a Windows Server 2022 runner. This
does not substitute for Windows 10/11 client installation, graphics and audio
checks. The workflow is supplied but was not executed in this development session.

The Inno Setup recipe installs the desktop app for the current user, supplies
Start-menu/optional desktop shortcuts, records version 0.18.0 and provides an
uninstaller. It leaves user project folders outside the installation directory.
Install Inno Setup on your Windows release machine, then run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

Optional parameters `-CertificateThumbprint`, `-SignTool` and `-TimestampUrl`
sign and verify the final installer with the publisher's own certificate.
No certificate or private key is shipped. Signing does not guarantee immediate
SmartScreen reputation. Rebuilding/signing the native binaries is a separate
release step; the bundled native files are unchanged in this release.

Recorded Windows execution, installer compilation/installation and publisher
signing remain **Not Run** until carried out on the appropriate Windows host.
The Windows release tab states these limits and displays saved evidence.

## 4. Recovery, history and local folder saving

The existing browser workspace database is retained. A separate IndexedDB vault
stores cloned checkpoints. Automatic checkpoints are throttled; manual and
before-change checkpoints capture reviewed operations. Retention is up to 40
snapshots / 32 MiB per project, with a 16 MiB snapshot limit. Older snapshots are
pruned automatically. Export a ZIP backup for independent long-term storage.

A small synchronous write-ahead journal covers source edits between keystrokes
and the asynchronous save. On reopening, a differing journal entry is offered for
review. Recovery/restoration creates a checkpoint of current source first.
The journal covers one current source file up to 250,000 characters per project;
larger files rely on normal browser saves and checkpoints. Browser/site data
removal also removes browser history; it is not cloud backup.

Link a folder using the browser's File System Access picker. Review the save
plan before writing. Existing unknown differences and external edits are
conflicts; the tool refuses them. Save checks again before each file and never
deletes absent files. Folder handles are retained when supported, and permission
may be requested again after reopening. Download backup is available when the
picker is unsupported. File saves are atomic per file, not across an entire
project; a filesystem failure may leave some reviewed files saved.

## 5. Test explorer

Tests discovers project files ending in `.tests.json`. Run one case or all cases,
stop pending runs, inspect exact expected/actual output and its first difference,
and navigate to a diagnostic or the entry source. Tests compile and execute in
isolated VM workers using the existing sandbox/time limits. They do not execute
arbitrary host commands. A stopped or unavailable run is not marked passed.

**Open example test project** creates a separate workspace containing the seven
existing language examples and their exact-output cases. Your previous project
is preserved. New test case writes a suite for the active entry.

```json
{
  "version": 1,
  "entry": "main.jimsabz",
  "cases": [
    { "name": "Sum", "inputs": ["7", "5"], "expectedOutput": "A: B: 12\n" }
  ]
}
```

Entry paths are workspace-relative. Each suite allows 1–20 cases. Prompts and
final newlines count as output. Error cases may specify `expectedError` instead.
The explorer executes Jimsabz project tests; the source package's Node/C++
regression suites continue to run from the development terminal.

## 6. Local Git integration

Install Git and Node 20+, then start from the Studio package:

```powershell
node api/server.mjs --workspace "C:\path\to\your-project"
```

Open `http://127.0.0.1:45426` and choose Source control. Supported operations are
repository initialization, status, working/staged diffs, selected-file staging
and unstaging, local commit history, branch listing, branch creation and switching.
Review the staged diff, enter your author name/email and write a message before
creating a local commit. Identity overrides apply to that commit only; repository
and global Git configuration stay unchanged.
A stale staged revision is refused. Branch changes require a clean working tree.
No push, reset, clean, remote operation or branch deletion endpoint is provided.

The folder must be the repository root. Import disk project creates a new browser
workspace; the prior workspace is retained. Review save to disk uses imported
file hashes and refuses external differences. Missing browser files are retained
on disk. After switching branches, import the disk project to refresh the editor.
Text/asset import is bounded to 256 files / 12 MiB; a single file is limited to
4 MiB. Saves are bounded to 8 MiB total and checked before each write.

Local endpoints enforce loopback, same-origin checks and a per-server session
token. Source paths are restricted to the selected root; linked directories,
private dot paths and executables are refused. Git uses argument arrays with no
shell, bounded output/timeouts and disabled repository hooks/clean/smudge/process
filters. Commit signing is left to a separate normal Git workflow. The agent has
no autonomous Git or shell tool. The hosted preview cannot access local repositories.

## 7. Scene and asset editor

Open a game source and choose Scene & assets. Add a primitive object, select it,
edit literal position/scale/dimensions/color/shape, or drag it on the placement
canvas. A 3D scene uses top-down X/Z placement and a Y property field. Arrow keys
move the selected object; Shift increases the step. Bounding-box overlays help
with placement. The preview initializes the actual compiled scene in an isolated
VM and draws its snapshot with the existing renderer.

Edits stay in a draft. Compile & apply checks the draft against the project and
refuses stale source. A recovery checkpoint precedes application. Existing game
events and non-edited source are preserved. Expression-based properties require
source editing. This first editor does not provide animation/tilemap painting,
mesh modeling, a physics simulation editor or a replacement for the Run window.
Preview does not measure frame rate, audio or interactive gameplay.

The asset inventory previews images/audio and shows model source, references,
missing resources and unreferenced candidates. Static analysis cannot prove that
an asset is unused when paths are generated dynamically; candidates are not
deleted. Parse failures mark the scan incomplete.

## 8. Usability and accessibility

Project, agent and compiler dividers support pointer dragging and keyboard
arrows, with sizes saved in this browser. Develop > Workspace resets panel sizes.
Display & keyboard settings provides larger editor text, higher contrast and
reduced interface motion. Existing dark/light themes are retained. Dialogs use
native focus containment, named controls, keyboard tab navigation and status
messages. A skip link focuses the main workspace. Responsive styles adapt the
tools to narrower displays; mobile execution remains separately unverified.

## Development checks

```text
npm run test:professional
node --test --test-concurrency=2 tests/*.test.mjs
npm run test:release
```

The existing native/compiler/VM tests remain authoritative for language behavior.
Release-specific results are recorded under `docs/validation/` and in
`MADADGAR-RELEASE.json`. Statuses describe executed checks only.
