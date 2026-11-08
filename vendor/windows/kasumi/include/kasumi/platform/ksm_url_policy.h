#pragma once

#include <cstddef>
#include <optional>
#include <set>
#include <string>
#include <vector>

class KSMUrlPolicy {
public:
    static constexpr std::size_t kMaxUrlLength = 8192;

    struct Origin {
        std::string scheme;
        std::string host;
        int port;

        bool operator<(const Origin& other) const;
        bool operator==(const Origin& other) const;
    };

    struct ParsedUrl {
        Origin origin;
        std::string path;
        std::string query;
    };

    static std::optional<ParsedUrl> ParseHttpUrl(
        const std::string& url,
        bool https_only = false
    );
    static std::optional<Origin> ParseOrigin(const std::string& value);
    static std::set<Origin> NormalizeOrigins(
        const std::vector<std::string>& values
    );
    static bool IsAllowedExternalUrl(
        const std::string& url,
        const std::set<Origin>& allowed_origins
    );
    static bool IsAllowedDownloadUrl(
        const std::string& url,
        const std::set<Origin>& allowed_origins
    );
    static std::optional<std::string> ResolveHttpsRedirect(
        const std::string& current_url,
        const std::string& location
    );
};
