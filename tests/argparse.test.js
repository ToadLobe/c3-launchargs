// Run with: npm test   (uses Node's built-in test runner, no dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, normalizeName, queryStringToArgs } from "../construct/c3runtime/argparse.js";

test("empty input", () => {
	const r = parseArgs([]);
	assert.deepEqual(r.positionals, []);
	assert.equal(r.options.size, 0);
});

test("--key=value", () => {
	const r = parseArgs(["--level=3"]);
	assert.deepEqual(r.options.get("level"), ["3"]);
});

test("--key=value keeps later '=' signs and empty values", () => {
	const r = parseArgs(["--expr=a=b", "--empty="]);
	assert.deepEqual(r.options.get("expr"), ["a=b"]);
	assert.deepEqual(r.options.get("empty"), [""]);
});

test("--key value consumes the next non-option token", () => {
	const r = parseArgs(["--level", "3", "save1"]);
	assert.deepEqual(r.options.get("level"), ["3"]);
	assert.deepEqual(r.positionals, ["save1"]);
});

test("--key value accepts negative numbers as values", () => {
	const r = parseArgs(["--offset", "-5", "--scale", "-0.5"]);
	assert.deepEqual(r.options.get("offset"), ["-5"]);
	assert.deepEqual(r.options.get("scale"), ["-0.5"]);
});

test("bare flag followed by another option", () => {
	const r = parseArgs(["--fullscreen", "--level=2"]);
	assert.deepEqual(r.options.get("fullscreen"), [null]);
	assert.deepEqual(r.options.get("level"), ["2"]);
});

test("bare flag at end", () => {
	const r = parseArgs(["--fullscreen"]);
	assert.deepEqual(r.options.get("fullscreen"), [null]);
});

test("short flag bundle -abc", () => {
	const r = parseArgs(["-abc"]);
	assert.deepEqual(r.options.get("a"), [null]);
	assert.deepEqual(r.options.get("b"), [null]);
	assert.deepEqual(r.options.get("c"), [null]);
});

test("single short option takes a value like a long one", () => {
	const r = parseArgs(["-l", "3", "-w=800"]);
	assert.deepEqual(r.options.get("l"), ["3"]);
	assert.deepEqual(r.options.get("w"), ["800"]);
});

test("positionals and -- terminator", () => {
	const r = parseArgs(["a", "--x", "--", "--not-an-option", "-z", "b"]);
	assert.deepEqual(r.positionals, ["a", "--not-an-option", "-z", "b"]);
	assert.deepEqual(r.options.get("x"), [null]);
	assert.equal(r.options.has("not-an-option"), false);
});

test("a lone '-' is a positional (stdin convention)", () => {
	const r = parseArgs(["-"]);
	assert.deepEqual(r.positionals, ["-"]);
});

test("repeated options accumulate in order", () => {
	const r = parseArgs(["--mod=a", "--mod", "b"]);
	assert.deepEqual(r.options.get("mod"), ["a", "b"]);
});

test("names are case-sensitive", () => {
	const r = parseArgs(["--Level=1"]);
	assert.equal(r.options.has("level"), false);
	assert.equal(r.options.has("Level"), true);
});

test("non-string entries are coerced to strings", () => {
	const r = parseArgs([42, "--n", 7]);
	assert.deepEqual(r.positionals, ["42"]);
	assert.deepEqual(r.options.get("n"), ["7"]);
});

test("normalizeName strips leading dashes and whitespace", () => {
	assert.equal(normalizeName("--fullscreen"), "fullscreen");
	assert.equal(normalizeName("-f"), "f");
	assert.equal(normalizeName("fullscreen"), "fullscreen");
	assert.equal(normalizeName("  --x "), "x");
});

test("queryStringToArgs converts a URL query into argv form", () => {
	assert.deepEqual(queryStringToArgs("?level=3&fullscreen&--name=Bob%20Smith&-v"),
		["--level=3", "--fullscreen", "--name=Bob Smith", "-v"]);
	assert.deepEqual(queryStringToArgs(""), []);
	assert.deepEqual(queryStringToArgs("?"), []);
});
