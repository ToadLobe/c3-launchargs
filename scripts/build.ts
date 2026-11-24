// Builds the addon into dist/addon/ and packages it as dist/<id>-<version>.c3addon. Run with `npm run build`
// (Node 22.18+, which runs this file directly with type stripping).
//
// - Type checks construct/ and generates c3runtime/ILaunchArgsInstance.d.ts, the project-facing script API.
// - Bundles construct/c3runtime/main.ts (and everything it imports) into c3runtime/main.js with esbuild.
// - Copies every other file in construct/ unchanged (editor scripts, JSON, icons, native binaries),
//   except the TypeScript sources and vendored ts-defs/.
// - Regenerates addon.json's file-list from the files actually in dist/addon/.

import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "construct");
const RUNTIME = join(SOURCE, "c3runtime");
const DIST = join(ROOT, "dist");
/** A stand-in project script, compiled against the generated definitions to check the public API. */
const API_FIXTURE = join(ROOT, "tests", "api");
const ADDON = join(DIST, "addon");

/** Name of the generated definitions file, as plugin.js passes it to SetTypeScriptDefinitionFiles(). */
const DEFINITIONS_FILE = "ILaunchArgsInstance.d.ts";

/** Declarations the generated definitions take from each source, in the order they are written. */
const DECLARATIONS: [string, string[]][] = [
	[join(RUNTIME, "argparse.ts"), ["LaunchArgsOptionValues"]],
	[join(RUNTIME, "instance.ts"), ["ILaunchArgsInstance"]],
];

/** Files that never belong in the addon. */
const IGNORED = new Set([".DS_Store", "Thumbs.db"]);

/** Paths in construct/ (relative, "/"-separated) that are build inputs rather than addon files. */
function isBuildInput(path: string): boolean {
	return path === "tsconfig.json"
		|| path.startsWith("ts-defs/")
		|| path.endsWith(".ts");
}

function listFiles(folder: string): string[] {
	return readdirSync(folder)
		.filter(name => !IGNORED.has(name))
		.flatMap(name => {
			const path = join(folder, name);
			return statSync(path).isDirectory() ? listFiles(path) : [path];
		});
}

function toAddonPath(root: string, file: string): string {
	return relative(root, file).split("\\").join("/");
}

/** Builds dist/addon/. Throws on type errors. */
async function build(): Promise<{ id: string; version: string }> {
	const definitions = generateDefinitions();

	rmSync(ADDON, { recursive: true, force: true });
	mkdirSync(join(ADDON, "c3runtime"), { recursive: true });

	for (const file of listFiles(SOURCE)) {
		const path = toAddonPath(SOURCE, file);
		if (isBuildInput(path)) continue;
		mkdirSync(dirname(join(ADDON, path)), { recursive: true });
		copyFileSync(file, join(ADDON, path));
	}

	writeFileSync(join(ADDON, "c3runtime", DEFINITIONS_FILE), definitions);
	checkDefinitions(join(ADDON, "c3runtime", DEFINITIONS_FILE));
	await esbuild.build({
		entryPoints: [join(RUNTIME, "main.ts")],
		outfile: join(ADDON, "c3runtime", "main.js"),
		bundle: true,
		format: "esm",
		target: "es2022",
		charset: "utf8",
		logLevel: "warning",
	});

	const metadata = JSON.parse(readFileSync(join(SOURCE, "addon.json"), "utf8")) as Record<string, unknown>;
	delete metadata["$schema"];
	// Developer mode can't list a folder, so addon.json lists every file
	const files = listFiles(ADDON).map(file => toAddonPath(ADDON, file));
	metadata["file-list"] = [...new Set(["addon.json", ...files])].sort();
	writeFileSync(join(ADDON, "addon.json"), `${JSON.stringify(metadata, null, "\t")}\n`);

	checkWrapperExtensions(files);
	return { id: metadata["id"] as string, version: metadata["version"] as string };
}

/**
 * Type checks construct/ and turns the script interface and the types it uses into one global definition file, as
 * Construct expects (it copies it into a project's scripts/ts-defs/plugins/). Private members, members starting with
 * `_` and constructors are left out.
 */
