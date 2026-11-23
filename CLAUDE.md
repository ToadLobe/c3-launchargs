# Launch Arguments: a Construct 3 plugin

A Construct 3 plugin that reads the command-line arguments an exported desktop game was launched with.

```
MyGame.exe save1.json --level=3 --fullscreen
```

```
Launch Arguments: Has flag "--fullscreen"   → true
Launch Arguments.ArgValue("--level")        → "3"
Launch Arguments.PositionalAt(0)            → "save1.json"
```

Plugin ID: `PabloGalbraith_LaunchArgs` (never change it). Wrapper component ID: `pablogalbraith-launchargs`.

## How it works

The plugin's runtime code runs in the web sandbox and can't see the host process. A small native
[wrapper extension](https://www.construct.net/en/make-games/manuals/addon-sdk/guide/wrapper-extensions)
(`.ext.dll` / `.ext.dylib` / `.ext.so`) reads argv and returns it on one async `get-args` message
at startup. The bridge only carries string, number and boolean values, so the reply is flattened to
`argc`, `arg0`…`argN-1`, `exe` and `raw`, plus `titleArgs` on Linux (see below). All parsing happens in TypeScript
([argparse.ts](construct/c3runtime/argparse.ts)).

| Platform | Source of argv | Status |
|---|---|---|
| Windows WebView2 | `GetCommandLineW()` + `CommandLineToArgvW()` | x64 verified in a real export; x86 harness-tested; ARM64 not built |
| macOS WKWebView | `NSProcessInfo.arguments` (drops `-psn_*`) | Builds; harness-tested; not tried in an export |
| Linux CEF | CEF's global command line (`libcef.so`), filtered against the process title | x64 verified in a real export (CEF 147) |
| Browser preview | URL query (`?level=3&fullscreen`), if the property is on | Untested |

**Windows notes** (verified with a WebView2 x64 export, worker mode `auto`, minify off):

- The wrapper doesn't add or strip arguments. The extension DLL loads into the game's own `.exe`, so
  `GetCommandLineW()` is exactly what the player launched it with. The Chromium switches the wrapper uses
  (`chromium-args` in the export's `package.json`) and `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` go to the separate
  `msedgewebview2.exe` processes and never show up. No filtering is needed.
- `IApplication` (wrapper SDK v2, which this export uses) has no command-line accessor, so reading it from the OS
  stays the approach.
- Non-ASCII arguments round-trip as UTF-8 (`--name=Zoë`).
- The DLLs link the CRT statically, so they need nothing beyond `KERNEL32` and `SHELL32`.
- Testing tip: a Text object with BBCode on (the default) hides anything in `[...]`, including `JSON.stringify` of an
  array. Wrap test output in `<...>` or `join(" | ")` instead.

**Linux notes** (verified with a Linux x64 CEF export, CEF 147, minify off, on SteamOS/KDE Wayland):

- The extension runs in the CEF browser (main) process, the game's own executable. Subprocesses have `--type=...`.
- `/proc/self/cmdline` can't be used. The host's CEF rewrites the main process's argv in place to set its process
  title (Chromium's `setproctitle`) before it loads the extension, so it reads as one space-joined string, and the
  original argv strings are gone. Copying argv from an ELF constructor gets nothing either.
- So the `.so` reads CEF's global command line (`cef_command_line_get_global()` → `get_argv`, looked up with
  `dlsym` from the already loaded `libcef.so`). That keeps argument boundaries (`"two words"`, empty
  arguments, UTF-8) but differs from what was launched in two ways:
  - Chromium moves every switch (any token starting with `-`, including `-5`) ahead of the positionals, keeping
    each group's order. `save1.json --fullscreen` arrives as `--fullscreen save1.json`.
  - The host appends its own switches after the user's: `--no-sandbox --lang=en-US --remote-debugging-port=9222
    --disable-features=... --autoplay-policy=... --flag-switches-begin --flag-switches-end
    --ozone-platform=wayland --render-node-override=/dev/dri/renderD128`. They vary by machine and settings, so
    they aren't filtered by name.
- The process title is the user's arguments after reordering but before the host's switches, joined by spaces and
  starting with the `/proc/self/exe` path (not `argv[0]`). The `.so` sends the part after that path as
  `titleArgs`; `dropHostSwitches` in [argparse.ts](construct/c3runtime/argparse.ts) keeps the subsequence of CEF's
  list that spells it out, and falls back to the unfiltered list if it can't match. `chromiumParseOrder` then puts a
  `--` where Chromium's positionals start, so a switch never takes a positional as its value. `RawCommandLine` is
  `exe` + `titleArgs` (reordered, unquoted).
- Consequence for players: on Linux an option's value must be attached with `=` (`--level=3`), except negative
  numbers (`--offset -5`). `--level 3` gives a bare `level` flag and a positional `3`.
- No `chromium-args` in the export's `package.json`; the host adds the switches above itself.
- `dist/linux-test.sh <export>/<game>` runs the five test cases and logs every game process's command line.

## ACEs

| Kind | Name | Notes |
|---|---|---|
| Condition | `IsAvailable` | Native extension loaded |
| Condition | `HasFlag(name)` | Option present, with or without value. `"--x"`, `"-x"` and `"x"` are equivalent |
| Condition | `HasArg(text)` | Any raw argument exactly equals `text` |
| Expression | `ArgCount`, `ArgAt(i)` | Raw arguments, excluding the executable |
| Expression | `ArgValue(name)` | Last value of an option, or `""` |
| Expression | `PositionalCount`, `PositionalAt(i)` | Non-option arguments |
| Expression | `RawCommandLine`, `ExecutablePath`, `Source` | `Source` is `wrapper`, `url` or `none` |

## Script API

The runtime instance is also the script interface, `ILaunchArgsInstance`. The build generates
`c3runtime/ILaunchArgsInstance.d.ts` from [instance.ts](construct/c3runtime/instance.ts) and Construct copies it
into a project's `scripts/ts-defs/plugins/`, so TypeScript projects get types with no setup. JavaScript projects
use the same members.

```ts
const launchArgs = runtime.objects.LaunchArguments.getFirstInstance()!;
launchArgs.hasFlag("--fullscreen");   // boolean
launchArgs.getValue("level");         // string | null (null if absent or a bare flag)
launchArgs.getValues("--mod");        // LaunchArgsOptionValues: every value, in order
launchArgs.args;                      // readonly string[], raw, excluding the executable
launchArgs.positionals;               // readonly string[]
launchArgs.optionNames;               // string[], without dashes
launchArgs.hasArg("save1.json");
launchArgs.isAvailable; launchArgs.source; launchArgs.rawCommandLine; launchArgs.executablePath;
```

Everything is read-only, and loaded before the first layout (the fetch is a load promise). The ACEs call
these same members, so they can't drift apart.

Rules for the public API:

- Every `public` member of `ILaunchArgsInstance` not starting with `_` is public API and appears in the
  generated `.d.ts`. Use `private` or a `_` prefix for anything else; constructors are always left out.
- Types the API uses must be listed in `DECLARATIONS` in [build.ts](scripts/build.ts), which emits them as
  globals. Prefix them with `LaunchArgs` (they share a project's global scope).
- [tests/api/usage.ts](tests/api/usage.ts) is a stand-in project script compiled against the generated
  definitions on every build. Add to it when the API grows; a breaking change fails `npm run build`.
- Removing or renaming a public member breaks projects using it. Only add.

## Parsing rules

- `--key=value` and `--key value` (the next token is taken as the value unless it starts with `-`; negative numbers such as `-5` count as values)
- `--flag` with no value; `-abc` is three short flags; `-k v` and `-k=v` behave like long options
- `--` ends options; a lone `-` is positional
- Repeated options accumulate; `ArgValue` returns the last one. Names are case-sensitive

`--flag word` is ambiguous: `word` becomes the flag's value. Use `--flag=` or put positionals first if that matters.
On Linux, Chromium has already moved switches before positionals, so `word` is always a positional there (see the
Linux notes); `--key=value` works the same everywhere.

## Layout

```
construct/      the addon source (`npm run build` packages it)
  c3runtime/    runtime in TypeScript (bundled by esbuild into c3runtime/main.js); globals.d.ts declares C3
  ts-defs/      Construct's runtime type definitions, vendored from a project's scripts/ts-defs/runtime
  *.js          editor scripts, plain JavaScript (Construct loads them as is)
extension/      native wrapper extension (VS solution, Xcode project, CMake for Linux)
scripts/        build.ts (type check, bundle, .d.ts, packaging), build-macos.sh
dist/           build output, gitignored
tests/          parser unit tests (npm test); api/ is the public API type fixture
schemas/        Construct addon JSON schemas, copied from Scirra's SDK
docs/           agent handoff notes
```

## Building

- **Setup:** Node 22.18+ (runs `.ts` directly with type stripping), then `npm install` once
- **Tests:** `npm test` (no dependencies needed)
- **Type check:** `npm run check` (`construct/`, `scripts/` and `tests/`, each with its own `tsconfig.json`)
- **macOS:** `scripts/build-macos.sh`
- **Windows:** open `extension/WrapperExtension.sln` in Visual Studio 2022 (Build Tools are enough), build Release
  x64 and x86 (solution platform `x86`, not `Win32`); ARM64 needs the ARM64 MSVC toolset. From a shell:
  `MSBuild extension/WrapperExtension.sln -p:Configuration=Release -p:Platform=x64`. Builds go to
  `extension/bin/`, and Release copies `LaunchArgs_<arch>.ext.dll` (only) into `construct/`
- **Linux:** `cmake -S extension -B build && cmake --build build`, producing `build/lib/launchargs_x64.ext.so`.
  On SteamOS (no host compiler) run it inside the Freedesktop SDK:
  `flatpak run --filesystem=$PWD --command=sh org.freedesktop.Sdk//26.08 -c "cmake -S extension -B build && cmake --build build"`.
  It defaults to Release and exports only `WrapperExtInit` (`extension/exports.map`). libstdc++ is linked
  dynamically on purpose: a Release build needs only `GLIBC_2.34` (for `dlsym`; the exported game executable
  itself already needs 2.34), `GLIBCXX_3.4.21` and `CXXABI_1.3.9`, while
  `-static-libstdc++` pulls in the build machine's glibc symbol versions (`GLIBC_2.38` from a current SDK). A
  Debug build needs `GLIBCXX_3.4.30`. Check after rebuilding with
  `objdump -T build/lib/launchargs_x64.ext.so | grep -oE '(GLIBC|GLIBCXX|CXXABI)_[0-9.]+' | sort -uV`

Copy each binary into `construct/` and set `built: true` for it in
[plugin.js](construct/plugin.js).

**Packaging:** `npm run build` type checks the runtime, generates `ILaunchArgsInstance.d.ts` and checks
`tests/api/` against it, bundles `c3runtime/main.ts` into `c3runtime/main.js`, copies the rest of `construct/`
(not `.ts` files, `ts-defs/` or `tsconfig.json`) to `dist/addon/`, and zips it as
`dist/PabloGalbraith_LaunchArgs-<version>.c3addon`. It writes `addon.json` `file-list` from the files present,
so the source `addon.json` has none. It warns when a binary is present but `built: false`, and fails when
`built: true` names a missing binary.

`min-construct-version` is r450, matching the Ribbit addon this setup follows; the TypeScript definition
APIs (`SetScriptInterfaceNames`, `SetTypeScriptDefinitionFiles`) need a recent release. The packaged `.c3addon`
installs and exports in the editor, and a TypeScript project script calling `hasFlag`, `getValue`, `args` and the
rest works in an unminified export. Not yet confirmed: that Advanced minification keeps the public member names.
On Windows the zip is made with System32's `tar.exe` (bsdtar), called by path because Git Bash's GNU `tar` can't
write zips.

The test project is [tests/project.c3p](tests/project.c3p): a TypeScript project whose one Text object shows
`Source`, `ArgCount`, `RawCommandLine`, `ExecutablePath`, `ArgValue`s, `PositionalAt(0)` and every `ArgAt(i)`. Its
Text has BBCode on, which hides the `[...]`-wrapped `ArgAt` values (turn BBCode off to see them), and its Repeat
event runs every tick, so only the first block of `ArgAt` lines matters.

The C++ is based on Scirra's `wrapperExtensionPlugin` sample from the
[Construct Addon SDK](https://github.com/Scirra/Construct-Addon-SDK).
