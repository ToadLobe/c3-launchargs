// Pure command-line parsing logic. No Construct dependencies, so it can be unit tested
// with Node (see tests/argparse.test.js).
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

const NEGATIVE_NUMBER = /^-\d|^-\.\d/;

function isOptionToken(s)
{
	return s.length > 1 && s.startsWith("-") && !NEGATIVE_NUMBER.test(s);
}

function addOption(options, name, value)
{
	let values = options.get(name);
	if (!values)
	{
		values = [];
		options.set(name, values);
	}
	values.push(value);
}

export function parseArgs(argList)
{
	const args = Array.from(argList, a => String(a));
	const options = new Map();
	const positionals = [];

	for (let i = 0; i < args.length; ++i)
	{
		const arg = args[i];

		if (arg === "--")
		{
			positionals.push(...args.slice(i + 1));
			break;
		}

		if (!isOptionToken(arg))
		{
			positionals.push(arg);
			continue;
		}

		const isLong = arg.startsWith("--");
		const body = arg.slice(isLong ? 2 : 1);
		const eq = body.indexOf("=");

		if (eq >= 0)
		{
			addOption(options, body.slice(0, eq), body.slice(eq + 1));
			continue;
		}

		if (!isLong && body.length > 1)
		{
			// Bundled short flags: -abc
			for (const ch of body)
				addOption(options, ch, null);
			continue;
		}

		const next = args[i + 1];
		if (next !== undefined && next !== "--" && !isOptionToken(next))
		{
			addOption(options, body, next);
			++i;
		}
		else
		{
			addOption(options, body, null);
		}
	}

	return { options, positionals };
}

// Accepts "--name", "-n" or "name" and returns the bare option name.
export function normalizeName(name)
{
	return String(name).trim().replace(/^-+/, "");
}

// Converts a URL query string into argv-style tokens, for testing in browser preview.
// "?level=3&fullscreen" -> ["--level=3", "--fullscreen"]. Keys that already start with
// '-' are kept as written.
export function queryStringToArgs(search)
{
	const result = [];
	const params = new URLSearchParams(search);
	const raw = String(search).replace(/^\?/, "").split("&").filter(s => s.length);
	let idx = 0;
	for (const [key, value] of params)
	{
		const hasEquals = (raw[idx++] || "").includes("=");
		const name = key.startsWith("-") ? key : "--" + key;
		result.push(hasEquals ? `${name}=${value}` : name);
	}
	return result;
}
