#pragma once

#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "ksm_plugin.h"

class KSMPluginRegistry {
public:
    explicit KSMPluginRegistry(
        std::vector<std::shared_ptr<KSMPlugin>> plugins = {}
    );

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
};

std::vector<std::shared_ptr<KSMPlugin>> KSMDefaultPlugins();
