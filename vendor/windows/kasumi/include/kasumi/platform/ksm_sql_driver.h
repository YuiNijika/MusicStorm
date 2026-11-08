#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <type_traits>
#include <variant>
#include <vector>

#include "ksm_host_services.h"

inline constexpr std::size_t kKSMMaxSqlResultRows = 10000;
inline constexpr std::size_t kKSMMaxSqlResultBytes = 16 * 1024 * 1024;

inline std::size_t KSMSqlValueBytes(const KSMSqlValue& value) {
    return std::visit(
        [](const auto& item) -> std::size_t {
            using T = std::decay_t<decltype(item)>;
            if constexpr (std::is_same_v<T, std::string>) {
                return item.size();
            }
            if constexpr (std::is_same_v<T, std::nullptr_t>) {
                return 0;
            }
            if constexpr (std::is_same_v<T, bool>) {
                return 1;
            }
            return sizeof(item);
        },
        value
    );
}

inline void KSMSqlAppendRow(
    KSMSqlQueryResult& result,
    std::vector<KSMSqlValue> row,
    std::size_t& accumulated_bytes
) {
    if (result.rows.size() >= kKSMMaxSqlResultRows) {
        throw KSMHostException(
            "RESOURCE_LIMIT",
            "The SQL result exceeds the maximum row count."
        );
    }
    std::size_t row_bytes = 0;
    for (const auto& value : row) {
        row_bytes += KSMSqlValueBytes(value);
    }
    if (
        row_bytes > kKSMMaxSqlResultBytes ||
        accumulated_bytes > kKSMMaxSqlResultBytes - row_bytes
    ) {
        throw KSMHostException(
            "RESOURCE_LIMIT",
            "The SQL result exceeds the maximum payload size."
        );
    }
    accumulated_bytes += row_bytes;
    result.rows.push_back(std::move(row));
}

class KSMSqlConnection {
public:
    virtual ~KSMSqlConnection() = default;

    virtual KSMSqlQueryResult Query(
        const std::string& statement,
        const std::vector<KSMSqlValue>& params
    ) = 0;
    virtual KSMSqlExecuteResult Execute(
        const std::string& statement,
        const std::vector<KSMSqlValue>& params
    ) = 0;
    virtual void Cancel() {
    }
};

class KSMSqlDriver {
public:
    virtual ~KSMSqlDriver() = default;

    virtual std::string Name() const = 0;
    virtual std::unique_ptr<KSMSqlConnection> Open(
        const std::string& url
    ) = 0;
};
