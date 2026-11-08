#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "ksm_sql_driver.h"

class KSMOdbcSqlDriver final : public KSMSqlDriver {
public:
    static std::vector<std::shared_ptr<KSMSqlDriver>> Discover();

    KSMOdbcSqlDriver(
        std::string name,
        std::string scheme,
        std::string odbc_driver,
        int default_port
    );

    std::string Name() const override;
    std::unique_ptr<KSMSqlConnection> Open(const std::string& url) override;

private:
    std::string name_;
    std::string scheme_;
    std::string odbc_driver_;
    int default_port_;
};

class KSMOdbcSqlConnection final : public KSMSqlConnection {
public:
    KSMOdbcSqlConnection(
        void* environment,
        void* connection
    );
    ~KSMOdbcSqlConnection() override;

    KSMOdbcSqlConnection(const KSMOdbcSqlConnection&) = delete;
    KSMOdbcSqlConnection& operator=(const KSMOdbcSqlConnection&) = delete;

    KSMSqlQueryResult Query(
        const std::string& statement,
        const std::vector<KSMSqlValue>& params
    ) override;
    KSMSqlExecuteResult Execute(
        const std::string& statement,
        const std::vector<KSMSqlValue>& params
    ) override;
    void Cancel() override;

private:
    void BeginOperation();
    void EndOperation();
    void ThrowIfCancelled() const;
    void SetActiveStatement(void* statement);
    void ClearActiveStatement(void* statement);

    void* environment_;
    void* connection_;
    std::mutex cancel_mutex_;
    void* active_statement_ = nullptr;
    std::atomic<bool> cancelled_{false};
    bool active_ = false;
    std::mutex mutex_;
};
