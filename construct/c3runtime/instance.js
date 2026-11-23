
import { parseArgs, normalizeName, queryStringToArgs } from "./argparse.js";

const C3 = globalThis.C3;

// Must match RegisterComponentId() in extension/WrapperExtension.cpp.
const COMPONENT_ID = "pablogalbraith-launchargs";

C3.Plugins.PabloGalbraith_LaunchArgs.Instance = class PabloGalbraith_LaunchArgsInstance extends globalThis.ISDKInstanceBase
{
	constructor()
	{
		super({ wrapperComponentId: COMPONENT_ID });

		// If the native extension failed to load, async messages never resolve, so
		// check availability before sending anything.
		this._isWrapperExtAvailable = this._isWrapperExtensionAvailable();

		this._useUrlFallback = true;
		const properties = this._getInitProperties();
		if (properties)
			this._useUrlFallback = !!properties[0];

		this._args = [];				// arguments after the executable, as strings
		this._rawCommandLine = "";
		this._exePath = "";
		this._source = "none";		// "wrapper", "url" or "none"
		this._parsed = parseArgs([]);

		if (this._isWrapperExtAvailable)
			this.runtime.sdk.addLoadPromise(this._fetchFromWrapper());
		else
			this._loadFallback();
	}

	_release()
	{
		super._release();
	}

	async _fetchFromWrapper()
	{
		// Response shape (see WrapperExtension::OnGetArgs): only string/number/bool values
		// can cross the bridge, so the array is flattened to argc + arg0..argN-1.
		const result = await this._sendWrapperExtensionMessageAsync("get-args");

		const argc = Number(result["argc"]) || 0;
		const args = [];
		for (let i = 0; i < argc; ++i)
			args.push(String(result["arg" + i] ?? ""));

		this._setArgs(args, "wrapper");
		this._rawCommandLine = String(result["raw"] ?? args.join(" "));
		this._exePath = String(result["exe"] ?? "");
	}

	_loadFallback()
	{
		if (!this._useUrlFallback)
			return;

		// TODO: verify in browser preview. In worker mode globalThis.location is the worker
		// script's URL, which has no query string, so this may only work in DOM mode.
		// If so, fetch the page URL via a DOM-side handler instead.
		let search = "";
		try { search = globalThis.location?.search ?? ""; } catch (e) { /* ignore */ }

		const args = queryStringToArgs(search);
		if (args.length)
		{
			this._setArgs(args, "url");
			this._rawCommandLine = args.join(" ");
		}
	}

	_setArgs(args, source)
	{
		this._args = args;
		this._source = source;
		this._parsed = parseArgs(args);
	}

	_isAvailable()
	{
		return this._isWrapperExtAvailable;
	}

	_hasOption(name)
	{
		return this._parsed.options.has(normalizeName(name));
	}

	_hasRawArg(text)
	{
		return this._args.includes(String(text));
	}

	_getOptionValue(name)
	{
		const values = this._parsed.options.get(normalizeName(name));
		if (!values)
			return "";
		const last = values[values.length - 1];
		return last ?? "";
	}

	_saveToJson()
	{
		// Launch arguments are not part of the game state.
		return null;
	}

	_loadFromJson(o)
	{
	}
};
