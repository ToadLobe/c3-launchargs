import { normalizeName, type LaunchArgsOptionValues, parseArgs, type ParsedArgs, queryStringToArgs } from "./argparse.ts";

const C3 = globalThis.C3;

// Must match RegisterComponentId() in extension/WrapperExtension.cpp.
const COMPONENT_ID = "pablogalbraith-launchargs";

/** Where the arguments came from: the native wrapper extension, the page URL query (browser preview), or nowhere. */
type LaunchArgsSource = "wrapper" | "url" | "none";

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
	private readonly useUrlFallback: boolean;
	private argList: readonly string[] = [];
	private parsed: ParsedArgs = parseArgs([]);
	private raw = "";
	private exe = "";
	private from: LaunchArgsSource = "none";

	public constructor() {
		super({ wrapperComponentId: COMPONENT_ID });

		// If the native extension failed to load, async messages never resolve, so
		// check availability before sending anything.
		this.wrapperAvailable = this._isWrapperExtensionAvailable();

		// Property 0: URL query fallback (plugin.js)
		const properties = this._getInitProperties();
		this.useUrlFallback = properties.length > 0 ? !!properties[0] : true;

		if (this.wrapperAvailable) this.runtime.sdk.addLoadPromise(this._fetchFromWrapper());
		else this._loadFallback();
	}

	// MARK: Script interface

	/** Whether the native wrapper extension loaded, i.e. this is a supported desktop export. */
	public get isAvailable(): boolean {
		return this.wrapperAvailable;
	}

	/** Where the arguments came from: `"wrapper"`, `"url"` (browser preview fallback) or `"none"`. */
	public get source(): LaunchArgsSource {
		return this.from;
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

	public override _saveToJson(): JSONValue {
		// Launch arguments are not part of the game state.
		return null;
	}

	public override _loadFromJson(_o: JSONValue): void {}

	private async _fetchFromWrapper(): Promise<void> {
		// Response shape (see WrapperExtension::OnGetArgs): only string/number/bool values
		// can cross the bridge, so the array is flattened to argc + arg0..argN-1.
		const result = (await this._sendWrapperExtensionMessageAsync("get-args") ?? {}) as Record<string, unknown>;

		const argc = Number(result["argc"]) || 0;
		const args: string[] = [];
		for (let i = 0; i < argc; ++i) args.push(String(result["arg" + i] ?? ""));

		this._setArgs(args, "wrapper");
		this.raw = String(result["raw"] ?? args.join(" "));
		this.exe = String(result["exe"] ?? "");
	}

	private _loadFallback(): void {
		if (!this.useUrlFallback) return;

		// TODO: verify in browser preview. In worker mode globalThis.location is the worker
		// script's URL, which has no query string, so this may only work in DOM mode.
		// If so, fetch the page URL via a DOM-side handler instead.
		let search = "";
		try {
			search = globalThis.location?.search ?? "";
		} catch {
			// ignore
		}

		const args = queryStringToArgs(search);
		if (args.length) {
			this._setArgs(args, "url");
			this.raw = args.join(" ");
		}
	}

	private _setArgs(args: string[], source: LaunchArgsSource): void {
		this.argList = Object.freeze(args);
		this.from = source;
		this.parsed = parseArgs(args);
		Object.freeze(this.parsed.positionals);
	}
}

C3.Plugins.PabloGalbraith_LaunchArgs.Instance = ILaunchArgsInstance;

export type { ILaunchArgsInstance as SDKInstanceClass, LaunchArgsSource };
