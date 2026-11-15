#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "ksm_framework_plugin.h"

class KSMFrameworkPluginRegistry {
public:
    explicit KSMFrameworkPluginRegistry(
        std::vector<std::shared_ptr<KSMFrameworkPlugin>> plugins = {}
    );
    ~KSMFrameworkPluginRegistry();

    void Start(const KSMPluginContext& context);
    void Stop() noexcept;
    std::optional<nlohmann::json> Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) const;
    bool OwnsCommand(const std::string& command) const;
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

private:
    struct Entry {
        std::shared_ptr<KSMFrameworkPlugin> plugin;
    };

    std::vector<std::shared_ptr<KSMFrameworkPlugin>> plugins_;
    std::unordered_map<std::string, Entry> commands_;
    std::vector<std::string> plugin_ids_;
    std::vector<std::string> command_names_;
    std::vector<std::string> permissions_;
    std::vector<std::string> events_;
    std::vector<std::shared_ptr<KSMFrameworkPlugin>> started_;
};

std::vector<std::shared_ptr<KSMFrameworkPlugin>> KSMDefaultFrameworkPlugins(
    const std::vector<std::string>& enabled_commands = {},
    const std::vector<std::string>& enabled_plugins = {}
);
