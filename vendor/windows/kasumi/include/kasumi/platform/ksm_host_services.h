#pragma once

#include <cstdint>
#include <cstddef>
#include <functional>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>
#include <vector>

#include "ksm_file_metadata.h"

class KSMSqlDriver;
class KSMSqlDriverRegistry;

struct KSMHttpDownloadResult {
    std::string path;
    std::uint64_t bytes;
};

struct KSMHttpHeader {
    std::string name;
    std::string value;
};

struct KSMHttpRequestSpec {
    std::string url;
    std::string method;
    std::vector<KSMHttpHeader> headers;
    std::string body;
    std::optional<std::string> jar_id;
    std::optional<std::string> user_agent;
    std::optional<std::string> referer;
    std::optional<std::string> cookie_header;
};

struct KSMHttpResponse {
    int status = 0;
    std::vector<KSMHttpHeader> headers;
    std::string body;
    std::optional<std::string> file;
    std::uint64_t bytes = 0;
};

struct KSMHttpTransferSpec {
    std::string url;
    std::string method;
    std::string path;
    std::vector<KSMHttpHeader> headers;
    std::string body;
    std::optional<std::string> jar_id;
    std::optional<std::string> user_agent;
    std::optional<std::string> referer;
    std::optional<std::string> cookie_header;
    bool overwrite = false;
};

struct KSMHttpTransferStart {
    std::string transfer_id;
};

struct KSMCookie {
    std::string name;
    std::string value;
    std::string domain;
    std::string path;
    bool secure = true;
    bool http_only = false;
    std::optional<std::int64_t> expires_at_ms;
};

struct KSMFileScope {
    std::string id;
    std::string path;
    std::vector<std::string> files;
};

struct KSMWalkEntry {
    std::string path;
    std::string name;
    bool directory = false;
    std::uint64_t size = 0;
    std::optional<std::int64_t> modified_at_ms;
};

struct KSMMediaProbe {
    std::optional<std::string> title;
    std::optional<std::string> artist;
    std::optional<std::string> album;
    std::optional<int> duration_ms;
    std::optional<std::string> cover;
    std::optional<std::string> lyrics;
    std::optional<std::string> format;
};

struct KSMExternalTool {
    std::string path;
    std::string version;
    bool valid = false;
};

struct KSMAudioDevice {
    std::string id;
    std::string name;
    bool default_device = false;
};

struct KSMAudioState {
    bool playing = false;
    std::int64_t position_ms = 0;
    std::optional<std::int64_t> duration_ms;
    double volume = 1.0;
    double speed = 1.0;
    std::string playback = "idle";
    bool muted = false;
    std::string output_mode = "shared";
    std::optional<std::string> device_id;
    std::optional<std::string> source;
};

struct KSMAudioProbe {
    std::optional<std::int64_t> duration_ms;
    std::optional<int> sample_rate;
    std::optional<int> channels;
    std::optional<std::string> codec;
};

struct KSMMediaSessionMetadata {
    std::string title;
    std::string artist;
    std::string album;
    std::optional<std::string> artwork;
    std::optional<std::int64_t> duration_ms;
    std::optional<std::int64_t> position_ms;
    std::string state;
};

struct KSMWindowState {
    bool visible = false;
    bool always_on_top = false;
    bool transparent = false;
    bool maximized = false;
    bool resizable = true;
    bool decorations = true;
    bool skip_taskbar = false;
    int x = 0;
    int y = 0;
    int width = 0;
    int height = 0;
    std::string url;
    std::string title;
};

struct KSMTrayMenuItem {
    std::string id;
    std::string title;
    bool enabled = true;
};

struct KSMTrayConfig {
    std::optional<std::string> icon;
    std::optional<std::string> tooltip;
    std::vector<KSMTrayMenuItem> items;
};

struct KSMWindowSize {
    int width;
    int height;
};

struct KSMDeviceInfo {
    std::string platform;
    std::string os_version;
    std::string model;
    std::string manufacturer;
    std::string app_version;
    std::string language;
    int screen_width;
    int screen_height;
    double density;
    std::string device_name;
    std::string timezone;
    std::string architecture;
};

