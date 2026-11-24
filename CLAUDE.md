# Launch Arguments: a Construct 3 plugin

Reads the command-line arguments an exported desktop game was launched with.

```
MyGame.exe save1.json --level=3 --fullscreen
```

```
Launch Arguments: Has flag "--fullscreen"   → true
Launch Arguments.ArgValue("--level")        → "3"
Launch Arguments.PositionalAt(0)            → "save1.json"
```

Plugin ID `PabloGalbraith_LaunchArgs` and wrapper component ID `pablogalbraith-launchargs` must never change.
Not yet released, so nothing needs backwards compatibility. Open work is in [TODO.md](TODO.md).

## How it works

The runtime can't see the host process, so a native
[wrapper extension](https://www.construct.net/en/make-games/manuals/addon-sdk/guide/wrapper-extensions)
(`.ext.dll` / `.ext.dylib` / `.ext.so`) answers one async `get-args` message at startup. The bridge carries only
strings, numbers and booleans, so the reply is flat: `argc`, `arg0`…`argN-1`, `exe`, `raw`, and on Linux `titleArgs`.
All parsing is in TypeScript ([argparse.ts](construct/c3runtime/argparse.ts)). Outside an export, `IsAvailable` is
false and there are no arguments.

| Platform | Source of argv |
|---|---|
| Windows WebView2 | `GetCommandLineW()` + `CommandLineToArgvW()`. The extension is in the game's own `.exe`; the wrapper's Chromium switches go to `msedgewebview2.exe`, so nothing needs filtering |
| macOS WKWebView | `NSProcessInfo.arguments`, dropping `-psn_*` |
| Linux CEF | CEF's global command line (`cef_command_line_get_global()` via `dlsym`), filtered against the process title |

**Linux:** CEF overwrites the process's argv to set its title before the extension loads, so `/proc/self/cmdline`
is useless. CEF's command line keeps argument boundaries, but Chromium moves every switch (any token starting with `-`)
ahead of the positionals and appends the host's own switches. The title (after the `/proc/self/exe` path) is the
user's arguments after reordering but before the host's switches; the `.so` sends it as `titleArgs`.
`dropHostSwitches` keeps the subsequence of CEF's list that spells it out, and `chromiumParseOrder` inserts `--` where
positionals start, so a switch never takes a positional as its value. So on Linux an option's value must be attached
with `=` (`--level=3`), except negative numbers.

## ACEs

| Kind | Name | Notes |
|---|---|---|
| Condition | `IsAvailable` | Native extension loaded |
| Condition | `HasFlag(name)` | Option present, with or without value. `"--x"`, `"-x"` and `"x"` are equivalent |
| Condition | `HasArg(text)` | Any raw argument exactly equals `text` |
| Expression | `ArgCount`, `ArgAt(i)` | Raw arguments, excluding the executable |
| Expression | `ArgValue(name)` | Last value of an option, or `""` |
| Expression | `PositionalCount`, `PositionalAt(i)` | Non-option arguments |
| Expression | `RawCommandLine`, `ExecutablePath` | |

## Script API

The runtime instance is the script interface, `ILaunchArgsInstance`. The build generates
`c3runtime/ILaunchArgsInstance.d.ts` from [instance.ts](construct/c3runtime/instance.ts); Construct copies it into a
project's `scripts/ts-defs/plugins/`.

```ts
const launchArgs = runtime.objects.LaunchArguments.getFirstInstance()!;
launchArgs.hasFlag("--fullscreen");   // boolean
launchArgs.getValue("level");         // string | null (null if absent or a bare flag)
launchArgs.getValues("--mod");        // LaunchArgsOptionValues: every value, in order
launchArgs.args;                      // readonly string[], raw, excluding the executable
launchArgs.positionals;               // readonly string[]
launchArgs.optionNames;               // string[], without dashes
launchArgs.hasArg("save1.json");
launchArgs.isAvailable; launchArgs.rawCommandLine; launchArgs.executablePath;
```

Everything is read-only and loaded before the first layout (the fetch is a load promise). The ACEs call these same
members.

- Every `public` member not starting with `_` appears in the generated `.d.ts`; use `private` or `_` otherwise.
- Types the API uses go in `DECLARATIONS` in [build.ts](scripts/build.ts), emitted as globals, prefixed `LaunchArgs`.
- [tests/api/usage.ts](tests/api/usage.ts) is a stand-in project script compiled against the generated definitions
  on every build. Extend it when the API changes.

## Parsing rules

- `--key=value`, or `--key value` (the next token is the value unless it starts with `-`; negative numbers count as values)
- `--flag` with no value; `-abc` is three short flags; `-k v` and `-k=v` behave like long options
- `--` ends options; a lone `-` is positional
- Repeated options accumulate; `ArgValue` returns the last. Names are case-sensitive

## Layout

```
construct/      the addon (`npm run build` packages it)
  c3runtime/    runtime in TypeScript, bundled into c3runtime/main.js; globals.d.ts declares C3
  ts-defs/      Construct's runtime type definitions, vendored from a project's scripts/ts-defs/runtime
  *.js          editor scripts, plain JavaScript
extension/      native wrapper extension (VS solution, CMake for Linux), from Scirra's wrapperExtensionPlugin sample
scripts/        build.ts (type check, bundle, .d.ts, packaging), build-macos.sh
tests/          parser unit tests; api/ is the public API fixture; project.c3p is a TypeScript test project
schemas/        Construct addon JSON schemas, from Scirra's SDK
```

## Building

- **Setup:** Node 22.18+, then `npm install`
- **Tests:** `npm test` · **Type check:** `npm run check`
- **Package:** `npm run build` → `dist/PabloGalbraith_LaunchArgs-<version>.c3addon`. It generates `addon.json`'s
  `file-list`, and fails if a binary listed in `WRAPPER_EXTENSIONS` in [plugin.js](construct/plugin.js) is missing
- **macOS:** `scripts/build-macos.sh` (universal dylib, straight into `construct/`)
- **Windows:** `MSBuild extension/WrapperExtension.sln -p:Configuration=Release -p:Platform=x64`.
  Release copies `LaunchArgs_<arch>.ext.dll` into `construct/`. The CRT is linked statically
- **Linux:** `cmake -S extension -B build && cmake --build build`, then copy `build/lib/launchargs_x64.ext.so` into
  `construct/`. On SteamOS, inside the Freedesktop SDK:
  `flatpak run --filesystem=$PWD --command=sh org.freedesktop.Sdk//26.08 -c "cmake -S extension -B build && cmake --build build"`.
  Keep the Release default and dynamic libstdc++, so it needs only `GLIBC_2.34`, `GLIBCXX_3.4.21` and `CXXABI_1.3.9`:
  `objdump -T build/lib/launchargs_x64.ext.so | grep -oE '(GLIBC|GLIBCXX|CXXABI)_[0-9.]+' | sort -uV`

Testing tip: a Text object with BBCode on hides anything in `[...]`. Print arrays with `join(" | ")`.
