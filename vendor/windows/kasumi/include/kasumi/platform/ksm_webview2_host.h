#pragma once

#include <windows.h>

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "ksm_version.h"

class KSMFileSystem;
class KSMPlugin;
class KSMWebResourceProvider;
class KSMWebView2Host;
class KSMWebView2View;

using KSMWebView2InitializationCallback =
    std::function<void(bool, const std::string &)>;

struct KSMWebView2ViewOptions {
  std::wstring start_url;
  RECT bounds{};
  bool fill_parent = true;
  bool append_smoke_query = true;
  bool transparent = false;
  std::uint64_t window_id = 0;
  std::vector<std::string> allowed_commands = {};
  std::vector<std::string> allowed_permissions = {};
};

std::uint64_t AllocateKSMWindowId();

class KSMWebView2Host {
public:
  using InitializationCallback = KSMWebView2InitializationCallback;

  KSMWebView2Host(HWND window, std::shared_ptr<KSMFileSystem> file_system,
                  std::vector<std::string> allowed_external_origins,
                  std::filesystem::path web_root,
                  std::filesystem::path user_data_folder,
                  bool smoke_test = false,
                  std::shared_ptr<KSMWebResourceProvider> web_resources = {},
                  std::wstring start_url = L"https://app.local/index.html",
                  bool dev_mode = false,
                  std::string app_version = KASUMI_VERSION_STRING,
                  std::vector<std::string> allowed_commands = {},
                  bool decorations = true,
                  std::vector<std::shared_ptr<KSMPlugin>> plugins = {},
                  std::vector<std::string> allowed_permissions = {},
                  std::vector<std::string> allowed_http_origins = {},
                  std::string background_color = {});
  ~KSMWebView2Host();

  KSMWebView2Host(const KSMWebView2Host &) = delete;
  KSMWebView2Host &operator=(const KSMWebView2Host &) = delete;

  bool InitializeSession(InitializationCallback callback = {});
  bool Initialize(InitializationCallback callback = {});
  std::shared_ptr<KSMWebView2View> CreateView(
      const KSMWebView2ViewOptions &options = {},
      InitializationCallback callback = {});
  bool DestroyView(std::uint64_t window_id);
  void Close();

  std::uint64_t window_id() const noexcept;
  std::size_t view_count() const noexcept;

  static bool IsRuntimeAvailable();
  static std::string RuntimeVersion();

public:
  struct Impl;

private:
  friend class KSMWebView2View;

  std::shared_ptr<Impl> impl_;
};

class KSMWebView2View {
public:
  using InitializationCallback = KSMWebView2InitializationCallback;

  ~KSMWebView2View();

  KSMWebView2View(const KSMWebView2View &) = delete;
  KSMWebView2View &operator=(const KSMWebView2View &) = delete;

  void Close();

  bool SetBounds(const RECT &bounds);
  bool FillParent();
  bool SetVisible(bool visible);
  void PrepareParentResize(int width, int height);
  void Focus();
  bool Navigate(const std::wstring &url);
  bool Reload();

  HWND window() const noexcept;
  RECT bounds() const noexcept;
  void DispatchSystemMessage(unsigned int message, std::uintptr_t wparam);
  bool is_initialized() const noexcept;
  bool is_visible() const noexcept;
  bool fills_parent() const noexcept;
  std::uint64_t window_id() const noexcept;

  struct Impl;

private:
  friend struct KSMWebView2Host::Impl;

  explicit KSMWebView2View(std::shared_ptr<Impl> impl);
  bool Initialize(InitializationCallback callback);

  std::shared_ptr<Impl> impl_;
};
