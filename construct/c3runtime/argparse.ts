// Pure command-line parsing logic. No Construct dependencies, so it can be unit tested
// with Node (see tests/argparse.test.ts). Keep it to erasable TypeScript syntax (no enums,
// namespaces or parameter properties): Node runs it directly with type stripping.
//
// Rules:
//   --key=value      option "key" with value "value" (everything after the first '=')
//   --key value      option "key" with value "value", if the next token is not an option
//                    (a token that looks like a negative number, e.g. -5, counts as a value)
//   --flag           option "flag" with no value (stored as null)
//   -abc             short flags a, b and c, no values
//   -k value / -k=v  a single short option behaves like a long one
//   --               everything after it is positional
//   -                a lone dash is positional
//   anything else    positional
// Repeated options accumulate their values in order. Names are case-sensitive.

/** An option's values in the order given. A flag passed without a value contributes null. */
export type LaunchArgsOptionValues = (string | null)[];

export interface ParsedArgs {
	/** Option name (without dashes) to its values. */
	options: Map<string, LaunchArgsOptionValues>;
	/** Non-option arguments, in order. */
	positionals: string[];
}

const NEGATIVE_NUMBER = /^-\d|^-\.\d/;

function isOptionToken(s: string): boolean {
	return s.length > 1 && s.startsWith("-") && !NEGATIVE_NUMBER.test(s);
}

function addOption(options: Map<string, LaunchArgsOptionValues>, name: string, value: string | null): void {
	let values = options.get(name);
	if (!values) {
		values = [];
		options.set(name, values);
	}
	values.push(value);
}

export function parseArgs(argList: Iterable<unknown>): ParsedArgs {
	const args = Array.from(argList, a => String(a));
	const options = new Map<string, LaunchArgsOptionValues>();
	const positionals: string[] = [];

	for (let i = 0; i < args.length; ++i) {
		const arg = args[i]!;

		if (arg === "--") {
			positionals.push(...args.slice(i + 1));
			break;
		}

		if (!isOptionToken(arg)) {
			positionals.push(arg);
			continue;
		}

		const isLong = arg.startsWith("--");
		const body = arg.slice(isLong ? 2 : 1);
		const eq = body.indexOf("=");

		if (eq >= 0) {
			addOption(options, body.slice(0, eq), body.slice(eq + 1));
			continue;
		}

		if (!isLong && body.length > 1) {
			// Bundled short flags: -abc
			for (const ch of body) addOption(options, ch, null);
			continue;
		}

		const next = args[i + 1];
		if (next !== undefined && next !== "--" && !isOptionToken(next)) {
			addOption(options, body, next);
			++i;
		} else {
			addOption(options, body, null);
		}
	}

	return { options, positionals };
}

/** Accepts "--name", "-n" or "name" and returns the bare option name. */
export function normalizeName(name: unknown): string {
	return String(name).trim().replace(/^-+/, "");
}

/**
 * Converts a URL query string into argv-style tokens, for testing in browser preview.
 * "?level=3&fullscreen" -> ["--level=3", "--fullscreen"]. Keys that already start with
 * '-' are kept as written.
 */
export function queryStringToArgs(search: string): string[] {
	const result: string[] = [];
	const params = new URLSearchParams(search);
	const raw = String(search).replace(/^\?/, "").split("&").filter(s => s.length);
	let idx = 0;
	for (const [key, value] of params) {
		const hasEquals = (raw[idx++] ?? "").includes("=");
		const name = key.startsWith("-") ? key : "--" + key;
		result.push(hasEquals ? `${name}=${value}` : name);
	}
	return result;
}

// MARK: Linux CEF
// The CEF browser process rewrites its argv in place to set its process title, before the
// wrapper extension loads. The extension then reads CEF's global command line instead, which
// differs from what was launched in two ways: Chromium moves every switch ahead of the
// positional arguments, and the host appends its own switches (--no-sandbox, --lang=...,
// --ozone-platform=... and others that vary by machine) after the user's. The process title,
// which the extension also sends, is the launched list after reordering but before the host's
// additions, joined by spaces.

/**
 * Removes the switches the host added, by keeping the subsequence of `args` that spells out
 * `titleArgs`: the process title after the executable path, i.e. " <arg> <arg>..." with a
 * leading space before each argument ("" for none). Returns null if `titleArgs` can't be
 * matched, in which case the caller should keep `args` as they are.
 */
export function dropHostSwitches(args: readonly string[], titleArgs: string): string[] | null {
	const kept: string[] = [];
	let pos = 0;
	for (const arg of args) {
		if (pos >= titleArgs.length) break;
		const end = pos + 1 + arg.length;
		if (titleArgs[pos] === " " && titleArgs.startsWith(arg, pos + 1) && (end === titleArgs.length || titleArgs[end] === " ")) {
			kept.push(arg);
			pos = end;
		}
	}

	return pos === titleArgs.length ? kept : null;
}

/** Whether Chromium's command line parser treats `s` as a switch (on Linux: "-" or "--" plus a name). */
function isChromiumSwitch(s: string): boolean {
	return s.length > 1 && s.startsWith("-") && s !== "--";
}

/**
 * Inserts "--" where Chromium's positional arguments start, so parseArgs doesn't give a
 * positional to the switch before it as a value. Chromium has already moved switches ahead
 * of positionals, so which switch a positional followed on the command line is unknown.
 */
export function chromiumParseOrder(args: readonly string[]): string[] {
	const i = args.findIndex(a => !isChromiumSwitch(a));
	if (i < 0 || args[i] === "--") return [...args];
	return [...args.slice(0, i), "--", ...args.slice(i)];
}
