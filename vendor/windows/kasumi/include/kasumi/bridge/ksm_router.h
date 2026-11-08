#pragma once

#include <functional>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <vector>

#include "../plugins/ksm_plugin_registry.h"

class KSMFileSystem;
class KSMHostServices;

class KSMRouter {
public:
    using ResponseSender = std::function<void(const std::string&)>;

    explicit KSMRouter(
        std::shared_ptr<KSMFileSystem> file_system = nullptr,
        std::shared_ptr<KSMHostServices> host_services = nullptr,
        std::vector<std::string> allowed_commands = {},
        std::vector<std::shared_ptr<KSMPlugin>> plugins = {}
    );
    KSMRouter(
        std::shared_ptr<KSMFileSystem> file_system,
        std::shared_ptr<KSMHostServices> host_services,
        std::vector<std::string> allowed_commands,
        std::vector<std::string> allowed_permissions,
        std::vector<std::shared_ptr<KSMPlugin>> plugins,
        std::string window_id = {}
    );
    void HandleMessage(const std::string& message, const ResponseSender& send_response);
    void EmitEvent(
        const std::string& event,
        const std::string& payload_json,
        const ResponseSender& send_response
    ) const;
    void SetEventSender(ResponseSender sender);
    void EmitSystemEvent(
        const std::string& event,
        const std::string& payload_json,
        const ResponseSender& send_response
    ) const;
    void CancelRequest(const std::string& request_id);
    const std::vector<std::string>& SupportedCommands() const;

private:
    bool HasPermission(const std::string& permission) const;
    bool EmitPluginEvent(
        const std::string& event,
        const nlohmann::json& payload
    ) const;

    ResponseSender event_sender_;
    std::shared_ptr<KSMFileSystem> file_system_;
    std::shared_ptr<KSMHostServices> host_services_;
    std::vector<std::string> supported_commands_;
    std::vector<std::string> capability_commands_;
    std::vector<std::string> plugin_ids_;
    std::vector<std::string> capability_events_;
    KSMPluginRegistry plugin_registry_;
    std::string window_id_;
    mutable std::mutex state_mutex_;
    std::set<std::string> granted_permissions_;
    std::set<std::string> subscribed_events_;
};
