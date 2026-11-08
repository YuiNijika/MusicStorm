#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <utility>

#include "ksm_sql_driver.h"

class KSMFileSystem;
struct sqlite3;

class KSMSqliteDriver final : public KSMSqlDriver {
public:
    explicit KSMSqliteDriver(std::shared_ptr<KSMFileSystem> file_system);

    std::string Name() const override;
    std::unique_ptr<KSMSqlConnection> Open(const std::string& url) override;

private:
    std::shared_ptr<KSMFileSystem> file_system_;
};

class KSMSqliteConnection final : public KSMSqlConnection {
public:
    explicit KSMSqliteConnection(sqlite3* database);
    ~KSMSqliteConnection() override;

    KSMSqliteConnection(const KSMSqliteConnection&) = delete;
    KSMSqliteConnection& operator=(const KSMSqliteConnection&) = delete;

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

    sqlite3* database_;
    std::atomic<bool> cancelled_{false};
    std::mutex cancel_mutex_;
    bool active_ = false;
    std::mutex mutex_;
};
