#pragma once

#include <windows.h>
#include <winhttp.h>

#include <atomic>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <set>
#include <unordered_map>
#include <vector>

#include "ksm_host_services.h"
#include "ksm_url_policy.h"
#include "ksm_version.h"

class KSMFileSystem;
class KSMWindowRegistry;

class KSMWindowsHostServices final : public KSMHostServices {
public:
    explicit KSMWindowsHostServices(
        HWND window,
        std::vector<std::string> allowed_external_origins = {},
        std::shared_ptr<KSMFileSystem> file_system = nullptr,
        std::string app_version = KASUMI_VERSION_STRING,
        std::string app_id = {},
        std::shared_ptr<KSMWindowRegistry> window_registry = nullptr
    );
    KSMWindowsHostServices(
        HWND window,
        std::vector<std::string> allowed_external_origins,
        std::vector<std::string> allowed_http_origins,
        std::shared_ptr<KSMFileSystem> file_system = nullptr,
        std::string app_version = KASUMI_VERSION_STRING,
        std::string app_id = {},
        std::shared_ptr<KSMWindowRegistry> window_registry = nullptr
    );
    ~KSMWindowsHostServices() override;

    std::string AppVersion() const override;
    std::string AppId() const override;
    std::string Language() const override;
    bool ShowMessage(const std::string& title, const std::string& message) override;
    bool Confirm(const std::string& title, const std::string& message) override;
    std::optional<std::string> OpenFile(
        const std::vector<std::string>& filters
    ) override;
    std::optional<std::string> SaveFile(
        const std::string& suggested_name
    ) override;
    std::optional<std::string> ReadPickedText(
        const std::string& path
    ) override;
    std::optional<std::vector<std::uint8_t>> ReadPickedBytes(
        const std::string& path
    ) override;
    bool WritePickedBytes(
        const std::string& path,
        const std::vector<std::uint8_t>& bytes
    ) override;
    bool WritePickedText(
        const std::string& path,
        const std::string& content
    ) override;
    bool PickedExists(const std::string& path) override;
    std::optional<KSMFileMetadata> PickedStat(
        const std::string& path
    ) override;
    bool RemovePicked(const std::string& path) override;
    std::optional<std::string> ReadClipboardText() override;
    bool WriteClipboardText(const std::string& text) override;
    bool ShowNotification(
        const std::string& title,
        const std::string& body
    ) override;
    bool SetWindowTitle(const std::string& title) override;
    bool MinimizeWindow() override;
    bool MaximizeWindow() override;
    bool RestoreWindow() override;
    bool CloseWindow() override;
    bool ExitApp() override;
    std::optional<KSMHttpDownloadResult> Download(
        const std::string& url,
        const std::string& path,
        bool overwrite,
        const std::string& request_id
    ) override;
    std::optional<KSMHttpDownloadResult> DownloadTrusted(
        const std::string& url,
        const std::string& path,
        bool overwrite,
        const std::string& request_id,
        const std::vector<KSMHttpHeader>& headers,
        const std::vector<std::string>& allowed_hosts
    ) override;
    bool IsHttpRequestUrlAllowed(const std::string& url) const override;
    std::optional<KSMHttpResponse> HttpRequest(
        const KSMHttpRequestSpec& request,
        const std::string& request_id
    ) override;
    std::optional<KSMHttpTransferStart> StartHttpTransfer(
        const KSMHttpTransferSpec& request,
        const std::string& request_id
    ) override;
    bool CancelHttpTransfer(const std::string& transfer_id) override;
    std::optional<std::vector<KSMCookie>> GetCookies(
        const std::string& jar_id,
        const std::string& url
    ) override;
    bool SetCookies(
        const std::string& jar_id,
        const std::string& url,
        const std::vector<KSMCookie>& cookies
    ) override;
    bool ClearCookies(
        const std::string& jar_id,
        const std::string& url
    ) override;
    std::optional<KSMFileScope> OpenFolder(
        const std::vector<std::string>& filters
    ) override;
    std::optional<KSMFileScope> OpenFiles(
        const std::vector<std::string>& filters
    ) override;
    std::optional<std::vector<KSMWalkEntry>> Walk(
        const std::string& path,
        const std::string& request_id
    ) override;
    bool ReleaseScope(const std::string& id) override;
    std::optional<KSMMediaProbe> ProbeMedia(
        const std::string& path
    ) override;
    std::optional<KSMExternalTool> DetectExternalTool(
        const std::string& name
    ) override;
    std::optional<KSMExternalTool> ValidateExternalTool(
        const std::string& path
    ) override;
    bool SetExternalToolPath(
        const std::string& name,
        const std::string& path
    ) override;
    std::optional<std::string> PickExternalTool(
        const std::string& name
    ) override;
    bool IsExternalUrlAllowed(const std::string& url) const override;
    bool OpenExternal(const std::string& url) override;
    bool OpenPath(const std::string& path) override;
    bool ShowInFolder(const std::string& path) override;
    bool IsPrimaryInstance() const override;
    bool FocusMainWindow() override;
    bool ConfigureTray(const KSMTrayConfig& config) override;
    bool TrayShow() override;
    bool TrayHide() override;
    bool RegisterGlobalShortcut(const std::string& shortcut) override;
    bool UnregisterGlobalShortcut(const std::string& shortcut) override;
    bool InstallUpdate(
        const std::string& package_path,
        const std::string& expected_hash,
        const std::string& signature,
        const std::string& request_id
    ) override;
    std::optional<std::string> TakePendingDeepLink() override;
    bool OpenDevtools(bool enabled) override;
    bool DispatchSystemMessage(
        unsigned int message,
        std::uintptr_t wparam
    ) override;
    void SetEventDispatcher(
        std::function<void(const std::string&, const std::string&)> dispatcher
    ) override;
    void PushDeepLink(const std::string& url) override;
    bool CheckUpdate(
        bool& available,
        std::string& version
    ) override;
    bool DownloadUpdate(const std::string& version) override;
    std::optional<std::vector<KSMAudioDevice>> AudioDevices() const override;
    bool SetAudioDevice(const std::string& id) override;
    bool SetExclusiveAudioOutput(bool exclusive) override;
    bool SetAudioEqualizer(const std::vector<double>& gains) override;
    bool SetAudioSpeed(double speed) override;
    bool SetAudioVolume(double volume) override;
    std::optional<KSMAudioProbe> ProbeAudio(const std::string& path) override;
    bool LoadAudio(const std::string& path) override;
    bool SetAudioPlayback(bool playing) override;
    bool SeekAudio(std::int64_t position_ms) override;
    std::optional<KSMAudioState> GetAudioState() const override;
    bool UpdateMediaSession(
        const KSMMediaSessionMetadata& metadata
    ) override;
    bool ClearMediaSession() override;
    std::optional<std::string> CreateWindowInstance(
        const std::string& route,
        const KSMWindowState& state
    ) override;
    bool ShowWindowById(const std::string& window_id, bool visible) override;
    bool SetWindowPosition(
        const std::string& window_id,
        int x,
        int y
    ) override;
    bool SetWindowAlwaysOnTop(
        const std::string& window_id,
        bool enabled
    ) override;
    bool SetWindowTransparent(
        const std::string& window_id,
        bool enabled
    ) override;
    bool StartWindowDrag(const std::string& window_id) override;
    bool StartWindowResize(
        const std::string& window_id,
        const std::string& direction
    ) override;
    std::optional<KSMWindowState> GetWindowState(
        const std::string& window_id
    ) const override;
    bool EmitWindowEvent(
        const std::string& window_id,
        const std::string& event,
        const std::string& payload
    ) override;
    bool SetWindowSize(const KSMWindowSize& size) override;
    std::optional<KSMDeviceInfo> GetDeviceInfo() const override;
    std::optional<KSMOperatingSystemInfo>
    GetOperatingSystemInfo() const override;
    bool WriteLog(
        const std::string& level,
        const std::string& target,
        const std::string& message
    ) override;
    void CancelRequest(const std::string& request_id) override;
    void CancelRequestWithScope(const std::string& request_id) override;

#if defined(KASUMI_ENABLE_TEST_HOOKS)
    void SetDownloadTestGate(std::function<void()> gate) {
        std::lock_guard lock(download_test_gate_mutex_);
        download_test_gate_ = std::move(gate);
    }
#endif

private:
    std::optional<KSMHttpDownloadResult> DownloadInternal(
        const std::string& url,
        const std::string& path,
        bool overwrite,
        const std::string& request_id,
        const std::vector<KSMHttpHeader>& headers,
        const std::vector<std::string>& allowed_hosts,
        bool trusted
    );

