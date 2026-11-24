# Local Code Madadgar 0.12.0 — executed validation

**402 automated checks passed.** The local agent suite uses the actual included classifier and compiler/VM, with no scripted external-model replies.

| Suite | Passed | Evidence |
| --- | ---: | --- |
| Built-in local classifier, generation, repairs, drafts, tools and fixtures | 47 | [Log](validation/local-agent-core.txt) |
| Real isolated worker execution and exact reference evidence | 6 | [Log](validation/local-agent-workers.txt) |
| Native local-only host and removed inference endpoints | 8 | [Log](validation/local-agent-host.txt) |
| Native compiler/VM CLI regressions | 72 | [Log](validation/local-agent-native.txt) |
| Studio compiler/VM, local generators and exports (Node) | 87 | [Log](validation/local-agent-browser.txt) |
| Files, folders, Trash, imports and export | 26 | [Log](validation/local-agent-files.txt) |
| Marks, report, voice and theme adapters | 24 | [Log](validation/local-agent-v4.txt) |
| Flexible generators and Sindhi numbers | 24 | [Log](validation/local-agent-v5.txt) |
| Language baseline | 42 | [Log](validation/local-agent-language.txt) |
| v3 preview and native bytecode interoperability | 36 | [Log](validation/local-agent-v3.txt) |
| Compiler journey and evidence | 17 | [Log](validation/local-agent-journey.txt) |
| Separate Run-window lifecycle and bridge | 9 | [Log](validation/local-agent-run.txt) |
| Debugger VM modes | 4 | [Log](validation/local-agent-debugger.txt) |

## Actual browser checks

The updated IDE was opened through the supported managed preview. The local agent was ready without model selection, a connection test or an external service.

In a separate Local-Agent-Check workspace, the actual bundled classifier generated an array/function program for seven inputs. The real browser compiler accepted the draft. Review displayed the source and program entry; Apply created the reviewed file and opened it in the editor. Running it through the local agent with [1,2,3,4,5,6,7] produced Kul: 28 and Ausat: 4. An explicit exact-output test then reported 1 passed and 0 failed. These are browser observations in addition to the automated totals above.

## Builds and limits

- Linux native host/compiler rebuilt successfully and passed native CLI/host checks.
- Windows GUI and console PE x64 executables rebuilt with the existing toolchain. They were not executed on Windows.
- Agent imports resolve and new/changed JavaScript parses successfully.
- The native launcher no longer exposes the inference proxy or model-list route. The local classifier and references are served from the package.
- A generation check supplied the included model and made every fetch call fail; local generation still compiled successfully.
- The 348-training / 105-held-out classifier is reused. This release did not run new training or measure new model accuracy.
- Local worker runs test the Studio compiler/VM; native CLI and native bytecode interoperability are separate checks.
- Optional speech recognition may use the browser speech service. Typed agent requests remain local.
- Headless initialization/ticks do not certify graphics, audio, controls, FPS, Windows behavior or performance targets.
- See MADADGAR-PROFILE.md for the supported local generators, repair scope, file protections and resource limits.
