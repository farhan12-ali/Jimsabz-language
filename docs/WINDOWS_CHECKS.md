# Windows verification still required

The supplied CLI and GUI are cross-compiled Windows x64 PE executables. This environment verifies their format but cannot execute Windows applications. Native compiler/runtime behavior is tested on Linux, and the Studio interface is tested in Chromium.

On Windows 10/11 x64, verify:

1. Extract the complete archive, launch Start-Studio.cmd, and confirm Studio opens in Edge/Chrome with no missing files.
2. Run `budhai = "Farhan"` and confirm a separate console window shows the one-line output. Close the console and confirm the editor remains open. Enter two numbers with `budh(...)` and confirm their sum.
3. Open a local folder, edit its source, and use Save file. Confirm the on-disk contents changed.
4. Create blank 2D and 3D projects. Add your own object, run, test keyboard controls, pause and Stop.
5. Ask the local agent for a supported request; confirm it creates a new source file without changing existing files.
6. Export .jimsabz, folder ZIP, JBC2 and .exe. Move the standalone executable to a clean folder/computer and run it. Check terminal input, native graphics, supplied PNG/BMP/JPG/OBJ/WAV assets and saved progress.
7. Verify launcher cleanup after the browser tab is closed (90-second heartbeat timeout) and relaunch after closing the launcher.
8. Run examples/classes_and_inputs.jimsabz. Try several counts, confirm total/average, then edit its field defaults and methods. Check a deliberate type error in the 3D view.
9. Check high-DPI display, browser file picker behavior and keyboard shortcuts.

Source and unsigned executables are provided for review. This is a development release, not a completed Windows acceptance test.