    struct DownloadState {
        std::mutex mutex;
        HINTERNET session = nullptr;
        HINTERNET connect = nullptr;
        HINTERNET request = nullptr;
        std::atomic<bool> cancelled{false};
    };

    struct FileScopeState {
        std::filesystem::path root;
        std::vector<std::filesystem::path> files;
    };

    struct TransferState {
        std::mutex mutex;
        HINTERNET session = nullptr;
        HINTERNET connect = nullptr;
        HINTERNET request = nullptr;
        std::atomic<bool> cancelled{false};
        std::string request_id;
    };

    std::optional<std::string> RegisterPicked(
        const std::filesystem::path& path
    );
    std::optional<std::filesystem::path> ResolvePicked(
        const std::string& path
    ) const;
    void CloseDownloadHandles(const std::shared_ptr<DownloadState>& state);
    void SetDownloadHandles(
        const std::shared_ptr<DownloadState>& state,
        HINTERNET session,
        HINTERNET connect,
        HINTERNET request
    );
    bool IsDownloadCancelled(
        const std::shared_ptr<DownloadState>& state
    ) const;
    std::optional<FileScopeState> ResolveScope(
        const std::string& path
    ) const;
    std::optional<std::filesystem::path> ResolveScopeFile(
        const std::string& path
    ) const;
    void CloseTransferHandles(
        const std::shared_ptr<TransferState>& state
    );
    void DispatchCapabilityEvent(
        const std::string& event,
        const std::string& payload
    );

