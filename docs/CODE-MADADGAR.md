# Code Madadgar — the built-in local Jimsabz agent

## Start

1. Extract the complete ZIP.
2. Run `Start-Studio.cmd` on Windows 11.
3. Open **Code Madadgar** and type a request. The agent is ready immediately.

The included classifier, generators, documentation and compiler/VM perform the
agent work locally. There is no model-server setup, provider selection, external
AI API, account, API key or downloaded language model. Once the ZIP is on your
computer, the agent does not need internet. Optional browser speech recognition
may use the browser's speech service; typing always remains available.

## Requests to try

| Request | Local behavior |
| --- | --- |
| `Write a simple program that takes two inputs of marks and their precentage` | Exactly two subject inputs; percentage out of 200, with a stated assumption |
| `Read obtained marks and total marks and calculate percentage` | Two-value ratio calculator with validation |
| `Build a gaming hub with local login and 3D UI architecture` | Complete local demo project, native 3D gallery navigation and explicit production gaps |
| `Explain the gaming hub architecture` | Architecture answer without modifying project files |
| `Write a program that prints "Farhan"` | Generate checked Jimsabz source as a new draft |
| `Write a marksheet for 7 subjects with average` | Functions, arrays, marks, percentage, average and grade |
| `Change to 12 subjects with average` | Adapt the previous generator request and preserve old source |
| `Write a marksheet that asks how many subjects at runtime` | Let the program's user choose its input count |
| `Sum 1000 numbers and calculate their average using an array` | Reusable array/function/loop code with the requested count |
| `Create a class with methods to process many numeric inputs` | Checked class, array and method example |
| `Explain arrays in Jimsabz` | Grounded language help and retrieved sources |
| `Explain this code` | Inspect active source and describe its constructs with compiler evidence |
| `Check my code` | Run lexer, parser, AST, semantics, bytecode and asset checks |
| `Fix my code` | Attempt one supported, compiler-verified repair in a draft |
| `Analyze my project` | Summarize the actual entry, source paths and line counts |
| `Inspect bytecode` | Display actual stack instructions for the active source |
| `Create a controllable 2D player` | Generate the supported player starter |
| `Create a basic 3D scene` | Generate the supported 3D starter |

For interactive input and graphics, use the ordinary **Run code** button. For
an agent-run fixture, provide the inputs explicitly:

```text
Run my code with inputs: ["7", "5"]
```

For a test, state the expected output exactly, including prompts and newlines:

```text
Test my code with inputs: ["7", "5"] expected output: "12\n"
```

The test example expects a program that reads two values without printing prompts.
The agent reports actual output, mismatches and input errors. It never invents
missing input values or marks an unexecuted test as passed.

You can also supply arbitrary supported Jimsabz source, including v3 features:

````text
Use this source as identity.jimsabz:
```jimsabz
kam identity<T>(T value) -> T { wapas value }
budhai identity(42)
```
````

The supplied source is compiled in the complete project snapshot. A compiler
failure leaves a draft with Apply disabled. To explicitly replace the active
source rather than create a new file, begin with `Replace my current program`.

## Review and controls

Generated source is visible directly in the response. Expand a filename and use **Copy code**, or choose **Review changes**. Small programs open automatically.

Generated files and repairs stay in an isolated draft. **Review changes** shows
the exact text changes, entry changes and real verification status. **Apply
changes** checks that the live project still matches the original snapshot.
A stale draft cannot overwrite subsequent source edits. **Reject changes**
preserves the live project. **Undo agent edit** restores the last apply while
its resulting files still match. Deleted draft files go to the existing Trash.

**Knowledge** searches versioned references. **Project notes** and **History**
inspect or clear the current workspace's notes and conversations. **Activity**
shows actual local actions. **Stop** cancels the request and terminates an active
execution worker. **Retry** repeats the last request locally.

