# TODO

- **Windows ARM64:** build `LaunchArgs_arm64.ext.dll` (needs the ARM64 MSVC toolset) and add it to
  `WRAPPER_EXTENSIONS` in `construct/plugin.js` with platform `windows-arm64`.
- **Advanced minification:** confirm an export with Advanced minification keeps the public script API member names
  (`hasFlag`, `getValue`, …).
- **Linux test script:** `linux-test.sh` (runs the test cases against an export and logs every game process's
  command line) lived in the gitignored `dist/`. Recover it from the Linux machine into `scripts/`.
- **Linux `.so` cleanup:** `GetProcessArgs` falls back to `/proc/self/cmdline` when CEF's command line isn't
  available, which gives one space-joined string under CEF. Consider removing the fallback, then rebuild and
  re-verify the `.so` on Linux.
- **Release metadata:** replace the placeholder `https://github.com/` help, website and documentation URLs in
  `construct/addon.json` and `construct/lang/en-US.json`.
