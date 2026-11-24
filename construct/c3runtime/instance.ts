import { chromiumParseOrder, dropHostSwitches, normalizeName, type LaunchArgsOptionValues, parseArgs, type ParsedArgs } from "./argparse.ts";

const C3 = globalThis.C3;

// Must match RegisterComponentId() in extension/WrapperExtension.cpp.
const COMPONENT_ID = "pablogalbraith-launchargs";

/**
 * The plugin's single global instance, which is also its script interface: every public member here is callable from
 * project scripts as `runtime.objects.LaunchArguments.getFirstInstance()` (typed by the generated
 * ILaunchArgsInstance.d.ts), and the conditions and expressions call the same members. Members starting with `_` and
 * private members are left out of the generated definitions.
 *
 * Arguments are read once while the project loads, so they're ready by the first layout and never change.
 */
class ILaunchArgsInstance extends globalThis.ISDKInstanceBase {
	private readonly wrapperAvailable: boolean;
	private argList: readonly string[] = [];
	private parsed: ParsedArgs = parseArgs([]);
	private raw = "";
	private exe = "";

	public constructor() {
		super({ wrapperComponentId: COMPONENT_ID });

		// If the native extension failed to load, async messages never resolve, so
		// check availability before sending anything.
		this.wrapperAvailable = this._isWrapperExtensionAvailable();

		if (this.wrapperAvailable) this.runtime.sdk.addLoadPromise(this._fetchFromWrapper());
	}

	// MARK: Script interface

	/** Whether the native wrapper extension loaded, i.e. this is a supported desktop export. */
	public get isAvailable(): boolean {
		return this.wrapperAvailable;
	}

	/** The raw arguments, not counting the executable. */
	public get args(): readonly string[] {
		return this.argList;
	}

	/** The arguments that aren't options or option values, in order. */
	public get positionals(): readonly string[] {
		return this.parsed.positionals;
	}

	/** The names (without dashes) of every option passed, in the order first seen. */
	public get optionNames(): string[] {
		return [...this.parsed.options.keys()];
	}

	/** The full command line as one string, as the OS reports it. */
	public get rawCommandLine(): string {
		return this.raw;
	}

	/** The path of the launched executable, as the OS reports it, or `""` outside a desktop export. */
	public get executablePath(): string {
		return this.exe;
	}

	/** Whether an option was passed, with or without a value. `"--x"`, `"-x"` and `"x"` are equivalent. */
	public hasFlag(name: string): boolean {
		return this.parsed.options.has(normalizeName(name));
	}

	/** Whether any raw argument exactly equals `text`. */
	public hasArg(text: string): boolean {
		return this.argList.includes(String(text));
	}

	/** The last value given for an option, or null if it wasn't passed or was passed without a value. */
	public getValue(name: string): string | null {
		return this.parsed.options.get(normalizeName(name))?.at(-1) ?? null;
	}

	/** Every value given for an option, in order; null for each time it was passed without a value. */
	public getValues(name: string): LaunchArgsOptionValues {
		return [...(this.parsed.options.get(normalizeName(name)) ?? [])];
	}

	// MARK: Runtime

	private async _fetchFromWrapper(): Promise<void> {
		// Response shape (see WrapperExtension::OnGetArgs): only string/number/bool values
		// can cross the bridge, so the array is flattened to argc + arg0..argN-1.
		const result = (await this._sendWrapperExtensionMessageAsync("get-args") ?? {}) as Record<string, unknown>;

		const argc = Number(result["argc"]) || 0;
		let args: string[] = [];
		for (let i = 0; i < argc; ++i) args.push(String(result["arg" + i] ?? ""));
		this.exe = String(result["exe"] ?? "");

		// Linux CEF only: the list is Chromium's reordered command line plus the host's own
		// switches, and "titleArgs" is the launched list before those were added (argparse.ts).
		const titleArgs = result["titleArgs"];
		const kept = typeof titleArgs === "string" ? dropHostSwitches(args, titleArgs) : null;
		if (kept) args = kept;
		this.raw = kept ? this.exe + titleArgs : String(result["raw"] ?? "");

		this.argList = Object.freeze(args);
		this.parsed = parseArgs(typeof titleArgs === "string" ? chromiumParseOrder(args) : args);
		Object.freeze(this.parsed.positionals);
	}
}

C3.Plugins.PabloGalbraith_LaunchArgs.Instance = ILaunchArgsInstance;

export type { ILaunchArgsInstance as SDKInstanceClass };
