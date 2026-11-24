# Presenting Jimsabz

Jimsabz is a Roman Sindhi-inspired high-level language with a lexer, parser, typed AST, semantic analyzer, JBC2 bytecode generator and virtual machine. Studio provides the editor, separate Run window, compiler visualization and file management.

## Rehearse the working project

1. Extract the whole desktop ZIP. On Windows, open **Start-Studio.cmd**. The hosted Studio is also available if you prefer it.
2. Choose **Language examples** in the sidebar, then **Check all examples**. The result is calculated by compiling and running the seven programs with sample inputs.
3. Select **Open demo folder**. Studio creates a separate program folder containing the seven editable `.jimsabz` files and opens `07_marksheet.jimsabz`.
4. Press **Run code**. Enter each answer separately in the Run window: `Farhan`, `3`, `90`, `80`, `70`.
5. Show the result: total **240**, percentage **80%**, average **80**, grade **B**.
6. Run again with another subject count. The count is read at runtime; it is not fixed to three subjects.
7. Open **3D compiler**, select a phase and explain its real tokens, syntax tree, names/types or bytecode. Running the checks alone does not execute the user's current program.

Each subject is out of 100 by default. To demonstrate configurable object fields, change `naon Marksheet(naalo)` to `naon Marksheet(naalo, 50.0)`, then enter two marks, 40 and 45. The total is 85, percentage 85%, average 42.5 and grade B.

## Point to the actual language constructs

| Feature | What to show |
| --- | --- |
| Variables and types | `lafz naalo`, `adad tadaad`, `dec ang`, `isharo` in the variables example |
| Input/output | `budh(...)` reads an answer; `budhai` prints a result |
| Conditions | `jey`, `na_ta jey`, `na_ta` in the grading function |
| Loops | `gin` reads the requested subject count; `wori` repeats invalid input; foreach totals the array |
| Functions | `kam darjo(...) -> lafz` and `wapas` |
| Arrays | `qatar dec nishan`, `.joryo(...)`, `.lambai` |
| Objects | `qism Marksheet`, `naon Marksheet(...)`, methods and `paan` |

Grades use your strict rules: **>90 A, >70 B, >50 C, otherwise F**. Exactly 90 is B; exactly 70 is C; exactly 50 is F. Use `>=` if you want inclusive thresholds instead.

## Show a useful compiler error

Create a separate file with:

```jimsabz
adad nishan = "text"
budhai nishan
```

Open the 3D compiler. Semantic analysis rejects assigning text to a whole-number variable. Later phases are blocked. Change the value to `75` and compile/run again.

## Windows rehearsal

Run **Check-Presentation.cmd** after extraction. It runs the seven supplied sources through the bundled native Windows runtime, compares the output to fixtures and prints PASS/FAIL plus a log directory. No Node.js or Python is needed for this check. This command must be executed on Windows; Linux/browser results do not constitute a Windows execution test.

Save the files or export the folder after editing. Studio's working copies are browser-local; workspace rename/delete actions leave original disk files unchanged. Trash supports restoring deleted working copies.

## Describe the scope accurately

The project demonstrates working high-level language features and real compiler phases. It is a development release, not a production-readiness certification. Class inheritance and custom constructor functions are not implemented. Jimsa uses a local classifier, language references and compiler-checked code builders. It is not a general code-writing model. Game projects start blank; the presentation examples are ordinary programs, not prebuilt games.
