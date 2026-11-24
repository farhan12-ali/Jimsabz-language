# Standalone Windows executable API — Studio 0.17.0

## Use the frontend

1. Open a `.jimsabz` source file in Studio.
2. Click **EXE** beside Build, or choose **Export → Standalone Windows app**.
3. Choose an output filename and click **Build & download .exe**.
4. The browser downloads the executable after validating the server checksum.
   **Download .exe again** remains available while the dialog is open.

The target is **Windows 10/11 x64**. The file includes the native Jimsabz runtime,
compiled bytecode, imported module code and referenced project assets. No separate
Jimsabz installation, GCC, Node.js, model server or API key is required to execute
it. Source file read/write operations keep the language's existing runtime rules.

For console programs, run the downloaded file from PowerShell to keep the output
visible after the program finishes:

```powershell
.\MyGame.exe
```

Games use the included native renderer. This release does not alter language
syntax or compile a different programming language.

## Run the local API

Install Node.js 20 or newer on the build server computer. Extract the complete
project, double-click **Start-Build-Server.cmd**, and open the address it prints:

```text
http://127.0.0.1:45426/
```

Or run:

```powershell
node api/server.mjs
```

This serves the existing frontend and build API on the same origin. It has no
external npm runtime dependencies. Keep the launcher window open while using it.
The original **Start-Studio.cmd** remains available. Its native server is retained;
choose **Build on this device** there, or use the new build-server launcher for API
export. The offline option retains the previous frontend packager.

The hosted IDE runs the same build service through its Worker backend. The frontend
uses a relative API URL, so no hardcoded external service URL or exposed credential
is needed. Existing private Site access is retained.

## API contract

`GET /api/build/health` returns the supported target, version and limits.

`POST /api/build/exe` accepts `Content-Type: application/json`:

```json
{
  "entry": "main.jimsabz",
  "filename": "Hello.exe",
  "target": "windows-x64",
  "files": [
    { "path": "main.jimsabz", "text": "budhai \"Hello from Jimsabz\"\n" }
  ]
}
```

A single-file request can use `source` instead of `files`. Additional source
modules use `{ "path": "modules/math.jimsabz", "text": "..." }`. Binary assets
use `{ "path": "assets/player.png", "base64": "..." }`. Folder records, browser
file handles, history and project notes are not sent by the frontend.

A successful response is `application/vnd.microsoft.portable-executable` with
`Content-Disposition: attachment`, `X-Artifact-SHA256`, `X-Build-Target`,
`X-Build-Version` and the embedded asset count. Artifacts are not cached or stored.

| Status | Meaning |
| --- | --- |
| 200 | Executable ready |
| 400 | Invalid project, path, filename, JSON or target |
| 403 | Invalid local Host or different-origin browser build |
| 405 / 415 | Wrong method or content type |
| 413 | Request, source or project exceeds a limit |
| 422 | Compilation failed; diagnostics include code, phase and source location |
| 429 | Another build is in progress; retry shortly |
| 503 | Trusted Windows runtime unavailable or checksum mismatch |
| 504 | Local isolated build exceeded its timeout |

PowerShell example against the local server:

```powershell
$buildBody = @{
    entry = "main.jimsabz"
    filename = "Hello.exe"
    source = 'budhai "Hello from Jimsabz"'
} | ConvertTo-Json
Invoke-WebRequest -Uri "http://127.0.0.1:45426/api/build/exe" -Method Post `
    -ContentType "application/json" -Body ([Text.Encoding]::UTF8.GetBytes($buildBody)) `
    -OutFile "Hello.exe"
.\Hello.exe
```

## Implementation and rebuilding

`api/build-service.mjs` calls the existing Studio compiler and executable bundler.
It embeds the compiled program and referenced assets into the trusted PE64
runtime in `studio/assets/jimsabz-runtime.exe`. The native runtime executes the
embedded JBC2/JBC3 bytecode directly. API builds do not execute submitted code.

The Windows runtime is included. To rebuild it with GCC/MinGW-w64, run the existing
**build-windows.cmd** in a MinGW x64 shell, or use CMake with its MinGW target.
The project's build flags use static C++/GCC runtime linkage. Replace the bundled
runtime with the rebuilt `build/jimsabz.exe` and update `RUNTIME_SHA256` in
`api/build-service.mjs` to the new file's SHA-256 before serving it. The hash guard
prevents an unnoticed or incompatible template replacement. The current imported
DLL list contains only Windows-provided system libraries.

The optional Worker bundle uses `api/worker.mjs` and `scripts/build-worker.mjs`.
Its build dependency is esbuild; supply the hosting manifest for the deployment
account, remove its static-only mode, then run the build script. Static frontend
files are compressed into the Worker so the frontend, local agent assets, runtime
and API remain available together. No runtime API key is embedded in source.

## Limits and verification

The API accepts up to 128 files, a 12 MiB JSON request, 8 MiB decoded project
content, 2 MiB total source and 512 KiB per source file. Paths must remain within
the project and use valid Windows names. Only referenced assets are embedded.
The local server accepts one build at a time, isolates compilation in a worker
thread with a memory limit, and terminates it after 15 seconds. Larger projects
can use the retained local export where supported by the existing packager.

Executed checks:

- **26** API, real PE/trailer, typed module/input, exact asset embedding, native
  bytecode execution, standalone native Linux harness, request/timeout, checksum
  and actual HTTP integration checks.
- **94** existing compiler, VM, agent, export and native interoperability checks.
- **9** existing separate-window lifecycle/bridge checks.
- **8** checks against the actual compiled Worker frontend/API artifact.

The browser downloaded `percentage.exe` through both API and local export. Both
were **4,263,310 bytes**, with identical SHA-256
`e7cd1740dc7b0d661fb75b759d7bf359f14d67239023a2a55bc5bb30d4e06f1a`.
The downloaded executable's embedded program ran in the existing native Linux VM
with inputs 80 and 90 and printed total 170 and percentage 85%. The PE64 header,
trusted runtime prefix and binary payload were verified. 84 protected compiler,
VM, language, native, training and agent files remained byte-for-byte unchanged.

**Windows execution: Not Run.** Neither a Windows machine nor Wine was available.
The tests verify packaging, native payload behavior and the download flow; they
are not a substitute for launching the final PE executable on the target Windows
version. No performance, FPS or memory benchmark is claimed.
