# Launch Arguments: a Construct 3 plugin

A Construct 3 plugin that reads the command-line arguments an exported desktop game was launched with.

```
MyGame.exe --level=3 --fullscreen save1.json
```

```
Launch Arguments: Has flag "--fullscreen"   → true
Launch Arguments.ArgValue("--level")        → "3"
Launch Arguments.PositionalAt(0)            → "save1.json"
```

Plugin ID: `PabloGalbraith_LaunchArgs` (never change it). Wrapper component ID: `pablogalbraith-launchargs`.

## How it works

The plugin's JavaScript runs in the web sandbox and can't see the host process. A small native
[wrapper extension](https://www.construct.net/en/make-games/manuals/addon-sdk/guide/wrapper-extensions)
(`.ext.dll` / `.ext.dylib` / `.ext.so`) reads argv and returns it on one async `get-args` message
at startup. The bridge only carries string, number and boolean values, so the reply is flattened to
`argc`, `arg0`…`argN-1`, `exe` and `raw`. All parsing happens in JS
([argparse.js](construct/c3runtime/argparse.js)).

| Platform | Source of argv | Status |
|---|---|---|
| Windows WebView2 | `GetCommandLineW()` + `CommandLineToArgvW()` | Written, not yet built |
| macOS WKWebView | `NSProcessInfo.arguments` (drops `-psn_*`) | Builds; harness-tested |
| Linux CEF | `/proc/self/cmdline` | Written, not yet built |
| Browser preview | URL query (`?level=3&fullscreen`), if the property is on | Untested |

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

## Parsing rules

- `--key=value` and `--key value` (the next token is taken as the value unless it starts with `-`; negative numbers such as `-5` count as values)
- `--flag` with no value; `-abc` is three short flags; `-k v` and `-k=v` behave like long options
- `--` ends options; a lone `-` is positional
- Repeated options accumulate; `ArgValue` returns the last one. Names are case-sensitive

`--flag word` is ambiguous: `word` becomes the flag's value. Use `--flag=` or put positionals first if that matters.

## Layout

```
construct/      the addon source (`npm run build` packages it)
extension/      native wrapper extension (VS solution, Xcode project, CMake for Linux)
scripts/        build.js (addon packaging), build-macos.sh
dist/           build output, gitignored
tests/          parser unit tests (npm test)
schemas/        Construct addon JSON schemas, copied from Scirra's SDK
docs/           agent handoff notes
```

## Building

- **Tests:** `npm test` (Node 18+, no dependencies)
- **macOS:** `scripts/build-macos.sh`
- **Windows:** open `extension/WrapperExtension.sln` in Visual Studio 2022, build Release x64 (and x86 / ARM64 if wanted). Output is `LaunchArgs_<arch>.ext.dll`
- **Linux:** `cmake -S extension -B build && cmake --build build`, producing `build/lib/launchargs_x64.ext.so`

Copy each binary into `construct/` and set `built: true` for it in
[plugin.js](construct/plugin.js).

**Packaging:** `npm run build` copies `construct/` to `dist/addon/` and zips it as
`dist/PabloGalbraith_LaunchArgs-<version>.c3addon`. It regenerates `addon.json` `file-list` from the files present,
so there's no need to edit it by hand. It warns when a binary is present but `built: false`, and fails when
`built: true` names a missing binary.

The C++ is based on Scirra's `wrapperExtensionPlugin` sample from the
[Construct Addon SDK](https://github.com/Scirra/Construct-Addon-SDK).
