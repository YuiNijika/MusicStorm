#pragma once

#include <functional>
#include <nlohmann/json.hpp>
#include <string>
#include <utility>
#include <vector>

#include "ksm_plugin.h"

class KSMFrameworkPlugin : public KSMPlugin {
public:
    virtual const std::vector<std::string>& DefaultPermissions() const {
        static const std::vector<std::string> empty;
        return empty;
    }
};

using KSMFrameworkCommandHandler = std::function<nlohmann::json(
    const std::string&,
    const nlohmann::json&,
    const KSMPluginContext&
)>;

class KSMDelegatingFrameworkPlugin final : public KSMFrameworkPlugin {
public:
    KSMDelegatingFrameworkPlugin(
        std::string id,
        std::string name,
        std::string version,
        std::string description,
        std::vector<std::string> commands,
        std::vector<std::string> permissions,
        std::vector<std::string> events,
        std::vector<std::string> default_permissions,
        KSMFrameworkCommandHandler handler
    );

    const std::string& Id() const override;
    std::string Name() const override;
    std::string Version() const override;
    std::string Description() const override;
    const std::vector<std::string>& Commands() const override;
    const std::vector<std::string>& Permissions() const override;
    const std::vector<std::string>& Events() const override;
    const std::vector<std::string>& DefaultPermissions() const override;
    bool ValidateArgs(
        const std::string& command,
        const nlohmann::json& args
    ) const override;
    nlohmann::json Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) override;

private:
    std::string id_;
    std::string name_;
    std::string version_;
    std::string description_;
    std::vector<std::string> commands_;
    std::vector<std::string> permissions_;
    std::vector<std::string> events_;
    std::vector<std::string> default_permissions_;
    KSMFrameworkCommandHandler handler_;
};
