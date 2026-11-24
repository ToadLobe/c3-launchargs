#pragma once

#include "IExtension.h"

#ifdef _WIN32

// Convert std::wstring to std::string with UTF-8 encoding.
// Use this to convert strings returned by Windows APIs back to UTF-8.
std::string WideToUtf8(const std::wstring& widestring);

#endif

// Helper methods for sending data over DLL boundary
std::vector<ExtensionParameter> UnpackExtensionParameterArray(size_t paramCount, const ExtensionParameterPOD* paramArr);
std::vector<NamedExtensionParameterPOD> PackNamedExtensionParameters(const std::map<std::string, ExtensionParameter>& params);
