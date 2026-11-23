
#include "pch.h"
#include "WrapperExtension.h"

#ifdef _WIN32
#include <shellapi.h>		// CommandLineToArgvW
#pragma comment(lib, "shell32.lib")
#elif __APPLE__
#import <Foundation/Foundation.h>
#elif __linux__
#include <fstream>
#include <iterator>
#endif

//////////////////////////////////////////////////////
// Boilerplate from the Construct wrapper extension SDK sample - don't change
WrapperExtension* g_Extension = nullptr;

extern "C" {
	DLLEXPORT IExtension* WrapperExtInit(IApplication* iApplication)
	{
		g_Extension = new WrapperExtension(iApplication);
		return g_Extension;
	}
}

void WrapperExtension::OnWebMessage(const char* messageId_, size_t paramCount, const ExtensionParameterPOD* paramArr, double asyncId)
{
	HandleWebMessage(messageId_, UnpackExtensionParameterArray(paramCount, paramArr), asyncId);
}

void WrapperExtension::SendWebMessage(const std::string& messageId, const std::map<std::string, ExtensionParameter>& params, double asyncId)
{
	std::vector<NamedExtensionParameterPOD> paramArr = PackNamedExtensionParameters(params);
	iApplication->SendWebMessage(messageId.c_str(), paramArr.size(), paramArr.empty() ? nullptr : paramArr.data(), asyncId);
}

void WrapperExtension::SendAsyncResponse(const std::map<std::string, ExtensionParameter>& params, double asyncId)
{
	SendWebMessage("", params, asyncId);
}

//////////////////////////////////////////////////////
// Launch Arguments implementation
WrapperExtension::WrapperExtension(IApplication* iApplication_)
	: iApplication(iApplication_)
{
	iApplication->SetSdkVersion(WRAPPER_EXT_SDK_VERSION);

	// Must match COMPONENT_ID in construct/c3runtime/instance.js.
	iApplication->RegisterComponentId("pablogalbraith-launchargs");
}

void WrapperExtension::Init()
{
}

void WrapperExtension::Release()
{
}

#ifdef _WIN32
void WrapperExtension::OnMainWindowCreated(HWND hWnd)
{
}
#else
void WrapperExtension::OnMainWindowCreated()
{
}
#endif

void WrapperExtension::HandleWebMessage(const std::string& messageId, const std::vector<ExtensionParameter>& params, double asyncId)
{
	if (messageId == "get-args")
		OnGetArgs(asyncId);
}

void WrapperExtension::OnGetArgs(double asyncId)
{
	std::vector<std::string> args;
	std::string raw;
	GetProcessArgs(args, raw);

	// Only string/number/bool values can be sent, with no arrays or nesting, so the
	// argument list is flattened to argc + arg0..argN-1. argv[0] is sent separately as "exe".
	std::map<std::string, ExtensionParameter> response;
	response.emplace("exe", ExtensionParameter(args.empty() ? std::string() : args[0]));
	response.emplace("raw", ExtensionParameter(raw));

	size_t argc = args.empty() ? 0 : args.size() - 1;
	response.emplace("argc", ExtensionParameter(static_cast<double>(argc)));
	for (size_t i = 0; i < argc; ++i)
		response.emplace("arg" + std::to_string(i), ExtensionParameter(args[i + 1]));

	SendAsyncResponse(response, asyncId);
}

//////////////////////////////////////////////////////
// Platform implementations of GetProcessArgs()

#ifndef _WIN32
// Rebuilds a display command line from argv, quoting arguments that contain whitespace
// or quotes. This is for display only; the OS has no original string on macOS/Linux.
static std::string JoinArgs(const std::vector<std::string>& args)
{
	std::string out;
	for (size_t i = 0; i < args.size(); ++i)
	{
		if (i > 0)
			out += ' ';
		const std::string& a = args[i];
		bool needsQuotes = a.empty() || a.find_first_of(" \t\"'") != std::string::npos;
		if (!needsQuotes)
		{
			out += a;
			continue;
		}
		out += '"';
		for (char c : a)
		{
			if (c == '"' || c == '\\')
				out += '\\';
			out += c;
		}
		out += '"';
	}
	return out;
}
#endif

#ifdef _WIN32

void GetProcessArgs(std::vector<std::string>& args, std::string& raw)
{
	// TODO(windows agent): check whether the WebView2 wrapper adds or strips any arguments
	// (e.g. Chromium switches) before they reach GetCommandLineW().
	LPWSTR cmdLine = GetCommandLineW();
	raw = WideToUtf8(cmdLine);

	int argc = 0;
	LPWSTR* argv = CommandLineToArgvW(cmdLine, &argc);
	if (!argv)
		return;

	for (int i = 0; i < argc; ++i)
		args.push_back(WideToUtf8(argv[i]));

	LocalFree(argv);
}

#elif __APPLE__

void GetProcessArgs(std::vector<std::string>& args, std::string& raw)
{
	@autoreleasepool {
		NSArray<NSString*>* nsArgs = [[NSProcessInfo processInfo] arguments];
		for (NSUInteger i = 0; i < nsArgs.count; ++i)
		{
			std::string arg = [nsArgs[i] UTF8String] ?: "";

			// Old macOS versions pass a Finder process serial number when launched from Finder.
			if (i > 0 && arg.rfind("-psn_", 0) == 0)
				continue;

			args.push_back(arg);
		}
	}

	raw = JoinArgs(args);
}

#else	// Linux

void GetProcessArgs(std::vector<std::string>& args, std::string& raw)
{
	// /proc/self/cmdline holds the arguments separated (and terminated) by NUL bytes.
	// TODO(linux agent): confirm the extension runs in the CEF browser (main) process, so
	// this is the game's command line and not a CEF subprocess's.
	std::ifstream f("/proc/self/cmdline", std::ios::binary);
	std::string data((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());

	size_t start = 0;
	while (start < data.size())
	{
		size_t end = data.find('\0', start);
		if (end == std::string::npos)
			end = data.size();
		args.push_back(data.substr(start, end - start));
		start = end + 1;
	}

	raw = JoinArgs(args);
}

#endif
