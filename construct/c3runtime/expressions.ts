import type { SDKInstanceClass } from "./instance.ts";

const C3 = globalThis.C3;

// Out-of-range indices and missing values return "", as event sheets expect.
C3.Plugins.PabloGalbraith_LaunchArgs.Exps = {
	ArgCount(this: SDKInstanceClass) {
		return this.args.length;
	},

	ArgAt(this: SDKInstanceClass, index: number) {
		return this.args[Math.floor(index)] ?? "";
	},

	ArgValue(this: SDKInstanceClass, name: string) {
		return this.getValue(name) ?? "";
	},

	PositionalCount(this: SDKInstanceClass) {
		return this.positionals.length;
	},

	PositionalAt(this: SDKInstanceClass, index: number) {
		return this.positionals[Math.floor(index)] ?? "";
	},

	RawCommandLine(this: SDKInstanceClass) {
		return this.rawCommandLine;
	},

	ExecutablePath(this: SDKInstanceClass) {
		return this.executablePath;
	},
};
