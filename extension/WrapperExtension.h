#include "IApplication.h"
#include "IExtension.h"

#include <string>
#include <vector>
#include <map>

// Launch Arguments wrapper extension: reports the process command line to the Construct plugin.
class WrapperExtension : public IExtension {
public:
	WrapperExtension(IApplication* iApplication_);

	// IExtension overrides
	void Init();
	void Release();
	void OnWebMessage(const char* messageId, size_t paramCount, const ExtensionParameterPOD* paramArr, double asyncId);
#ifdef _WIN32
	void OnMainWindowCreated(HWND hWnd_);
#else
	void OnMainWindowCreated();
#endif

	// Web messaging methods
	void HandleWebMessage(const std::string& messageId, const std::vector<ExtensionParameter>& params, double asyncId);
	void SendWebMessage(const std::string& messageId, const std::map<std::string, ExtensionParameter>& params, double asyncId = -1.0);
	void SendAsyncResponse(const std::map<std::string, ExtensionParameter>& params, double asyncId);

	// Message handlers
	void OnGetArgs(double asyncId);

protected:
	IApplication* iApplication;
};

// Platform-specific: fill 'args' with the full argv (argv[0] = executable) as UTF-8,
// and 'raw' with the command line as a single string. Implemented in WrapperExtension.cpp.
void GetProcessArgs(std::vector<std::string>& args, std::string& raw);
