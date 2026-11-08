#include <windows.h>

#include <commctrl.h>
#include <objbase.h>
#include <shellapi.h>
#include <shlobj.h>

#include <filesystem>
#include <iterator>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <kasumi/commands/ksm_filesystem.h>
#include <kasumi/platform/ksm_window_frame.h>
#include <kasumi/platform/ksm_webview2_host.h>
#include <kasumi/platform/ksm_win32_resource_provider.h>
#include "musicstorm_plugin.h"

#if !defined(KASUMI_EXTERNAL_WEB) && !defined(KASUMI_DEV_MODE)
#include "web_resources.h"
#endif

namespace {

constexpr wchar_t kWindowClass[] = L"KasumiApplicationWindow";
constexpr wchar_t kWindowTitle[] = L"Music Storm";
constexpr int kWindowWidth = 1080;
constexpr int kWindowHeight = 720;
constexpr int kApplicationIconResource = 101;
#if defined(KASUMI_WINDOW_DECORATIONS)
constexpr bool kWindowDecorations = KASUMI_WINDOW_DECORATIONS != 0;
#else
constexpr bool kWindowDecorations = true;
#endif

HICON LoadApplicationIcon(HINSTANCE instance, int width, int height) {
  const HICON icon = static_cast<HICON>(
      LoadImageW(instance, MAKEINTRESOURCEW(kApplicationIconResource),
                 IMAGE_ICON, width, height, LR_DEFAULTCOLOR | LR_SHARED));
  return icon ? icon : LoadIconW(nullptr, IDI_APPLICATION);
}

std::wstring ToWide(const std::string &value) {
  if (value.empty()) {
    return {};
  }
  const int size =
      MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                          static_cast<int>(value.size()), nullptr, 0);
  if (size <= 0) {
    return {};
  }
  std::wstring result(static_cast<std::size_t>(size), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), size);
  return result;
}

std::filesystem::path ExecutableDirectory() {
  wchar_t buffer[MAX_PATH]{};
  const DWORD length = GetModuleFileNameW(
      nullptr, buffer, static_cast<DWORD>(std::size(buffer)));
  if (length == 0 || length == std::size(buffer)) {
    return std::filesystem::current_path();
  }
  return std::filesystem::path(buffer).parent_path();
}

std::optional<std::filesystem::path> LocalDataDirectory() {
  PWSTR known_folder = nullptr;
  if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE,
                                  nullptr, &known_folder)) ||
      known_folder == nullptr) {
    return std::nullopt;
  }
  std::filesystem::path result(known_folder);
  CoTaskMemFree(known_folder);
  return result / L"Kasumi" / L"music-storm";
}

std::optional<std::wstring> CommandLineValue(const std::wstring &flag) {
  int argument_count = 0;
  LPWSTR *arguments = CommandLineToArgvW(GetCommandLineW(), &argument_count);
  if (!arguments) {
    return std::nullopt;
  }
  std::optional<std::wstring> value;
  for (int index = 1; index < argument_count; ++index) {
    const std::wstring argument = arguments[index];
    if (argument == flag) {
      if (index + 1 < argument_count) {
        value = arguments[index + 1];
      }
      break;
    }
    if (argument.starts_with(flag + L"=")) {
      value = argument.substr(flag.size() + 1);
      break;
    }
  }
  LocalFree(arguments);
  return value;
}

bool HasCommandLineFlag(const wchar_t *flag) {
  int argument_count = 0;
  LPWSTR *arguments = CommandLineToArgvW(GetCommandLineW(), &argument_count);
  if (!arguments) {
    return false;
  }
  bool found = false;
  for (int index = 1; index < argument_count; ++index) {
    if (std::wstring(arguments[index]) == flag) {
      found = true;
      break;
    }
  }
  LocalFree(arguments);
  return found;
}

std::vector<std::string> ConfiguredValues(const std::string &configured) {
  std::vector<std::string> values;
  std::size_t start = 0;
  while (start < configured.size()) {
    const std::size_t separator = configured.find(',', start);
    const std::size_t end =
        separator == std::string::npos ? configured.size() : separator;
    if (end > start) {
      values.push_back(configured.substr(start, end - start));
    }
    if (separator == std::string::npos) {
      break;
    }
    start = separator + 1;
  }
  return values;
}

std::vector<std::string> ConfiguredCommands() {
  return ConfiguredValues(KASUMI_APP_COMMANDS);
}

