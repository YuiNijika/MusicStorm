#pragma once

#include <functional>
#include <memory>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

class KSMFileSystem;
class KSMHostServices;

struct KSMPluginContext {
    using EventSender =
        std::function<bool(const std::string&, const nlohmann::json&)>;

    std::shared_ptr<KSMFileSystem> file_system;
    std::shared_ptr<KSMHostServices> host_services;
    std::function<bool(const std::string&)> has_permission;
    std::string request_id;
    std::string window_id = "default";
    EventSender emit_event = [](const std::string&, const nlohmann::json&) {
        return false;
    };
};

class KSMPlugin {
public:
    virtual ~KSMPlugin() = default;

    virtual const std::string& Id() const = 0;
    virtual const std::vector<std::string>& Commands() const = 0;
    virtual const std::vector<std::string>& Permissions() const {
        static const std::vector<std::string> empty;
        return empty;
    }
    virtual const std::vector<std::string>& Events() const {
        static const std::vector<std::string> empty;
        return empty;
    }
    virtual bool ValidateArgs(
        const std::string& command,
        const nlohmann::json& args
    ) const {
        (void)command;
        return args.is_object();
    }
    virtual nlohmann::json Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) = 0;
};
