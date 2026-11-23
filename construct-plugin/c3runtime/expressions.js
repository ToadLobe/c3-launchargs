
const C3 = globalThis.C3;

C3.Plugins.PabloGalbraith_LaunchArgs.Exps =
{
	ArgCount()
	{
		return this._args.length;
	},

	ArgAt(index)
	{
		return this._args[Math.floor(index)] ?? "";
	},

	ArgValue(name)
	{
		return this._getOptionValue(name);
	},

	PositionalCount()
	{
		return this._parsed.positionals.length;
	},

	PositionalAt(index)
	{
		return this._parsed.positionals[Math.floor(index)] ?? "";
	},

	RawCommandLine()
	{
		return this._rawCommandLine;
	},

	ExecutablePath()
	{
		return this._exePath;
	},

	Source()
	{
		return this._source;
	}
};
