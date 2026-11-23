// Editor side of the plugin. Plain JavaScript: Construct loads it as is, and only the runtime
// (c3runtime/*.ts) is TypeScript.
const SDK = globalThis.SDK;

////////////////////////////////////////////
// *** NEVER CHANGE THE PLUGIN ID! ***
// Changing it after release breaks every project that uses the plugin.
const PLUGIN_ID = "PabloGalbraith_LaunchArgs";
////////////////////////////////////////////

const PLUGIN_CATEGORY = "platform-specific";

// Native binaries. Set built: true only once the file exists in this folder. The build
// fails if a built: true binary is missing, and warns if a present one is built: false.
const WRAPPER_EXTENSIONS = [
	{ filename: "LaunchArgs_x64.ext.dll",   platform: "windows-x64", built: false },
	{ filename: "LaunchArgs_x86.ext.dll",   platform: "windows-x86", built: false },
	{ filename: "LaunchArgs_arm64.ext.dll", platform: "windows-arm64", built: false },
	{ filename: "launchargs_x64.ext.so",    platform: "linux-x64", built: false },
	{ filename: "launchargs.ext.dylib",     platform: "macos-universal", built: false }
];

const PLUGIN_CLASS = SDK.Plugins.PabloGalbraith_LaunchArgs = class PabloGalbraith_LaunchArgsPlugin extends SDK.IPluginBase
{
	constructor()
	{
		super(PLUGIN_ID);

		SDK.Lang.PushContext("plugins." + PLUGIN_ID.toLowerCase());

		this._info.SetName(globalThis.lang(".name"));
		this._info.SetDescription(globalThis.lang(".description"));
		this._info.SetCategory(PLUGIN_CATEGORY);
		this._info.SetAuthor("Pablo Galbraith");
		this._info.SetHelpUrl(globalThis.lang(".help-url"));
		this._info.SetIsSingleGlobal(true);
		this._info.SetRuntimeModuleMainScript("c3runtime/main.js");
		// The runtime instance is the script interface; the build generates its definitions from c3runtime/instance.ts
		this._info.SetScriptInterfaceNames({ instance: "ILaunchArgsInstance" });
		this._info.SetTypeScriptDefinitionFiles(["c3runtime/ILaunchArgsInstance.d.ts"]);

		SDK.Lang.PushContext(".properties");

		this._info.SetProperties([
			// Index 0: when no wrapper extension is available (e.g. browser preview),
			// treat the page URL query string as the argument list.
			new SDK.PluginProperty("check", "url-query-fallback", true)
		]);

		SDK.Lang.PopContext();		// .properties

		SDK.Lang.PopContext();

		// TODO(windows agent): confirm the exact platform strings accepted by AddFileDependency
		// (the SDK sample uses "windows-x86", "windows-x64", "windows-arm64", "linux-x64";
		// the macOS value is unverified).
		for (const ext of WRAPPER_EXTENSIONS)
		{
			if (!ext.built)
				continue;
			this._info.AddFileDependency({
				filename: ext.filename,
				type: "wrapper-extension",
				platform: ext.platform
			});
		}
	}
};

PLUGIN_CLASS.Register(PLUGIN_ID, PLUGIN_CLASS);
