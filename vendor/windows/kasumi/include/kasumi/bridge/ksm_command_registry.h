#pragma once

#include <string>
#include <vector>

class KSMCommandRegistry {
public:
    static std::vector<std::string> SupportedCommands(
        const std::vector<std::string>& requested = {}
    );
};
