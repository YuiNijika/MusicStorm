#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#include "../platform/ksm_file_metadata.h"
#include "../platform/ksm_host_services.h"

class KSMFileSystem;
class KSMHostServices;

struct KSM final {
    KSM() = delete;

    enum class Platform {
        Windows,
    };

    using EventHandler = std::function<void(const std::string& payload_json)>;

    struct Capabilities {
        Platform platform;
        std::vector<std::string> commands;
        std::vector<std::string> permissions;
    };

    struct PingResult {
        bool pong;
    };

    struct AppInfo {
        std::string name;
        std::string version;
        Platform platform;
        std::string language;
    };

    struct Fs final {
        static std::optional<std::string> ReadText(std::string_view path);
        static bool WriteText(std::string_view path, std::string_view content);
        static bool Exists(std::string_view path);
        static bool Remove(std::string_view path);
        static std::optional<std::vector<KSMDirectoryEntry>> ReadDir(
            std::string_view path
        );
        static std::optional<bool> MakeDirectory(
            std::string_view path,
            bool recursive
        );
        static std::optional<KSMFileMetadata> Stat(std::string_view path);
    };

    struct Dialog final {
        static bool Message(std::string_view title, std::string_view message);
        static bool Confirm(std::string_view title, std::string_view message);
        static std::optional<std::string> OpenFile(
            const std::vector<std::string>& filters
        );
        static std::optional<std::string> SaveFile(std::string_view suggested_name);
    };

    struct Clipboard final {
        static std::optional<std::string> ReadText();
        static bool WriteText(std::string_view text);
    };

    struct Notification final {
        static bool Show(std::string_view title, std::string_view body);
    };

    struct Permission final {
        static std::optional<bool> Request(std::string_view permission);
    };

    struct Window final {
        static bool SetTitle(std::string_view title);
        static bool Minimize();
        static bool Maximize();
        static bool SetSize(const KSMWindowSize& size);
        static bool Close();
    };

    struct Http final {
        static std::optional<KSMHttpDownloadResult> Download(
            std::string_view url,
            std::string_view path,
            bool overwrite = false
        );
    };

    struct Shell final {
        static bool OpenExternal(std::string_view url);
    };

    struct Device final {
        static std::optional<KSMDeviceInfo> GetInfo();
    };

    struct PathDirectories {
        std::string data;
        std::string cache;
        std::string temp;
        std::string resource;
        std::string asset;
    };

    struct Path final {
        static std::optional<PathDirectories> Dirs();
        static std::optional<std::string> Join(
            std::string_view base,
            const std::vector<std::string>& segments
        );
        static std::optional<std::string> Normalize(std::string_view path);
        static std::optional<std::string> Dirname(std::string_view path);
        static std::optional<std::string> Basename(
            std::string_view path,
            std::string_view suffix = {}
        );
        static std::optional<std::string> Extname(std::string_view path);
        static std::optional<bool> IsAbsolute(std::string_view path);
    };

    struct StoreGetResult {
        bool found;
        std::string value_json;
    };

    struct Store final {
        static std::optional<StoreGetResult> Get(std::string_view key);
        static bool Set(std::string_view key, std::string_view value_json);
        static std::optional<bool> Delete(std::string_view key);
        static bool Clear();
        static std::optional<std::vector<std::string>> Keys();
    };

    struct OperatingSystemInfo {
        std::string platform;
        std::string architecture;
        std::string version;
        std::string locale;
        std::string timezone;
        std::string app_version;
    };

    struct Os final {
        static std::optional<OperatingSystemInfo> GetInfo();
    };

    enum class LogLevel {
        Trace,
        Debug,
        Info,
        Warn,
        Error,
    };

    struct Log final {
        static bool Write(
            LogLevel level,
            std::string_view message,
            std::string_view target = {}
        );
    };

    struct App final {
        static std::optional<AppInfo> GetInfo();
        static bool Exit();
    };

    static void Init(
        std::shared_ptr<KSMFileSystem> file_system = nullptr,
        std::shared_ptr<KSMHostServices> host_services = nullptr,
        std::vector<std::string> allowed_commands = {},
        std::vector<std::string> allowed_permissions = {}
    );
    static void Shutdown();
    static std::string Invoke(
        std::string_view window_id,
        std::string_view command,
        std::string_view args_json
    );
    static std::string Invoke(
        std::string_view command,
        std::string_view args_json
    );
    static std::uint64_t On(std::string_view event, EventHandler handler);
    static bool Off(std::uint64_t subscription);
    static void EmitEvent(
        std::string_view event,
        std::string_view payload_json
    );
    static Capabilities Get();

    struct Phase1 final {
        static PingResult Ping();
        static Capabilities QueryCapabilities();
    };
};