std::vector<std::string> ConfiguredPermissions() {
  return ConfiguredValues(KASUMI_APP_PERMISSIONS);
}

std::vector<std::string> ConfiguredShellOrigins() {
  return ConfiguredValues(KASUMI_SHELL_ALLOWED_ORIGINS);
}

std::vector<std::string> ConfiguredHttpOrigins() {
  return ConfiguredValues(KASUMI_HTTP_ALLOWED_ORIGINS);
}

void ShowRuntimePrompt(HWND owner) {
  MessageBoxW(owner,
              L"Music Storm needs the Microsoft Edge WebView2 Evergreen "
              L"Runtime.\n\n"
              L"Install it from "
              L"https://developer.microsoft.com/microsoft-edge/webview2/ "
              L"and start the application again.",
              L"WebView2 Runtime Required", MB_OK | MB_ICONWARNING);
}

LRESULT CALLBACK WindowProc(HWND window, UINT message, WPARAM wparam,
                            LPARAM lparam) {
  switch (message) {
  case WM_GETMINMAXINFO: {
    auto *info = reinterpret_cast<MINMAXINFO *>(lparam);
    info->ptMinTrackSize.x = 320;
    info->ptMinTrackSize.y = 240;
    return 0;
  }
  case WM_CLOSE:
    DestroyWindow(window);
    return 0;
  case WM_DESTROY:
    PostQuitMessage(0);
    return 0;
  default:
    return DefWindowProcW(window, message, wparam, lparam);
  }
}

} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int show_command) {
  const bool smoke_test = HasCommandLineFlag(L"--smoke-test");
  const bool dev_mode = HasCommandLineFlag(L"--dev");
  const auto requested_url = CommandLineValue(L"--url");
  const std::wstring start_url =
      requested_url.value_or(L"https://app.local/index.html");
  const HRESULT com_result = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  if (FAILED(com_result) && com_result != RPC_E_CHANGED_MODE) {
    return 1;
  }

  if (!KSMWebView2Host::IsRuntimeAvailable()) {
    if (!smoke_test) {
      ShowRuntimePrompt(nullptr);
    }
    if (SUCCEEDED(com_result)) {
      CoUninitialize();
    }
    return 1;
  }

  INITCOMMONCONTROLSEX controls{};
  controls.dwSize = sizeof(controls);
  controls.dwICC = ICC_STANDARD_CLASSES;
  InitCommonControlsEx(&controls);

  WNDCLASSEXW window_class{};
  window_class.cbSize = sizeof(window_class);
  window_class.hInstance = instance;
  window_class.lpfnWndProc = WindowProc;
  window_class.lpszClassName = kWindowClass;
  window_class.hCursor = LoadCursorW(nullptr, IDC_ARROW);
  window_class.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  window_class.hIcon =
      LoadApplicationIcon(instance, GetSystemMetrics(SM_CXICON),
                          GetSystemMetrics(SM_CYICON));
  window_class.hIconSm =
      LoadApplicationIcon(instance, GetSystemMetrics(SM_CXSMICON),
                          GetSystemMetrics(SM_CYSMICON));
  if (!RegisterClassExW(&window_class)) {
    return 1;
  }

  HWND window =
      CreateWindowExW(0, kWindowClass, kWindowTitle, WS_OVERLAPPEDWINDOW,
                      CW_USEDEFAULT, CW_USEDEFAULT, kWindowWidth, kWindowHeight,
                      nullptr, nullptr, instance, nullptr);
  if (!window) {
    return 1;
  }
  SendMessageW(window, WM_SETICON, ICON_BIG,
               reinterpret_cast<LPARAM>(window_class.hIcon));
  SendMessageW(window, WM_SETICON, ICON_SMALL,
               reinterpret_cast<LPARAM>(window_class.hIconSm));
  if (!KSMWindowFrame::Configure(window, kWindowDecorations)) {
    MessageBoxW(window, L"The application window frame could not be configured.",
                kWindowTitle, MB_OK | MB_ICONERROR);
    DestroyWindow(window);
    return 1;
  }

#if !defined(KASUMI_DEV_MODE)
  const auto executable_dir = ExecutableDirectory();
#endif
  std::filesystem::path web_root;
  std::vector<KSMWin32ResourceDescriptor> resource_descriptors;
  std::shared_ptr<KSMWebResourceProvider> web_resources;
#if !defined(KASUMI_DEV_MODE)
  const auto requested_web_root = CommandLineValue(L"--web-root");
#if defined(KASUMI_EXTERNAL_WEB)
  web_root = requested_web_root.value_or(executable_dir / L"web");
#else
  if (requested_web_root) {
    web_root = *requested_web_root;
  }
#endif
  if (!web_root.empty() &&
      !std::filesystem::is_regular_file(web_root / L"index.html")) {
    MessageBoxW(window, L"The web root does not contain index.html.",
                kWindowTitle, MB_OK | MB_ICONERROR);
    DestroyWindow(window);
    return 1;
  }
#endif

  const auto local_data = LocalDataDirectory();
  if (!local_data) {
    MessageBoxW(window, L"The local application data directory is unavailable.",
                kWindowTitle, MB_OK | MB_ICONERROR);
    DestroyWindow(window);
    return 1;
  }
  const auto requested_data = CommandLineValue(L"--user-data-folder");
  std::filesystem::path webview_data;
  if (requested_data) {
    webview_data = *requested_data;
  } else if (smoke_test) {
    webview_data =
        *local_data / L"WebView2Smoke" / std::to_wstring(GetCurrentProcessId());
  } else {
    webview_data = *local_data / L"WebView2";
  }

  std::shared_ptr<KSMFileSystem> file_system;
#if defined(KASUMI_EXTERNAL_WEB)
  file_system = std::make_shared<KSMFileSystem>(
      *local_data / L"data", *local_data / L"cache", *local_data / L"tmp",
      web_root / L"res", web_root / L"assets");
#elif defined(KASUMI_DEV_MODE)
  file_system = std::make_shared<KSMFileSystem>(
      *local_data / L"data", *local_data / L"cache", *local_data / L"tmp",
      std::filesystem::path(), std::filesystem::path());
#else
  if (web_root.empty()) {
    resource_descriptors = kasumi_app::embedded::Resources();
    web_resources = std::make_shared<KSMWin32ResourceProvider>(
        instance, resource_descriptors);
  }
  if (web_resources) {
    file_system = std::make_shared<KSMFileSystem>(
        *local_data / L"data", *local_data / L"cache", *local_data / L"tmp",
        std::filesystem::path(), std::filesystem::path(),
        [web_resources](bool is_asset, const std::string &path) {
          const std::string prefix = is_asset ? "assets/" : "res/";
          const auto resource = web_resources->Read(prefix + path);
          if (!resource) {
            return std::optional<KSMFileSystem::ReadOnlyResource>();
          }
          return std::optional<KSMFileSystem::ReadOnlyResource>(
              KSMFileSystem::ReadOnlyResource{resource->mime_type,
                                              resource->data});
        },
        [web_resources](bool is_asset, const std::string &path) {
          const std::string prefix = is_asset ? "assets/" : "res/";
          return web_resources->List(prefix + path);
        });
  } else {
    file_system = std::make_shared<KSMFileSystem>(
        *local_data / L"data", *local_data / L"cache", *local_data / L"tmp",
        web_root / L"res", web_root / L"assets");
  }
#endif

  ShowWindow(window, smoke_test ? SW_SHOWNOACTIVATE : show_command);
  UpdateWindow(window);

 auto host = std::unique_ptr<KSMWebView2Host>(new KSMWebView2Host(
 window, file_system, ConfiguredShellOrigins(),
 web_root, webview_data, smoke_test, web_resources, start_url, dev_mode,
 KASUMI_APP_VERSION, ConfiguredCommands(), kWindowDecorations,
 std::vector<std::shared_ptr<KSMPlugin>>{std::make_shared<MusicStormPlugin>()},
 ConfiguredPermissions(), ConfiguredHttpOrigins()));

  if (!host->Initialize(
          [window, smoke_test](bool success, const std::string &error) {
            if (success) {
              if (smoke_test) {
                ShowWindow(window, SW_HIDE);
              }
              return;
            }
            if (smoke_test) {
              PostQuitMessage(1);
              return;
            }
            const std::wstring message = ToWide(error);
            MessageBoxW(window, message.c_str(), kWindowTitle,
                        MB_OK | MB_ICONERROR);
            PostMessageW(window, WM_CLOSE, 0, 0);
          })) {
    host.reset();
    DestroyWindow(window);
    return 1;
  }

  MSG message{};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }
  host->Close();
  host.reset();
  const int result = static_cast<int>(message.wParam);
  if (SUCCEEDED(com_result)) {
    CoUninitialize();
  }
  return result;
}
