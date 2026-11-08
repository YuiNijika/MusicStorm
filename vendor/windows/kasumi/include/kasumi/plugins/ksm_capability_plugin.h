#pragma once

#include <string>
#include <vector>

#include "ksm_plugin.h"

class KSMCapabilityPlugin final : public KSMPlugin {
public:
    explicit KSMCapabilityPlugin(std::vector<std::string> commands);

    const std::string& Id() const override;
    const std::vector<std::string>& Commands() const override;
    const std::vector<std::string>& Permissions() const override;
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
    std::vector<std::string> commands_;
};

std::vector<std::string> KSMCapabilityCommands();
std::vector<std::string> KSMCapabilityEvents();
bool KSMIsCapabilityCommand(const std::string& command);
