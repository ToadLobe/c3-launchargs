// Declarations the vendored runtime definitions (../ts-defs, copied from a Construct project's scripts/ts-defs/runtime)
// expect a project to generate, plus the addon namespace Construct provides at runtime.

/** Addon classes, registered by ID. */
declare namespace C3 {
	const Plugins: {
		PabloGalbraith_LaunchArgs: {
			new(): ISDKPluginBase_;
			Type?: unknown;
			Instance?: unknown;
			Acts?: Record<string, Function>;
			Cnds?: Record<string, Function>;
			Exps?: Record<string, Function>;
		};
	};
}

interface IConstructProjectObjects {}
interface IConstructProjectGlobalVariables {}
declare namespace InstanceType {}
