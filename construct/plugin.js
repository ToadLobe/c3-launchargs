const SDK = globalThis.SDK;

// Never change the plugin ID: projects reference it.
const PLUGIN_ID = "PabloGalbraith_LaunchArgs";

const PLUGIN_CATEGORY = "platform-specific";

// Native binaries shipped in this folder. The build fails if one is missing.
const WRAPPER_EXTENSIONS = [
	{ filename: "LaunchArgs_x64.ext.dll", platform: "windows-x64" },
	{ filename: "launchargs_x64.ext.so",  platform: "linux-x64" },
	{ filename: "launchargs.ext.dylib",   platform: "macos-universal" }
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
		this._info.SetC3RuntimeScripts(["c3runtime/main.js"]);
		this._info.SetScriptInterfaceNames({ instance: "ILaunchArgsInstance" });
		this._info.SetTypeScriptDefinitionFiles(["c3runtime/ILaunchArgsInstance.d.ts"]);

		SDK.Lang.PopContext();

		for (const ext of WRAPPER_EXTENSIONS)
		{
			this._info.AddFileDependency({
				filename: ext.filename,
				type: "wrapper-extension",
				platform: ext.platform
			});
		}
	}
};

PLUGIN_CLASS.Register(PLUGIN_ID, PLUGIN_CLASS);
