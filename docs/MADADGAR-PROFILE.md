# Local Code Madadgar implementation profile — Studio 0.19.0

This profile describes the actual local agent and takes priority over generic
capability claims in the creator brief. The brief targets v2.5; the package
retains the native C++ compiler/runtime 0.8.0, stack VM, browser compiler/VM,
JBC2/JBC3 metadata and implemented v3 preview. V3-LANGUAGE.md describes the
preview, and LANGUAGE.md describes the retained v2.6 baseline. Existing programs
are not silently downgraded.

## Language facts

- `.jimsabz` is source; `.jbc` is compiler bytecode.
- `adad` is a checked signed 64-bit integer; `dec` is a finite decimal value;
  `lafz` is text; `isharo` is Boolean (`ha` / `na`). `isharo` is not a character
  type in this implementation.
- Input is `budh("Prompt: ")`; output is `budhai expression`, `budhai(expression)`
  or `budhai = expression`. `budha` remains a compatibility output alias.
- Functions use `kam name(adad value) -> adad { wapas value }`.
- Dynamic arrays use `qatar adad values = []`, `values.joryo(value)`,
  `values.lambai`, indexing and `gin value andar values { ... }`.
- The actual seven phases are lexical analysis, syntax analysis, AST,
  semantic analysis, code generation, assets and runtime. Compilation alone
  leaves runtime Ready/Not Run.
- The v3 guide documents inheritance, interfaces, generics, closures, named and
  variadic arguments, collections and cooperative tasks. These are preview
  contracts, not a claim about an older v2.5 specification.

## Built-in local agent

Code Madadgar is ready when Studio opens. Its local trained intent classifier,
parameterized code generators, language question/answer data, versioned lexical
retrieval and compiler-driven actions do not require an external inference
service, account, API key or model installation. The native launcher has no
model-server proxy. Provider selection and connection settings have been removed.

The bundled classifier is trained on 380 requests with 117 held-out requests
from the included 497-target curriculum. It supports 15 generator intents:
marks, percentage, local login, output, input, sum, conditions, loops, functions,
arrays, a 2D player, a 3D scene, 2D racing, numeric statistics and classes/objects.
Raw classifier accuracy on this expanded curated evaluation is 100/117 (85.5%).
The compiler-checked request planner, spelling normalization and explicit
requirements routing are separate from that raw classifier score. The training run was performed for Studio 0.14.0 and the classifier is reused
unchanged in 0.18.0; chats and attachments do not automatically train it.

Simple percentages honor the requested count, including “two inputs of marks”.
Two subject marks default to 100 each; obtained/total wording selects a ratio
calculator instead. Assumptions are stated. Explicit arrays, functions, average,
maxima and runtime counts are preserved. Common typos and “could you please”
wrappers are normalized without changing quoted strings or fenced source.

Login requests generate a working, temporary local account flow with bounded
attempts. Gaming-hub requests add native 3D Home/Arena/Library/Profile gallery
views, guarded navigation and sign out. The compiler/runtime has console input,
keyboard events and HUD text; it has no masked-password or editable GUI form API.
The demo uses visible console passphrases and memory-only accounts. It is not
production authentication: password hashing, a persistent account service,
server-side sessions and complete playable hub games are not implemented.

Responses display complete generated source in expandable Copy code cards.
Selected new builders include exact-output example fixtures run in the real VM;
a failing example disables Apply. Otherwise runtime and tests remain Not Run.
Architecture questions produce an explanation without staging source.

Subject/input counts are parsed from requests or read at runtime. Arrays,
loops and functions support 7, 12, 1000 or runtime-selected counts; the language
is not restricted to three inputs. It is still a constrained local agent, not
an unrestricted generative language model. Unsupported code synthesis is
explained. Supplied Jimsabz source can use all supported compiler features.

Twenty-six local backend interfaces provide file reads/search, staged text edits,
rename/import rewrites, Trash, entry selection, project analysis, documentation
and example retrieval, plans/notes, compilation, bytecode inspection, run inputs
and expected-output tests. No external model selects or executes tools. The local
coordinator performs supported actions in sequence. Shell, Git, web research,
remote providers and arbitrary OS filesystem agent access are unavailable.

## Verification and repair

The local compiler and VM produce actual diagnostics, output and test results.
Automatic repair handles missing required imports, unmatched closing blocks
using lexer tokens, and the old input spelling. A candidate must compile in
the complete project snapshot before Apply is enabled. Unknown repairs are
explained; successful behavior or execution is never fabricated.

A draft cannot overwrite a changed live source snapshot. Review precedes Apply;
Undo preserves later unrelated project notes and refuses later source edits.
Private paths are excluded, and potential credentials are filtered from stored
conversation text and rejected in notes/drafts. This pattern-based filter is not
an exhaustive secret detector. Source paths remain relative to the workspace.

Execution uses isolated workers with an 8-second timeout plus VM limits.
There are at most 1,000 files / 32 MB of snapshot data, 2,000 supplied inputs,
60,000 output characters, 120 headless ticks and 20 expected-output/error cases
per test call. Runtime writes are discarded; networking is disabled. These
limits are not OS CPU/memory quotas. Native C++ execution, Windows behavior,
rendering, audio and frame rate require separate checks. The creator brief's
60 FPS, 300 entities, 500 particles, <64 MB and <50 ms remain targets until measured.

Knowledge references retain their source, version and exact source lines.
Retrieval uses BM25 plus deterministic token-hash vectors, not learned semantic
embeddings. Attached reports remain unverified requirements data. Existing PDF,
DOCX and speech adapters are retained; optional browser speech may use network.


## Studio 0.18 professional tools

PROFESSIONAL-0.18.0.md describes the current editor, recovery, test explorer,
local Git API, scene editor, release scripts and accessibility features.
A compositional numeric planner adds min/max, median, heapsort and search in
reusable multi-file projects, with compiler/VM sample verification. A calculator
builder checks arithmetic and zero division. These supplement the existing 15
classifier intents and do not constitute unrestricted model-based generation.
Git is available through explicit IDE controls on the configured local server;
the agent still has no shell or Git tool. The native compiler and Run window
implementation are retained. Windows execution and publisher signing remain
Not Run in this Linux development session.


## Compiler Factory (Studio 0.19.0)

Run Code opens the integrated Compiler Factory in the existing separate Run window. The real compiler produces six phase states and actual artifacts; the existing VM waits for the journey handoff or Run now. See COMPILER-FACTORY-0.19.0.md for controls, exact tree semantics, evidence limits and verification. The compiler grammar, analyzer and VM implementation are unchanged.
