# Handoff: Linux agent (Opus)

Paste everything below the line into a Claude Code session opened on the `c3-launchargs` repo on the Linux machine.

---

You're continuing work on **Launch Arguments** (`PabloGalbraith_LaunchArgs`), a Construct 3 plugin that exposes an
exported desktop game's command-line arguments. Read `CLAUDE.md` first for the architecture, ACEs, parsing rules and
the Windows findings. This session's job is to make the **Linux CEF** path work end to end.

## Current state

- **Windows WebView2: verified.** `LaunchArgs_x64.ext.dll` works in a real x64 export. `Source` is `wrapper`, and
  `ArgCount`, `ArgAt`, `ArgValue`, `PositionalAt`, `HasFlag`, `RawCommandLine` and `ExecutablePath` are all correct
  for every test case below, including `--name=Zoë` (UTF-8). The TypeScript script API (`hasFlag`, `getValue`,
  `args`, `positionals`, `optionNames`, `source`, `isAvailable`, `rawCommandLine`) works too, in an unminified
  export. The wrapper adds no arguments: its Chromium switches go to the separate WebView2 browser processes.
  `LaunchArgs_x86.ext.dll` is built and passed a native harness but hasn't been run in an x86 export. ARM64 isn't
  built.
- **macOS:** `launchargs.ext.dylib` builds and passed a native harness. It's marked `built: true` but hasn't been
  run in an export.
- **The addon loads in the Construct editor**, installs from the packaged `.c3addon`, and exports. The platform strings
  in `plugin.js` are confirmed against the SDK docs (`linux-x64`, also `linux-arm` and `linux-arm64` if you build
  those).
- **Not verified anywhere:** Advanced minification keeping the public script API names, and the browser-preview
  URL fallback (`instance.ts` reads `globalThis.location.search`, which in worker mode is probably the worker's URL
  and empty).
- **Linux:** the `.so` has never been built.

## Wire protocol (keep both sides in sync)

- Component ID `pablogalbraith-launchargs`: `RegisterComponentId()` in the C++ and `COMPONENT_ID` in `instance.ts`.
- JS → C++: async message `get-args`, no parameters.
- C++ → JS: `exe` (argv[0]), `raw` (full command line), `argc` (args after argv[0]), `arg0`…`arg{argc-1}`.

## Tasks, in order

1. **Build the `.so`.** `cmake -S extension -B build && cmake --build build` produces
   `build/lib/launchargs_x64.ext.so`. `extension/CMakeLists.txt` already drops the SDK sample's GTK dependency. Fix
   any compile errors. Check that `WrapperExtInit` is exported (`nm -D --defined-only`) and that `ldd` shows nothing
   unusual. If libstdc++ version requirements look like a portability risk, consider `-static-libstdc++
   -static-libgcc`; the Windows DLLs link their runtime statically for the same reason.
2. **Harness-test it.** Write a tiny C++ program, kept out of the repo, that `dlopen`s the `.so`, calls
   `WrapperExtInit` with a fake `IApplication` (implement every pure virtual in `extension/IApplication.h`), sends
   `OnWebMessage("get-args", 0, nullptr, 42)`, and prints each `SendWebMessage` parameter with a hex dump of
   strings. Run it with the argument cases below.
3. **Bundle it.** Copy it to `construct/launchargs_x64.ext.so`, set `built: true` for it in `construct/plugin.js`,
   then `npm install` (once) and `npm run build`. Check that the `.c3addon` in `dist/` lists the `.so` in its
   `addon.json` `file-list`.
4. **Test a Linux CEF export.** The user installs the new `.c3addon` in Construct (**Menu → View → Addon manager**)
   and exports [tests/project.c3p](../tests/project.c3p) for **Linux**. Ask the user to do the editor steps and give
   you the unzipped export path. In that project:
   - The Text object has BBCode on, so the `[...]`-wrapped `ArgAt` values are hidden. Ask the user to turn BBCode off
     on the Text object before exporting.
   - The Repeat event runs every tick, so the `ArgAt` lines repeat. Only the first block matters.
   - If you can, also ask for an export with **Minify mode: Advanced**, and check that the script API still works
     (see the `main.ts` note below).

   Run the export from a terminal with each case, and read the screen with a screenshot tool:
   - `--level=3 --fullscreen save1.json` (`save1.json` becomes `--fullscreen`'s value; that's the documented
     `--flag word` rule, not a bug)
   - `save1.json --name "two words" -abc -- --literal`
   - `--offset -5`
   - no arguments
   - `--name=Zoë`

   Expected: `Source: wrapper`, `ArgCount` equal to the number of arguments, `Raw` and `Exe` sensible, and
   `--literal` as a positional and not a flag.

   The project's `main.ts` writes to the Text object before the events overwrite it, so its output isn't visible. To
   check the script API, change it to run on `afterprojectstart`, prepend to the text after a short `setTimeout`, and
   print arrays with `.join(" | ")`, because `JSON.stringify` brackets are eaten by BBCode.
5. **Resolve the Linux open question.** Confirm the extension runs in the CEF **browser (main) process**, so
   `/proc/self/cmdline` holds the game's arguments and not a CEF subprocess's (`--type=renderer` and so on). Also
   check whether the launcher script or CEF adds its own switches to the main process's argv. Compare
   `cat /proc/<pid>/cmdline | tr '\0' ' '` for the game's processes with what the plugin reports. If extra
   switches do appear, filter them in C++. Only filter switches the wrapper is known to add, and put any parsing in
   JS with a test in `tests/argparse.test.ts` first. Document the decision in CLAUDE.md.
6. **Browser preview (optional, keep short).** With the `URL query fallback` property on, preview in the browser
   with `?level=3&fullscreen` added to the URL. Try it with **Project properties → Advanced → Use worker** set to
   *Yes* and to *No*. If it's empty in worker mode, either add a DOM-side handler (see Construct's
   `domMessagingPlugin` SDK sample) or document it as DOM-mode-only.
7. **Update CLAUDE.md**: the platform table (Linux row and anything learned), and the Linux build steps you
   confirmed.
8. **Commit** on a branch with a clear message, including `construct/launchargs_x64.ext.so` but not `build/`. Ask
   the user before pushing or merging.

## Constraints

- **Never change** the plugin ID `PabloGalbraith_LaunchArgs` or the component ID.
- Keep the C++ minimal. Parsing belongs in JS, where it's unit tested.
- Rebuilding the Windows DLLs or the macOS dylib isn't possible on Linux; leave those binaries as they are.
- If something here turns out to be wrong, trust what you observe and fix CLAUDE.md.
