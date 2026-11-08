#pragma once

#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include "../bridge/ksm_router.h"

class KSMFileSystem;
class KSMHostServices;

class KSMWebViewHost {
public:
    using SendMessage = std::function<void(const std::string&)>;
    using Dispatch = std::function<void(std::function<void()>)>;

    explicit KSMWebViewHost(
        SendMessage send_message,
        std::shared_ptr<KSMFileSystem> file_system = nullptr,
        std::shared_ptr<KSMHostServices> host_services = nullptr,
        Dispatch dispatch = {},
        std::vector<std::string> allowed_commands = {},
        bool allow_development_origin = false,
        std::vector<std::shared_ptr<KSMPlugin>> plugins = {},
        std::vector<std::string> allowed_permissions = {},
        std::string window_id = {}
    );
    ~KSMWebViewHost();

    void OnMessageReceived(const std::string& message);
    bool OnMessageReceivedFromOrigin(
        const std::string& message,
        const std::string& origin
    );
    void ResetForNavigation();
    void NotifyWebViewNavigated(bool is_reload);
    void NotifyWebViewReloaded();
    void NotifyWindowResized(int width, int height);
    void EmitEvent(
        const std::string& event,
        const std::string& payload_json
    );
    bool IsAllowedOrigin(const std::string& origin) const;
    bool IsAllowedNavigation(const std::string& url) const;

private:
    struct RequestState {
        std::string id;
        std::atomic<bool> completed{false};
        std::uint64_t timer_id = 0;
    };

    struct RuntimeState {
        std::mutex mutex;
        std::condition_variable idle;
        std::size_t active_tasks = 0;
        bool shutting_down = false;
    };

    static constexpr std::size_t kMaxConcurrentCommands = 8;
    static constexpr std::size_t kMaxQueuedCommands = 32;

    static bool StartRuntimeTask(
        const std::shared_ptr<RuntimeState>& runtime,
        std::function<void()> task
    );
    static void FinishRuntimeTask(
        const std::shared_ptr<RuntimeState>& runtime
    );
    void PostResponse(const std::string& message);
    void CancelRequest(const std::string& id);
    bool RegisterRequest(
        const std::shared_ptr<RequestState>& state,
        long long timeout_ms
    );
    void UnregisterRequest(const std::shared_ptr<RequestState>& state);
    void RespondOnce(
        const std::shared_ptr<RequestState>& state,
        const std::string& response
    );

    SendMessage send_message_;
    Dispatch dispatch_;
    KSMRouter router_;
    std::string window_id_;
    bool allow_development_origin_ = false;
    std::shared_ptr<RuntimeState> runtime_state_ =
        std::make_shared<RuntimeState>();
    std::mutex queue_mutex_;
    std::unordered_map<std::string, std::shared_ptr<RequestState>> active_requests_;
    std::size_t in_flight_ = 0;
};