    HWND window_;
    std::shared_ptr<KSMWindowRegistry> window_registry_;
    std::shared_ptr<KSMFileSystem> file_system_;
    std::string app_version_;
    std::string app_id_;
    std::set<KSMUrlPolicy::Origin> allowed_external_origins_;
    std::set<KSMUrlPolicy::Origin> allowed_http_origins_;
    mutable std::mutex picked_mutex_;
    std::unordered_map<std::string, std::filesystem::path> picked_files_;
    std::uint64_t next_picked_id_ = 1;
    std::mutex picker_mutex_;
    mutable std::mutex download_mutex_;
    std::unordered_map<std::string, std::shared_ptr<DownloadState>> downloads_;
    mutable std::mutex capability_mutex_;
    std::unordered_map<std::string, FileScopeState> scopes_;
    std::unordered_map<std::string, std::vector<KSMCookie>> cookie_jars_;
    std::unordered_map<std::string, std::shared_ptr<TransferState>> transfers_;
    std::unordered_map<std::string, std::string> external_tools_;
    std::deque<std::string> pending_deep_links_;
    std::set<std::string> hotkeys_;
    std::unordered_map<int, std::string> hotkey_ids_;
    std::vector<KSMTrayMenuItem> tray_items_;
    mutable std::mutex audio_mutex_;
    std::string audio_source_;
    std::optional<std::int64_t> audio_duration_ms_;
    double audio_volume_ = 1.0;
    double audio_speed_ = 1.0;
    bool audio_loaded_ = false;
    bool audio_playing_ = false;
    bool tray_visible_ = false;
    bool devtools_open_ = false;
    void* single_instance_mutex_ = nullptr;
    std::function<void(const std::string&, const std::string&)> event_dispatcher_;
    std::uint64_t next_capability_id_ = 1;
#if defined(KASUMI_ENABLE_TEST_HOOKS)
    std::mutex download_test_gate_mutex_;
    std::function<void()> download_test_gate_;
#endif
};
