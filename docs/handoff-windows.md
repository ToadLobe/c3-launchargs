# Handoff: Windows 11 agent (Opus)

Paste everything below the line into a Claude Code session opened on the `c3-launchargs` repo on the Windows 11 machine.

---

You're continuing work on **Launch Arguments** (`PabloGalbraith_LaunchArgs`), a Construct 3 plugin that exposes an exported desktop game's command-line arguments. Read `CLAUDE.md` first for the architecture, ACEs and parsing rules. This session's job is to make the **Windows WebView2** path work end to end, then write a handoff for a Linux agent.

## What already exists (scaffolded on macOS)

- `construct/`: the complete addon. Editor scripts, runtime (`c3runtime/instance.ts` fetches args with one async `get-args` message at load and caches them), ACEs, lang strings. No native binaries are bundled yet.
- `construct/c3runtime/argparse.ts`: pure parser. `npm test` runs 16 passing unit tests with Node's built-in runner (Node 22.18+). The runtime is TypeScript: run `npm install` once, then `npm run build` type checks, bundles and packages it.
- `extension/`: C++ wrapper extension built from Scirra's `wrapperExtensionPlugin` sample. `WrapperExtension.cpp` holds the `get-args` handler and a `GetProcessArgs()` for each platform. The Windows version uses `GetCommandLineW()` + `CommandLineToArgvW()` + `WideToUtf8()`. The VS project's `TargetName`s are already renamed to `LaunchArgs_<arch>.ext`.
- **Verified on macOS:** the universal dylib builds (`scripts/build-macos.sh`), exports `WrapperExtInit`, and a native harness got correct argv out of `GetProcessArgs()`, including arguments with spaces and quotes.
- **Not verified anywhere:** that the addon loads in the Construct editor, that the extension loads in a real export, and the browser-preview URL fallback.

## Wire protocol (keep both sides in sync)

- Component ID `pablogalbraith-launchargs`: `RegisterComponentId()` in the C++ and `COMPONENT_ID` in `instance.ts`.
- JS → C++: async message `get-args`, no parameters.
- C++ → JS response: `exe` (argv[0]), `raw` (full command line), `argc` (number of args after argv[0]), and `arg0`…`arg{argc-1}` (strings).

## Tasks, in order

1. **Build the DLL.** Open `extension/WrapperExtension.sln` in Visual Studio 2022 and build Release x64. Add x86 and ARM64 if the toolchains are installed. Fix any compile errors. `<shellapi.h>` and `#pragma comment(lib, "shell32.lib")` are new compared with the sample. Check the vcxproj still lists only `WrapperExtension.cpp`, `Utils.cpp`, `dllmain.cpp` and `pch.cpp`, since the sample's file list was kept.
2. **Bundle it.** Copy `LaunchArgs_x64.ext.dll` (and any others) into `construct/`. Set `built: true` for it in `construct/plugin.js`. Confirm the `AddFileDependency` platform strings against the Construct addon SDK docs. `windows-x64`, `windows-x86` and `windows-arm64` come from the SDK sample. The `macos-universal` string is a guess, so if you find the correct value, fix it.
3. **Load the addon in Construct.** Package it (`npm run build`; see CLAUDE.md → Packaging) or use Construct's developer-mode addon loading. Fix anything the editor rejects, such as schema errors, lang key mismatches or ACE param issues. The ACE and lang JSON have only been syntax-checked, never loaded by Construct.
4. **Test a real Windows WebView2 export.** Also check the TypeScript API: in a TypeScript project, confirm `scripts/ts-defs/plugins/` gets `ILaunchArgsInstance.d.ts` and that `runtime.objects.LaunchArguments.getFirstInstance()` is typed, and that an export with Advanced minification still finds `hasFlag`/`getValue` from a project script. Make a small test project with a Text object that prints `Source`, `ArgCount`, every `ArgAt(i)`, `RawCommandLine` and `ExecutablePath`, plus a couple of `HasFlag` / `ArgValue` checks. Save it as `test-project/LaunchArgsTest.c3p` in the repo. Export for Windows WebView2 and run it from a terminal with cases like:
   - `--level=3 --fullscreen save1.json`
   - `--name "two words" -abc -- --literal`
   - `--offset -5`
   - no arguments
   - non-ASCII input, e.g. `--name=Zoë`, to check the UTF-8 round trip
5. **Resolve the open risk.** Find out whether the WebView2 wrapper adds, strips or rewrites any arguments, for example its own Chromium switches, before `GetCommandLineW()` sees them. If the wrapper injects arguments, decide whether to filter them in C++ or JS, and document the decision in CLAUDE.md. Also check whether `IApplication` in the export's SDK version exposes the command line in a better way. The SDK v2 header in `extension/IApplication.h` doesn't.
6. **Check the browser-preview fallback.** With the `URL query fallback` property on, preview in the browser and add `?level=3&fullscreen` to the preview URL. `instance.ts` reads `globalThis.location.search`. In worker mode that's probably the worker script's URL, not the page's, so it may come back empty. If so, either fix it (a DOM-side handler is likely needed; see Construct's `domMessagingPlugin` SDK sample) or document it as DOM-mode-only. Don't spend long on this. It's a convenience feature.
7. **Update `CLAUDE.md`**: the platform status table, anything learned in steps 4–6, and the confirmed packaging steps.
8. **Commit** your work on a branch with a clear message. Don't commit build output (`.gitignore` covers the usual VS folders). Do commit the built `.ext.dll` files in `construct/`, because the addon ships them. Ask the user before pushing.
9. **Write `docs/handoff-linux.md`**: a handoff prompt in the same style as this file, for an Opus agent on the user's Linux machine. It should cover:
   - the current state: what's verified on Windows and macOS, and what isn't
   - building the `.so` with CMake (`extension/CMakeLists.txt` already drops the sample's GTK dependency and names the output `launchargs_x64.ext.so`)
   - bundling it: `built: true` in `plugin.js`, then `npm run build`
   - testing a Linux CEF export with the same argument cases, reusing `test-project/`
   - the Linux-specific open question: confirm the extension runs in the CEF **browser (main) process**, so that `/proc/self/cmdline` holds the game's arguments and not a CEF subprocess's. Also check whether the launcher script or CEF adds its own switches.
   - finally, updating CLAUDE.md and committing, then asking the user before pushing

## Constraints

- **Never change** the plugin ID `PabloGalbraith_LaunchArgs` or the component ID.
- Keep the C++ minimal. Parsing belongs in JS, where it's unit tested, and any new parsing behaviour gets a test in `tests/argparse.test.ts` first.
- If something in this note turns out to be wrong, trust what you observe and correct the note's successor (`handoff-linux.md`) and CLAUDE.md.