struct KSMOperatingSystemInfo {
    std::string platform;
    std::string architecture;
    std::string version;
    std::string locale;
    std::string timezone;
    bool dev_mode = false;
    std::optional<std::string> hostname;
    std::optional<std::string> username;
};

using KSMSqlValue = std::variant<
    std::nullptr_t,
    std::int64_t,
    double,
    std::string,
    bool
>;

struct KSMSqlQueryResult {
    std::vector<std::string> columns;
    std::vector<std::vector<KSMSqlValue>> rows;
};

struct KSMSqlExecuteResult {
    std::uint64_t rows_affected;
    std::optional<std::int64_t> last_insert_id;
};

class KSMHostException final : public std::runtime_error {
public:
    KSMHostException(std::string code, const std::string& message)
        : std::runtime_error(message), code_(std::move(code)) {
    }

    const std::string& code() const noexcept {
        return code_;
    }

private:
    std::string code_;
};

class KSMHostServices {
public:
    KSMHostServices();
    virtual ~KSMHostServices();

    virtual std::string AppVersion() const = 0;
    virtual std::string AppId() const {
        return {};
    }
    virtual std::string Language() const = 0;
    virtual bool ShowMessage(const std::string& title, const std::string& message) = 0;
    virtual bool Confirm(const std::string& title, const std::string& message) = 0;
    virtual std::optional<std::string> OpenFile(
        const std::vector<std::string>& filters
    ) = 0;
    virtual std::optional<std::string> SaveFile(
        const std::string& suggested_name
    ) = 0;
    virtual std::optional<std::string> ReadPickedText(
        const std::string& path
    ) = 0;
    virtual std::optional<std::vector<std::uint8_t>> ReadPickedBytes(
        const std::string& path
    ) {
        (void)path;
        return std::nullopt;
    }
    virtual bool WritePickedBytes(
        const std::string& path,
        const std::vector<std::uint8_t>& bytes
    ) {
        (void)path;
        (void)bytes;
        return false;
    }
    virtual bool WritePickedText(
        const std::string& path,
        const std::string& content
    ) = 0;
    virtual bool PickedExists(const std::string& path) = 0;
    virtual std::optional<KSMFileMetadata> PickedStat(
        const std::string& path
    ) = 0;
    virtual bool RemovePicked(const std::string& path) = 0;
    virtual std::optional<std::string> ReadClipboardText() = 0;
    virtual bool WriteClipboardText(const std::string& text) = 0;
    virtual bool ShowNotification(
        const std::string& title,
        const std::string& body
    ) = 0;
    virtual bool SetWindowTitle(const std::string& title) = 0;
    virtual bool MinimizeWindow() = 0;
    virtual bool MaximizeWindow() = 0;
    virtual bool RestoreWindow() {
        return false;
    }
    virtual bool CloseWindow() = 0;
    virtual bool ExitApp() = 0;
    virtual std::optional<KSMHttpDownloadResult> Download(
        const std::string& url,
        const std::string& path,
        bool overwrite,
        const std::string& request_id
    ) {
        (void)url;
        (void)path;
        (void)overwrite;
        (void)request_id;
        return std::nullopt;
    }
    virtual std::optional<KSMHttpDownloadResult> DownloadTrusted(
        const std::string& url,
        const std::string& path,
        bool overwrite,
        const std::string& request_id,
        const std::vector<KSMHttpHeader>& headers,
        const std::vector<std::string>& allowed_hosts
    ) {
        (void)url;
        (void)path;
        (void)overwrite;
        (void)request_id;
        (void)headers;
        (void)allowed_hosts;
        return std::nullopt;
    }
    virtual bool IsHttpRequestUrlAllowed(const std::string& url) const {
        (void)url;
        return false;
    }
    virtual std::optional<KSMHttpResponse> HttpRequest(
        const KSMHttpRequestSpec& request,
        const std::string& request_id
    ) {
        (void)request;
        (void)request_id;
        return std::nullopt;
    }
    virtual std::optional<KSMHttpTransferStart> StartHttpTransfer(
        const KSMHttpTransferSpec& request,
        const std::string& request_id
    ) {
        (void)request;
        (void)request_id;
        return std::nullopt;
    }
    virtual bool CancelHttpTransfer(const std::string& transfer_id) {
        (void)transfer_id;
        return false;
    }
    virtual std::optional<std::vector<KSMCookie>> GetCookies(
        const std::string& jar_id,
        const std::string& url
    ) {
        (void)jar_id;
        (void)url;
        return std::nullopt;
    }
    virtual bool SetCookies(
        const std::string& jar_id,
        const std::string& url,
        const std::vector<KSMCookie>& cookies
    ) {
        (void)jar_id;
        (void)url;
        (void)cookies;
        return false;
    }
    virtual bool ClearCookies(
        const std::string& jar_id,
        const std::string& url
    ) {
        (void)jar_id;
        (void)url;
        return false;
    }
    virtual std::optional<KSMFileScope> OpenFolder(
        const std::vector<std::string>& filters
    ) {
        (void)filters;
        return std::nullopt;
    }
    virtual std::optional<KSMFileScope> OpenFiles(
        const std::vector<std::string>& filters
    ) {
        (void)filters;
        return std::nullopt;
    }
    virtual std::optional<std::vector<KSMWalkEntry>> Walk(
        const std::string& path,
        const std::string& request_id
    ) {
        (void)path;
        (void)request_id;
        return std::nullopt;
    }
    virtual bool ReleaseScope(const std::string& id) {
        (void)id;
        return false;
    }
    virtual std::optional<KSMMediaProbe> ProbeMedia(
        const std::string& path
    ) {
        (void)path;
        return std::nullopt;
    }
    virtual std::optional<KSMExternalTool> DetectExternalTool(
        const std::string& name
    ) {
        (void)name;
        return std::nullopt;
    }
    virtual std::optional<KSMExternalTool> ValidateExternalTool(
        const std::string& path
    ) {
        (void)path;
        return std::nullopt;
    }
    virtual bool SetExternalToolPath(
        const std::string& name,
        const std::string& path
    ) {
        (void)name;
        (void)path;
        return false;
    }
    virtual std::optional<std::string> PickExternalTool(
        const std::string& name
    ) {
        (void)name;
        return std::nullopt;
    }
    virtual bool IsExternalUrlAllowed(const std::string& url) const {
        (void)url;
        return false;
    }
    virtual bool OpenExternal(const std::string& url) {
        (void)url;
        return false;
    }
    virtual bool OpenPath(const std::string& path) {
        (void)path;
        return false;
    }
    virtual bool ShowInFolder(const std::string& path) {
        (void)path;
        return false;
    }
    virtual bool IsPrimaryInstance() const {
        return true;
    }
    virtual bool FocusMainWindow() {
        return false;
    }
    virtual bool ConfigureTray(const KSMTrayConfig& config) {
        (void)config;
        return false;
    }
    virtual bool TrayShow() {
        return false;
    }
    virtual bool TrayHide() {
        return false;
    }
    virtual bool RegisterGlobalShortcut(const std::string& shortcut) {
        (void)shortcut;
        return false;
    }
    virtual bool UnregisterGlobalShortcut(const std::string& shortcut) {
        (void)shortcut;
        return false;
    }
    virtual bool InstallUpdate(
        const std::string& package_path,
        const std::string& expected_hash,
        const std::string& signature,
        const std::string& request_id
    ) {
        (void)package_path;
        (void)expected_hash;
        (void)signature;
        (void)request_id;
        return false;
    }
    virtual std::optional<std::string> TakePendingDeepLink() {
        return std::nullopt;
    }
    virtual bool OpenDevtools(bool enabled) {
        (void)enabled;
        return false;
    }
    virtual bool DispatchSystemMessage(unsigned int message, std::uintptr_t wparam) {
        (void)message;
        (void)wparam;
        return false;
    }
    virtual bool CheckUpdate(
        bool& available,
        std::string& version
    ) {
        (void)version;
        available = false;
        return true;
    }
    virtual bool DownloadUpdate(const std::string& version) {
        (void)version;
        return false;
    }
    virtual std::optional<std::vector<KSMAudioDevice>> AudioDevices() const {
        return std::nullopt;
    }
    virtual bool SetAudioDevice(const std::string& id) {
        (void)id;
        return false;
    }
    virtual bool SetExclusiveAudioOutput(bool exclusive) {
        (void)exclusive;
        return false;
    }
    virtual bool SetAudioEqualizer(const std::vector<double>& gains) {
        (void)gains;
        return false;
    }
    virtual bool SetAudioSpeed(double speed) {
        (void)speed;
        return false;
    }
    virtual bool SetAudioVolume(double volume) {
        (void)volume;
        return false;
    }
    virtual std::optional<KSMAudioProbe> ProbeAudio(const std::string& path) {
        (void)path;
        return std::nullopt;
    }
    virtual bool LoadAudio(const std::string& path) {
        (void)path;
        return false;
    }
    virtual bool SetAudioPlayback(bool playing) {
        (void)playing;
        return false;
    }
    virtual bool SeekAudio(std::int64_t position_ms) {
        (void)position_ms;
        return false;
    }
    virtual std::optional<KSMAudioState> GetAudioState() const {
        return std::nullopt;
    }
    virtual bool UpdateMediaSession(const KSMMediaSessionMetadata& metadata) {
        (void)metadata;
        return false;
    }
    virtual bool ClearMediaSession() {
        return false;
    }
    virtual std::optional<std::string> CreateWindowInstance(
        const std::string& route,
        const KSMWindowState& state
    ) {
        (void)route;
        (void)state;
        return std::nullopt;
    }
    virtual bool ShowWindowById(const std::string& window_id, bool visible) {
        (void)window_id;
        (void)visible;
        return false;
    }
    virtual bool SetWindowPosition(
        const std::string& window_id,
        int x,
        int y
    ) {
        (void)window_id;
        (void)x;
        (void)y;
        return false;
    }
    virtual bool SetWindowAlwaysOnTop(
        const std::string& window_id,
        bool enabled
    ) {
        (void)window_id;
        (void)enabled;
        return false;
    }
    virtual bool SetWindowTransparent(
        const std::string& window_id,
        bool enabled
    ) {
        (void)window_id;
        (void)enabled;
        return false;
    }
    virtual bool StartWindowDrag(const std::string& window_id) {
        (void)window_id;
        return false;
    }
    virtual bool StartWindowResize(
        const std::string& window_id,
        const std::string& direction
    ) {
        (void)window_id;
        (void)direction;
        return false;
    }
    virtual std::optional<KSMWindowState> GetWindowState(
        const std::string& window_id
    ) const {
        (void)window_id;
        return std::nullopt;
    }
    virtual bool EmitWindowEvent(
        const std::string& window_id,
        const std::string& event,
        const std::string& payload
    ) {
        (void)window_id;
        (void)event;
        (void)payload;
        return false;
    }
    virtual void SetEventDispatcher(
        std::function<void(const std::string&, const std::string&)> dispatcher
    ) {
        (void)dispatcher;
    }
    virtual void PushDeepLink(const std::string& url) {
        (void)url;
    }
    virtual bool SetWindowSize(const KSMWindowSize& size) {
        (void)size;
        return false;
    }
    virtual std::optional<KSMDeviceInfo> GetDeviceInfo() const {
        return std::nullopt;
    }
    virtual std::optional<KSMOperatingSystemInfo>
    GetOperatingSystemInfo() const {
        return std::nullopt;
    }
    virtual bool WriteLog(
        const std::string& level,
        const std::string& target,
        const std::string& message
    ) {
        (void)level;
        (void)target;
        (void)message;
        return false;
    }
    void RegisterSqlDriver(std::shared_ptr<KSMSqlDriver> driver);
    virtual std::vector<std::string> SqlDrivers() const;
    virtual std::optional<std::string> SqlOpen(
        const std::string& driver,
        const std::string& url
    );
    virtual std::optional<KSMSqlQueryResult> SqlQuery(
        const std::string& connection_id,
        const std::string& statement,
        const std::vector<KSMSqlValue>& params,
        const std::string& request_id = ""
    );
    virtual std::optional<KSMSqlExecuteResult> SqlExecute(
        const std::string& connection_id,
        const std::string& statement,
        const std::vector<KSMSqlValue>& params,
        const std::string& request_id = ""
    );
    virtual bool SqlClose(const std::string& connection_id);
    virtual void CancelRequest(const std::string& request_id);
    virtual void CancelRequestWithScope(const std::string& request_id) {
        CancelRequest(request_id);
    }

private:
    std::unique_ptr<KSMSqlDriverRegistry> sql_drivers_;
};
