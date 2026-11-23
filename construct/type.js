
const SDK = globalThis.SDK;

const PLUGIN_CLASS = SDK.Plugins.PabloGalbraith_LaunchArgs;

PLUGIN_CLASS.Type = class PabloGalbraith_LaunchArgsType extends SDK.ITypeBase
{
	constructor(sdkPlugin, iObjectType)
	{
		super(sdkPlugin, iObjectType);
	}
};
