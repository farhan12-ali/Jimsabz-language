# Code Madadgar interface — Studio 0.13.0

This release applies the supplied reference to the agent panel only. The rest of
the IDE retains its current layout. The screenshot’s embedded game preview is
not introduced: interactive program output still opens in its separate window.

## Interface

- Purple header, welcome banner and bundled SVG robot mascot.
- Chat, Tools, Projects and Learning tabs with keyboard navigation.
- Conversation avatars, welcome card, five quick actions and a compact composer.
- Existing local generation, reports, voice, knowledge, notes, history,
  activity, draft review, Apply, Reject, Undo and Retry remain available.
- Tools → Run program delegates to the existing Run code control.
- Dark and light palettes; existing responsive layout is retained.

## Executed checks

| Check | Result |
| --- | --- |
| JavaScript parse checks for app and panel | Passed |
| Separate Run-window lifecycle/bridge suite | 9 passed |
| Built-in local agent suite | 47 passed |
| Real worker/reference evidence suite | 6 passed |
| Protected compiler/runtime/engine/native files compared with 0.12.0 | 57 unchanged |

Browser observations: all four tabs displayed their associated content;
ArrowRight changed Tools to Projects and updated keyboard selection. The project
card showed the current workspace and source count. Create a project opened the
existing project dialog and created an isolated Agent-UI-Preview workspace.
The Learning language guide and Tools knowledge search opened the existing
references.

In that isolated workspace, a typed request generated the two-number sum draft.
The actual compiler passed it. Review showed the full source; Apply selected
sum.jimsabz. Tools → Run program opened run.html in a second window, accepted
12 and 8 as separate inputs, printed 20, and reported Finished. No output was
embedded in the editor or agent panel.

Dark and light themes were inspected. At the observed desktop viewport, the
page and agent panel had no horizontal overflow and the mascot loaded.

## Change boundary

The modified application files are studio/index.html, studio/madadgar.css,
studio/agent/panel.mjs and the message/attachment presentation functions in
studio/app.mjs. studio/assets/madadgar-mascot.svg is new. Release notes and
metadata were updated. No compiler, VM, local engine, model, run-window,
native C++ source or native binary was modified or rebuilt.

The 402-check report in MADADGAR-VALIDATION.md is retained as historical
0.12.0 validation; it is not a claim that all 402 checks were rerun for this UI
release. The 62 targeted checks above were executed for this change. Windows
execution was not performed on this Linux host.
