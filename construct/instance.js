
const SDK = globalThis.SDK;

const PLUGIN_CLASS = SDK.Plugins.PabloGalbraith_LaunchArgs;

PLUGIN_CLASS.Instance = class PabloGalbraith_LaunchArgsInstance extends SDK.IInstanceBase
{
	constructor(sdkType, inst)
	{
		super(sdkType, inst);
	}

	Release()
	{
	}

	OnCreate()
	{
	}

	OnPropertyChanged(id, value)
	{
	}

	LoadC2Property(name, valueString)
	{
		return false;		// not handled
	}
};
