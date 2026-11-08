#pragma once

#include <windows.h>

#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

#include "ksm_host_services.h"

struct KSMWindowHandle {
    HWND window = nullptr;
    std::function<bool(const std::string&, const std::string&)> emit;
};

class KSMWindowRegistry {
public:
    using Creator = std::function<std::optional<std::string>(
        const std::string&,
        const KSMWindowState&)>;

    void SetCreator(Creator creator) {
        std::lock_guard lock(mutex_);
        creator_ = std::move(creator);
    }

    std::optional<std::string> Create(
        const std::string& route,
        const KSMWindowState& state
    ) {
        Creator creator;
        {
            std::lock_guard lock(mutex_);
            creator = creator_;
        }
        if (!creator) {
            return std::nullopt;
        }
        return creator(route, state);
    }

    void Register(
        const std::string& id,
        HWND window,
        std::function<bool(const std::string&, const std::string&)> emit = {}
    ) {
        if (id.empty() || window == nullptr) {
            return;
        }
        std::lock_guard lock(mutex_);
        windows_[id] = KSMWindowHandle{window, std::move(emit)};
    }

    void Unregister(const std::string& id) {
        if (id.empty()) {
            return;
        }
        std::lock_guard lock(mutex_);
        windows_.erase(id);
    }

    std::optional<KSMWindowHandle> Find(const std::string& id) const {
        std::lock_guard lock(mutex_);
        const auto iterator = windows_.find(id);
        if (iterator == windows_.end()) {
            return std::nullopt;
        }
        return iterator->second;
    }

    bool Emit(
        const std::string& id,
        const std::string& event,
        const std::string& payload
    ) const {
        std::function<bool(const std::string&, const std::string&)> emit;
        {
            std::lock_guard lock(mutex_);
            const auto iterator = windows_.find(id);
            if (iterator == windows_.end()) {
                return false;
            }
            emit = iterator->second.emit;
        }
        return emit ? emit(event, payload) : false;
    }

private:
    mutable std::mutex mutex_;
    std::unordered_map<std::string, KSMWindowHandle> windows_;
    Creator creator_;
};
