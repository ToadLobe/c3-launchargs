
const C3 = globalThis.C3;

C3.Plugins.PabloGalbraith_LaunchArgs.Cnds =
{
	IsAvailable()
	{
		return this._isAvailable();
	},

	HasFlag(name)
	{
		return this._hasOption(name);
	},

	HasArg(text)
	{
		return this._hasRawArg(text);
	}
};
