# Studio 0.10.0 verification

Native compiler 0.8.0 and language v3.0 preview retain the C++ stack VM, existing game runtime and JBC2 support; new features use JBC3.

- Native feature acceptance: **58/58** source/bytecode/negative paths from the shared fixture catalog.
- Browser feature/interoperability acceptance: **36/36** cases, including browser-produced JBC3 running in the native VM.
- Existing checks: native CLI 72, native runtime 15, browser 92, language 42, presentation 25, report/voice/theme 25, flexible agent 25, files 26, compiler journey 17, run window 9 and writing 6 passed. Counts overlap across execution backends; they are not unique language features.
- Debugger: step into, over, out and breakpoints passed against the real VM. Run-window authentication/command forwarding and late pause-state restoration are tested. The native JSON debugger produced five valid pause events, a nested call stack and unchanged program output.
- Runtime memory/async harness passed with AddressSanitizer and UndefinedBehaviorSanitizer. It exercises escaping mutable closures, 3,000 cyclic object/array graphs, VM teardown and game tasks driven by simulation ticks. LeakSanitizer cannot run under this executor's ptrace; independent weak-reference checks confirm tracked environments/objects expire after teardown. This does not establish a general leak-free or hard real-time guarantee.
- Chromium UI: opened v3 examples, paused at entry, set a source breakpoint, inspected Dog objects through base/interface references, stepped into the overriding method and continued to woof/Rex output. Async scheduling printed 16 in the separate run window.
- Windows x64 console runtime and GUI launcher were rebuilt with MinGW. Their execution on Windows remains unverified here. Source, Linux binary, Windows binaries, examples, tests and library/debugging contracts are included.

See V3-RELEASE.json for version axes and binary hashes, V3-LANGUAGE.md for exact implemented APIs and remaining limits, and tests/v3-cases.json for source programs, expected output and negative cases.
