import type { SDKInstanceClass } from "./instance.ts";

const C3 = globalThis.C3;

C3.Plugins.PabloGalbraith_LaunchArgs.Cnds = {
	IsAvailable(this: SDKInstanceClass) {
		return this.isAvailable;
	},

	HasFlag(this: SDKInstanceClass, name: string) {
		return this.hasFlag(name);
	},

	HasArg(this: SDKInstanceClass, text: string) {
		return this.hasArg(text);
	},
};
