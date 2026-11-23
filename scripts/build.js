// Copies construct/ into dist/addon/ and packages it as dist/<id>-<version>.c3addon.
// Run with `npm run build`.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "construct");
const DIST = join(ROOT, "dist");
const ADDON = join(DIST, "addon");

/** Files that never belong in the addon. */
const IGNORED = new Set([".DS_Store", "Thumbs.db"]);

function listFiles(folder) {
	return readdirSync(folder)
		.filter(name => !IGNORED.has(name))
		.flatMap(name => {
			const path = join(folder, name);
			return statSync(path).isDirectory() ? listFiles(path) : [path];
		});
}

/** Builds dist/addon/, with addon.json's file-list regenerated from the files actually there. */
function build() {
	rmSync(ADDON, { recursive: true, force: true });
	cpSync(SOURCE, ADDON, { recursive: true, filter: path => !IGNORED.has(path.split(/[\\/]/).pop()) });

	const metadata = JSON.parse(readFileSync(join(ADDON, "addon.json"), "utf8"));
	delete metadata["$schema"];
	const files = listFiles(ADDON).map(file => relative(ADDON, file).split("\\").join("/"));
	metadata["file-list"] = files.sort();
	writeFileSync(join(ADDON, "addon.json"), `${JSON.stringify(metadata, null, "\t")}\n`);

	checkWrapperExtensions(files);
	return { id: metadata.id, version: metadata.version };
}

/** Warns when plugin.js's `built` flags disagree with the native binaries present. */
function checkWrapperExtensions(files) {
	const plugin = readFileSync(join(SOURCE, "plugin.js"), "utf8");
	const pattern = /filename:\s*"([^"]+)"[^}]*built:\s*(true|false)/g;
	for (const [, filename, built] of plugin.matchAll(pattern)) {
		const present = files.includes(filename);
		if (present && built === "false") console.warn(`warning: ${filename} is in the addon but plugin.js has built: false`);
		if (!present && built === "true") throw new Error(`plugin.js has built: true for ${filename}, but the file is missing`);
	}
}

/** Zips dist/addon/ into a .c3addon, with every file at the root of the zip. */
function pack(id, version) {
	const output = join(DIST, `${id}-${version}.c3addon`);
	rmSync(output, { force: true });
	if (process.platform === "win32") {
		// Windows 10+ ships bsdtar; -a picks the format from the extension, so write .zip and rename
		const zip = `${output}.zip`;
		rmSync(zip, { force: true });
		execFileSync("tar", ["-a", "-c", "-f", zip, "*"], { cwd: ADDON, shell: true });
		renameSync(zip, output);
	} else {
		execFileSync("zip", ["-r", "-X", "-q", output, "."], { cwd: ADDON });
	}
	return output;
}

if (!existsSync(join(SOURCE, "addon.json"))) throw new Error(`No addon.json in ${SOURCE}`);
const { id, version } = build();
console.log(`Built ${relative(ROOT, pack(id, version))}`);
