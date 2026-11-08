#pragma once

#include "ksm_plugin.h"

class KSMWindowPlugin final : public KSMPlugin {
public:
    const std::string& Id() const override;
    const std::vector<std::string>& Commands() const override;
    const std::vector<std::string>& Permissions() const override;
    nlohmann::json Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) override;
};
