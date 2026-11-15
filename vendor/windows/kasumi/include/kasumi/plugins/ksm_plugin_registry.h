#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "ksm_plugin.h"

class KSMAppPluginRegistry {
public:
    explicit KSMAppPluginRegistry(
        std::vector<std::shared_ptr<KSMPlugin>> plugins = {}
    );
    ~KSMAppPluginRegistry();

    void Start(const KSMPluginContext& context);
    void Stop() noexcept;
    void OnFrameworkEvent(
        const std::string& event,
        const nlohmann::json& payload
    ) const;

    std::optional<nlohmann::json> Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) const;
    bool OwnsCommand(const std::string& command) const;
    bool KnowsPlugin(const std::string& plugin_id) const;
    bool KnowsPermission(const std::string& permission) const;
    bool KnowsEvent(const std::string& event) const;
    std::string PluginIdForCommand(const std::string& command) const;
    const std::vector<std::string>& PermissionsForCommand(
        const std::string& command
    ) const;
    bool ValidateArgs(
        const std::string& command,
        const nlohmann::json& args
    ) const;
    const std::vector<std::string>& PluginIds() const;
    const std::vector<std::string>& Commands() const;
    const std::vector<std::string>& Permissions() const;
    const std::vector<std::string>& Events() const;
    const std::vector<std::string>& FrameworkEvents() const;
    std::string NameForPlugin(const std::string& plugin_id) const;
    std::string VersionForPlugin(const std::string& plugin_id) const;
    std::string DescriptionForPlugin(const std::string& plugin_id) const;

private:
    struct Entry {
        std::shared_ptr<KSMPlugin> plugin;
    };

    std::vector<std::shared_ptr<KSMPlugin>> plugins_;
    std::unordered_map<std::string, Entry> commands_;
    std::vector<std::string> plugin_ids_;
    std::vector<std::string> command_names_;
    std::vector<std::string> permissions_;
    std::vector<std::string> events_;
    std::vector<std::string> framework_events_;
    std::vector<std::shared_ptr<KSMPlugin>> started_;
};

using KSMPluginRegistry = KSMAppPluginRegistry;
