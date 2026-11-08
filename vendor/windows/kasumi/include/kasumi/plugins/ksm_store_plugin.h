#pragma once

#include <string>
#include <vector>

#include "ksm_plugin.h"

class KSMStorePlugin final : public KSMPlugin {
public:
    const std::string& Id() const override;
    const std::vector<std::string>& Commands() const override;
    const std::vector<std::string>& Permissions() const override;

    nlohmann::json Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) override;

private:
    nlohmann::json Load(const KSMPluginContext& context) const;
    void Save(
        const KSMPluginContext& context,
        const nlohmann::json& root
    ) const;
};