function generateDefinitions(): string {
	const config = ts.getParsedCommandLineOfConfigFile(join(SOURCE, "tsconfig.json"), {}, {
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: diagnostic => {
			throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
		},
	});
	if (!config) throw new Error("Failed to read construct/tsconfig.json");
	const program = ts.createProgram({
		rootNames: config.fileNames,
		options: { ...config.options, noEmit: false, declaration: true, emitDeclarationOnly: true },
	});
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCanonicalFileName: name => name,
			getCurrentDirectory: () => ROOT,
			getNewLine: () => "\n",
		}));
	}

	const emitted = new Map<string, string>();
	program.emit(undefined, (fileName, text) => emitted.set(resolve(fileName), text));
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const blocks = DECLARATIONS.map(([source, names]) => {
		const fileName = source.replace(/\.ts$/, ".d.ts");
		const text = emitted.get(fileName);
		if (text === undefined) throw new Error(`No declarations emitted for ${relative(ROOT, source)}`);
		const file = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
		return names
			.map(name => {
				const statement = file.statements.find(node =>
					(ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name?.text === name
				);
				if (!statement) throw new Error(`${relative(ROOT, source)} declares no ${name}`);
				return printer.printNode(ts.EmitHint.Unspecified, globalDeclaration(statement), file);
			})
			.join("\n\n");
	});
	return [
		"// Generated by scripts/build.ts from construct/c3runtime/. Do not edit.",
		"",
		blocks.join("\n\n"),
		"",
	].join("\n");
}

/**
 * Compiles tests/api/ (a project script and the declarations Construct would generate for its project) against the
 * vendored runtime definitions and the generated definitions file, as a game project's TypeScript would see them.
 */
function checkDefinitions(definitionsFile: string): void {
	const defs = listFiles(join(SOURCE, "ts-defs")).filter(file => file.endsWith(".d.ts"));
	const fixture = listFiles(API_FIXTURE).filter(file => file.endsWith(".ts"));
	const program = ts.createProgram({
		rootNames: [...defs, ...fixture, definitionsFile],
		options: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ES2022,
			lib: ["lib.es2024.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
			types: [],
			noEmit: true,
			strict: true,
			skipLibCheck: false,
			moduleDetection: ts.ModuleDetectionKind.Legacy,
		},
	});
	// Only report problems in the generated file and the fixture, not in Construct's own definitions
	const ours = new Set([...fixture, definitionsFile].map(file => resolve(file)));
	const diagnostics = ts.getPreEmitDiagnostics(program)
		.filter(diagnostic => !diagnostic.file || ours.has(resolve(diagnostic.file.fileName)));
	if (diagnostics.length > 0) {
		throw new Error("The generated definitions don't work in a project:\n" + ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCanonicalFileName: name => name,
			getCurrentDirectory: () => ROOT,
			getNewLine: () => "\n",
		}));
	}
}

/** A declaration rewritten as a global: no export, and classes stripped to their public interface. */
function globalDeclaration(node: ts.Statement): ts.Statement {
	const factory = ts.factory;
	if (ts.isTypeAliasDeclaration(node)) {
		return factory.updateTypeAliasDeclaration(node, [], node.name, node.typeParameters, node.type);
	}
	if (!ts.isClassDeclaration(node)) throw new Error("Only classes and type aliases are supported");
	const members = node.members.filter(member => {
		if (ts.isConstructorDeclaration(member)) return false;
		if (member.name && (ts.isPrivateIdentifier(member.name) || member.name.getText().startsWith("_"))) return false;
		const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) ?? [] : [];
		return !modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword);
	});
	// The instance class extends Construct's SDK base, which a project sees as IInstance
	const heritage = node.heritageClauses?.map(clause =>
		factory.updateHeritageClause(clause, [
			factory.createExpressionWithTypeArguments(factory.createIdentifier("IInstance"), undefined),
		])
	);
	return factory.updateClassDeclaration(
		node,
		[factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
		node.name,
		node.typeParameters,
		heritage,
		members,
	);
}

/** Fails if a native binary plugin.js lists is missing. */
function checkWrapperExtensions(files: string[]): void {
	const plugin = readFileSync(join(SOURCE, "plugin.js"), "utf8");
	for (const [, filename] of plugin.matchAll(/filename:\s*"([^"]+)"/g)) {
		if (!files.includes(filename!)) throw new Error(`plugin.js lists ${filename}, but it isn't in construct/`);
	}
}

/** Zips dist/addon/ into a .c3addon, with every file at the root of the zip. */
function pack(id: string, version: string): string {
	const output = join(DIST, `${id}-${version}.c3addon`);
	rmSync(output, { force: true });
	if (process.platform === "win32") {
		// Windows 10+ ships bsdtar; -a picks the format from the extension, so write .zip and rename.
		// Call System32's copy by path: Git Bash puts GNU tar first on PATH, which can't write zips and
		// reads "C:" in an absolute path as a remote host. The zip path is relative for the same reason.
		const zip = `${output}.zip`;
		rmSync(zip, { force: true });
		const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
		execFileSync(tar, ["-a", "-c", "-f", relative(ADDON, zip), ...readdirSync(ADDON)], { cwd: ADDON });
		renameSync(zip, output);
	} else {
		execFileSync("zip", ["-r", "-X", "-q", output, "."], { cwd: ADDON });
	}
	return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { id, version } = await build();
	console.log(`Built ${relative(ROOT, pack(id, version))}`);
}
