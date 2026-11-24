# Code Madadgar 0.14.0 — requests and code answers

The two reported requests now produce compiler-checked Jimsabz source. Common
spelling mistakes and polite command wrappers are normalized in prose while
quoted output and fenced source are preserved. Counts, percentage mode, maxima,
averages, arrays, functions and follow-up updates are parsed separately from
raw intent classification.

## Marks and percentage

“Take two inputs of marks and their precentage” generates exactly two subject
inputs, each out of 100, with the assumption stated. 80 and 90 produce total
170 and percentage 85%. No name, grade or subject-count prompt is added.
Obtained/total wording instead uses obtained / total × 100. Invalid ranges,
zero totals and invalid numeric input are handled. Arrays, functions, runtime
counts, decimal maxima and averages remain available when requested. Full
marksheets and explicit grade rules retain their existing implementation.

## Login and gaming hub

The local demonstration creates a temporary account, limits sign-in attempts
and opens the native 3D hub only after a match. Main declares the graphical
views behind the login gate; auth and HUD state live in imported modules.
1/2/3 select Arena/Library/Profile gallery scenes, H returns Home and L signs
out. Signed-out sessions cannot navigate back into the hub. Architecture
questions explain the files and data flow without creating another program.
Reports can use the same login and percentage components with remaining work
recorded in PROJECT-PLAN.md.

This is not production authentication. Console passphrases are visible and
accounts last for one run. No real credentials are needed for the example.
Persistent account storage, password hashing, protected server sessions and
editable graphical login fields are not implemented. The 3D sections are
working gallery scenes, not full games.

## Code answers and verification

Responses show actual generated source in expandable cards with Copy code.
Small programs expand automatically. Drafts still need Review and Apply, and
stale source cannot be overwritten. Example fixtures from the new generators
run through the real Studio VM; failed fixtures disable Apply. Other requests
retain accurate Not Run statuses when no runtime test was executed.

252 checks passed across the eight current suites listed in MADADGAR-RELEASE.json
and docs/validation/professional-*.txt. The 36 new behavioral checks cover both
reported requests, paraphrases, numeric validation, dynamic/1000-element inputs,
follow-ups, login failures, sign-out guards, reports, offline generation and
native interoperability. The existing native compiler checked and executed
both new program families. All 55 protected compiler/runtime/core/native and
Run-window files match 0.13.0; no compiler or binary was changed or rebuilt.

Actual browser checks in an isolated Professional-Agent-Check workspace:
percentage source was visible and Copy code copied it; Review and Apply worked;
the separate Run window took 80 and 90 and printed 170 and 85%. The exact hub
request generated its modules, passed its example test, and was reviewed and
applied. A disposable demo account opened the rendered 3D Home view; key 2
changed it to Library. The architecture follow-up answered without edits.

## Local training and limits

The 497 compiler-validated curriculum targets are split into 380 training and
117 held-out requests. Actual local retraining completed; raw classification
was 100/117 (85.5%). That expanded evaluation differs from the earlier 105-item
set; the score is not a claim of improved general programming skill. The
normalized request planner is a separate deterministic layer. No external AI
service, API key or model server is required. Chats do not retrain the model.

Windows was not executed on this Linux host. Browser rendering was observed,
but no FPS, memory, audio or complete game-quality benchmark was measured.