Source changes affect the Studio browser working copy. Use Save file or Export
folder for a disk copy. Notes and chat history are browser workspace metadata;
they are not included in a normal source-folder export. Pending in-memory drafts
are lost on tab reload; already-saved source remains intact.

Reports can be attached as PDF, DOCX or text. Supported requirements generate a
reviewed project subfolder; the included PROJECT-PLAN.md identifies remaining work.
A generated starter is not a claim that every report requirement is implemented.

## Automatic repair scope

The local repair rules handle a compiler-reported missing library import,
unmatched closing blocks detected through lexer tokens, and legacy input
assignments that need `budh(...)`. Each candidate is checked against the real
complete-project compiler. Unsupported diagnostics are explained with their
source file and location; the agent does not invent a repair. Logic changes
need a specific expected behavior and a supported generator or supplied code.

## What was trained

The shipped model is a multinomial Naive Bayes intent classifier with a token
continuation model. Its included corpus has 497 compiler-validated targets:
380 training requests and 117 held-out requests, across 15 supported generator
intents. This release runs new local training. Raw classifier accuracy is
100/117 (85.5%) on the expanded curated set. Requirements routing and spelling
normalization are separate from that score. This does not measure unrestricted
programming skill; no general generative language model was fine-tuned.

English and existing Roman Urdu/Sindhi request routing are included, along with
implemented language help and number vocabulary. The classifier cannot freely
invent an arbitrary application or game from any prose request. Unsupported
requests explain the available alternatives. The Jimsabz compiler itself retains
its existing language features. Source in a jimsabz code block can use those
features even when there is no dedicated natural-language generator.

The trainer, curriculum and evaluation files remain in `training/`. Chat and
attached reports do not silently retrain the model.

## Architecture and limits

`local-agent.mjs` coordinates the local request router, existing trained model,
generators, retrieved references and real tools. `tools.mjs` validates 26 local
backend interfaces; there is no external tool-calling model. `changes.mjs`
implements isolated drafts, path checks, diffs, stale checks and undo.
`execution.mjs` and its worker run the actual Studio compiler and stack VM.
`retrieval.mjs` combines BM25 with deterministic lexical hash vectors; it is not
a learned semantic embedding service. `panel.mjs` provides a single local agent
interface, without a provider/mode selector or model connection settings.

Execution workers have an 8-second outer timeout plus existing VM instruction
and call-depth limits. A snapshot accepts up to 1,000 files and 32 MB of data.
A run accepts up to 2,000 inputs, 60,000 output characters and 120 headless game
ticks. A test call accepts 1–20 explicit expected-output/error cases. Runtime
file writes remain in the isolated snapshot and are discarded. Agent runs have
no LAN access. Headless game checks do not measure graphics, sound, controls,
FPS or Windows behavior. These are application limits, not OS resource quotas.

The native C++ launcher serves local static files and startup/heartbeat routes.
It has no external inference proxy or model-server connection endpoint.
The agent executes the Studio browser compiler/VM; native compiler/VM execution
and bytecode interoperability are checked separately by repository tests.

## Developer checks

```text
node scripts/build-madadgar-knowledge.mjs
node tests/madadgar.test.mjs
node tests/madadgar-worker.test.mjs
```

The agent suite uses the actual bundled classifier and actual compiler/VM. Its
local-generation network test rejects all fetch calls while generation runs.
There are no scripted external model replies in the local agent suite.
See MADADGAR-VALIDATION.md for executed results and platform limits.

## Local login boundary

Create a temporary user and invented passphrase in the separate Run console,
then sign in with those values. Passphrases are visible. Accounts are not saved
to disk. A failed login never initializes the 3D hub. A successful login opens
Home; click Game and use 1 / 2 / 3 to select sections, H for Home and L to sign
out. Signed-out sessions cannot navigate back in; Run again resets the demo.
The sections are 3D gallery previews, not complete games. A real account service,
password hashing, protected server sessions and graphical password fields remain
separate implementation work.
