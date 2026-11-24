
#include "pch.h"
#include "WrapperExtension.h"

#ifdef _WIN32
#include <shellapi.h>		// CommandLineToArgvW
#pragma comment(lib, "shell32.lib")
#elif __APPLE__
#import <Foundation/Foundation.h>
#elif __linux__
#include <dlfcn.h>
#include <unistd.h>
#include <cstddef>
#include <fstream>
#include <iterator>

static bool GetTitleArgs(std::string& titleArgs);
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

	// Must match COMPONENT_ID in construct/c3runtime/instance.ts.
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
#ifdef __linux__
	std::string titleArgs;
	if (GetTitleArgs(titleArgs))
		response.emplace("titleArgs", ExtensionParameter(titleArgs));
#endif

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
	// The extension runs in the game's own .exe, so this is the command line as launched.
	// The wrapper's Chromium switches go to the msedgewebview2.exe processes, not here.
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

// The CEF browser process rewrites its argv in place to set the process title (Chromium's
// setproctitle), before the wrapper loads this library. So /proc/self/cmdline then holds one
// space-joined string, and the original argv strings are gone. The parsed copy survives in
// CEF's global command line, which libcef.so (already loaded in this process) exposes through
// its C API. Only the few C API symbols below are used, looked up at run time.
namespace cef {
	struct string_utf16 { char16_t* str; size_t length; void (*dtor)(char16_t*); };
	struct string_utf8 { char* str; size_t length; void (*dtor)(char*); };
	typedef void* string_list;

	// Leading members of cef_command_line_t (include/capi/cef_command_line_capi.h), up to get_argv.
	struct command_line {
		size_t size;									// cef_base_ref_counted_t
		void (*add_ref)(command_line*);
		int (*release)(command_line*);
		int (*has_one_ref)(command_line*);
		int (*has_at_least_one_ref)(command_line*);
		int (*is_valid)(command_line*);
		int (*is_read_only)(command_line*);
		command_line* (*copy)(command_line*);
		void (*init_from_argv)(command_line*, int, const char* const*);
		void (*init_from_string)(command_line*, const string_utf16*);
		void (*reset)(command_line*);
		void (*get_argv)(command_line*, string_list);
	};
}

static bool GetCefArgs(std::vector<std::string>& args)
{
	auto sym = [](const char* name) { return dlsym(RTLD_DEFAULT, name); };
	auto getGlobal = (cef::command_line* (*)())sym("cef_command_line_get_global");
	auto listAlloc = (cef::string_list (*)())sym("cef_string_list_alloc");
	auto listSize = (size_t (*)(cef::string_list))sym("cef_string_list_size");
	auto listValue = (int (*)(cef::string_list, size_t, cef::string_utf16*))sym("cef_string_list_value");
	auto listFree = (void (*)(cef::string_list))sym("cef_string_list_free");
	auto toUtf8 = (int (*)(const char16_t*, size_t, cef::string_utf8*))sym("cef_string_utf16_to_utf8");
	auto utf8Clear = (void (*)(cef::string_utf8*))sym("cef_string_utf8_clear");
	if (!getGlobal || !listAlloc || !listSize || !listValue || !listFree || !toUtf8 || !utf8Clear)
		return false;

	cef::command_line* cl = getGlobal();
	if (!cl)
		return false;

	bool ok = false;
	if (cl->size >= offsetof(cef::command_line, get_argv) + sizeof(cl->get_argv) && cl->is_valid(cl))
	{
		cef::string_list list = listAlloc();
		cl->get_argv(cl, list);
		size_t n = listSize(list);
		for (size_t i = 0; i < n; ++i)
		{
			cef::string_utf16 s16 = {};
			cef::string_utf8 s8 = {};
			if (listValue(list, i, &s16) && s16.str)
				toUtf8(s16.str, s16.length, &s8);	// cef_string_list_value returns a view, no dtor
			args.push_back(s8.str ? std::string(s8.str, s8.length) : std::string());
			utf8Clear(&s8);
		}
		listFree(list);
		ok = n > 0;
	}
	cl->release(cl);
	return ok;
}

static bool g_UsedCefArgs = false;

static std::string ReadProcCmdline()
{
	std::ifstream f("/proc/self/cmdline", std::ios::binary);
	return std::string((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
}

void GetProcessArgs(std::vector<std::string>& args, std::string& raw)
{
	g_UsedCefArgs = GetCefArgs(args);
	// No fallback: without CEF's command line there are no arguments, because
	// /proc/self/cmdline is one space-joined string under CEF.
	if (g_UsedCefArgs)
		raw = JoinArgs(args);
}

// When the arguments came from CEF, gets the process title Chromium set at startup, after the
// executable path: " <arg> <arg>..." (or "" for none). It's the launched arguments with
// switches moved first, before the host appended its own switches, so the runtime uses it to
// drop those (dropHostSwitches in argparse.ts). Chromium starts the title with the path from
// /proc/self/exe, not argv[0].
static bool GetTitleArgs(std::string& titleArgs)
{
	if (!g_UsedCefArgs)
		return false;

	char exe[4096];
	ssize_t n = readlink("/proc/self/exe", exe, sizeof(exe) - 1);
	if (n <= 0)
		return false;
	std::string exePath(exe, static_cast<size_t>(n));

	std::string title = ReadProcCmdline();
	title.erase(title.find_last_not_of('\0') + 1);	// NUL padding after the title
	for (char& c : title)
		if (c == '\0')
			c = ' ';	// not rewritten after all: argv is NUL-separated

	if (title.compare(0, exePath.size(), exePath) != 0)
		return false;
	titleArgs = title.substr(exePath.size());
	return true;
}

#endif
