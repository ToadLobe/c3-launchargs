// A project script using the public API exactly as a game would. Type checked by `npm run build`; never run.

runOnStartup(async runtime => {
	runtime.addEventListener("beforeprojectstart", () => {
		const launchArgs = runtime.objects.LaunchArguments.getFirstInstance()!;

		const available: boolean = launchArgs.isAvailable;
		const args: readonly string[] = launchArgs.args;
		const positionals: readonly string[] = launchArgs.positionals;
		const names: string[] = launchArgs.optionNames;
		const raw: string = launchArgs.rawCommandLine;
		const exe: string = launchArgs.executablePath;

		if (launchArgs.hasFlag("--fullscreen")) console.log("fullscreen");
		if (launchArgs.hasArg("save1.json")) console.log("save");
		const level: number = Number(launchArgs.getValue("level") ?? "1");
		const mods: LaunchArgsOptionValues = launchArgs.getValues("--mod");

		// It's an IInstance like any other
		const uid: number = launchArgs.uid;

		// Read-only from scripts
		// @ts-expect-error isAvailable has no setter
		launchArgs.isAvailable = false;

		console.log(available, args, positionals, names, raw, exe, level, mods, uid);
	});
});
