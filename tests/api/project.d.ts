// Stands in for the declarations Construct generates in a project's scripts/ts-defs/ for a project with a
// Launch Arguments object named "LaunchArguments". scripts/build.ts compiles usage.ts against these, the vendored
// construct/ts-defs/runtime and the generated ILaunchArgsInstance.d.ts, so a break in the public API fails the build.

declare namespace InstanceType {
	class LaunchArguments extends ILaunchArgsInstance {}
}

interface IConstructProjectObjects {
	LaunchArguments: IObjectType<InstanceType.LaunchArguments>;
}

interface IConstructProjectGlobalVariables {}
