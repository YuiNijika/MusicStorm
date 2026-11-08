#pragma once

#include <string>
#include <vector>

class KSMWebViewSecurity {
public:
    static std::string ContentSecurityPolicy(
        const std::vector<std::string>& connect_sources = {}
    ) {
        std::string sources;
        for (const auto& source : connect_sources) {
            if (!source.empty()) {
                sources += " " + source;
            }
        }
        return "default-src 'self'; script-src 'self' 'unsafe-inline'; "
               "style-src 'self' 'unsafe-inline'; "
               "img-src 'self' data:" + sources + "; "
               "media-src 'self' blob:" + sources + "; "
               "connect-src 'self'" + sources + "; object-src 'none'; "
               "base-uri 'none'; frame-ancestors 'none'";
    }

    static bool IsAllowedOrigin(
        const std::string& origin,
        bool allow_development_origin = false
    );
    static bool IsAllowedNavigation(
        const std::string& url,
        bool allow_development_origin = false
    );
};
