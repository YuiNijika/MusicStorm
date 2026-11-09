#pragma once

#include <bcrypt.h>

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <ctime>
#include <exception>
#include <filesystem>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <type_traits>
#include <variant>
#include <vector>

#include <kasumi/commands/ksm_filesystem.h>
#include <kasumi/platform/ksm_host_services.h>
#include <kasumi/platform/ksm_url_policy.h>
#include <kasumi/plugins/ksm_plugin.h>

#pragma comment(lib, "bcrypt.lib")

namespace {

using Json = nlohmann::json;

constexpr char kCommand[] = "app.musicstorm.command";
constexpr char kPermission[] = "app.musicstorm";
constexpr char kEvent[] = "app.musicstorm.event";
constexpr std::uint64_t kMaxCoverBytes = 16 * 1024 * 1024;

const std::vector<std::string>& AudioExtensions() {
    static const std::vector<std::string> extensions = {
        "mp3", "flac", "wav", "m4a", "aac", "ogg", "opus", "wma", "ape"
    };
    return extensions;
}

const std::vector<std::string>& Schema() {
    static const std::vector<std::string> schema = {
        "CREATE TABLE IF NOT EXISTS library_folder ("
        "id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, "
        "display_name TEXT NOT NULL, recursive INTEGER NOT NULL DEFAULT 1, "
        "track_count INTEGER NOT NULL DEFAULT 0, "
        "last_scanned_at INTEGER NOT NULL, created_at INTEGER NOT NULL, "
        "updated_at INTEGER NOT NULL, artist TEXT NOT NULL DEFAULT '', "
        "cover_data TEXT)",
        "CREATE TABLE IF NOT EXISTS track ("
        "id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, "
        "artist TEXT NOT NULL, album TEXT NOT NULL, "
        "duration_ms INTEGER NOT NULL DEFAULT 0, cover_url TEXT, "
        "file_path TEXT, folder_id TEXT, lrc_path TEXT, bitrate INTEGER, "
        "sample_rate INTEGER, channels INTEGER, added_at INTEGER NOT NULL, "
        "updated_at INTEGER NOT NULL, content_hash TEXT, file_name TEXT)",
        "CREATE TABLE IF NOT EXISTS playlist ("
        "id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, "
        "folder_id TEXT, cover_url TEXT, created_at INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS playlist_track ("
        "playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, "
        "position INTEGER NOT NULL DEFAULT 0, "
        "PRIMARY KEY (playlist_id, track_id))",
        "CREATE TABLE IF NOT EXISTS play_session ("
        "id TEXT PRIMARY KEY, track_id TEXT NOT NULL, "
        "source TEXT NOT NULL, started_at INTEGER NOT NULL, "
        "ended_at INTEGER, listened_ms INTEGER NOT NULL DEFAULT 0, "
        "completed INTEGER NOT NULL DEFAULT 0, device_id TEXT, "
        "quality_br INTEGER, title TEXT, artist TEXT, album TEXT, "
        "file_path TEXT, file_name TEXT, content_hash TEXT, cover_url TEXT)",
        "CREATE TABLE IF NOT EXISTS listen_daily ("
        "day TEXT PRIMARY KEY, play_count INTEGER NOT NULL DEFAULT 0, "
        "unique_tracks INTEGER NOT NULL DEFAULT 0, "
        "total_ms INTEGER NOT NULL DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS app_setting ("
        "key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS api_cache ("
        "cache_key TEXT PRIMARY KEY, body TEXT NOT NULL, "
        "created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS listen_day_track ("
        "day TEXT NOT NULL, track_id TEXT NOT NULL, "
        "PRIMARY KEY (day, track_id))",
        "CREATE TABLE IF NOT EXISTS local_playlist_entry ("
        "playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, "
        "added_at INTEGER NOT NULL, anchor_track_id TEXT, "
        "anchor_cover TEXT, PRIMARY KEY (playlist_id, track_id))",
        "CREATE INDEX IF NOT EXISTS idx_track_folder ON track(folder_id)",
        "CREATE INDEX IF NOT EXISTS idx_session_started "
        "ON play_session(started_at)",
        "CREATE INDEX IF NOT EXISTS idx_session_track "
        "ON play_session(track_id)",
        "CREATE INDEX IF NOT EXISTS idx_track_hash ON track(content_hash)",
        "CREATE INDEX IF NOT EXISTS idx_track_file_name ON track(file_name)",
        "CREATE INDEX IF NOT EXISTS idx_local_entry_track "
        "ON local_playlist_entry(track_id)",
        "CREATE INDEX IF NOT EXISTS idx_api_cache_expires "
        "ON api_cache(expires_at)"
    };
    return schema;
}

std::int64_t NowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
}

std::string DayKey(std::int64_t timestamp_ms) {
    const std::time_t seconds = static_cast<std::time_t>(timestamp_ms / 1000);
    std::tm local{};
    localtime_s(&local, &seconds);
    char buffer[16]{};
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%d", &local);
    return buffer;
}

std::int64_t DayStartMs(const std::string& day) {
    if (day.size() != 10 || day[4] != '-' || day[7] != '-') {
        return 0;
    }
    try {
        std::tm local{};
        local.tm_year = std::stoi(day.substr(0, 4)) - 1900;
        local.tm_mon = std::stoi(day.substr(5, 2)) - 1;
        local.tm_mday = std::stoi(day.substr(8, 2));
        local.tm_isdst = -1;
        const std::time_t seconds = std::mktime(&local);
        return seconds < 0
            ? 0
            : static_cast<std::int64_t>(seconds) * 1000;
    } catch (const std::exception&) {
        return 0;
    }
}

std::int64_t DayEndMs(const std::string& day) {
    return DayStartMs(day) + 86'400'000 - 1;
}

std::string LowerAscii(std::string value) {
    std::transform(
        value.begin(),
        value.end(),
        value.begin(),
        [](unsigned char character) {
            return static_cast<char>(std::tolower(character));
        }
    );
    return value;
}

std::string FileStem(const std::string& name) {
    const auto dot = name.find_last_of('.');
    return dot == std::string::npos ? name : name.substr(0, dot);
}

std::string FileExtension(const std::string& name) {
    const auto dot = name.find_last_of('.');
    if (dot == std::string::npos || dot + 1 >= name.size()) {
        return {};
    }
    return LowerAscii(name.substr(dot + 1));
}

std::string FileName(const std::string& path) {
    const auto slash = path.find_last_of("/\\");
    return slash == std::string::npos ? path : path.substr(slash + 1);
}

std::string ParentPath(const std::string& path) {
    const auto slash = path.find_last_of("/\\");
    return slash == std::string::npos ? std::string() : path.substr(0, slash);
}

std::string StringField(
    const Json& object,
    const char* key,
    const std::string& fallback = {}
) {
    if (!object.is_object()) {
        return fallback;
    }
    const auto iterator = object.find(key);
    if (iterator == object.end() || !iterator->is_string()) {
        return fallback;
    }
    return iterator->get<std::string>();
}

const Json& ObjectField(const Json& object, const char* key) {
    if (!object.is_object()) {
        throw KSMHostException("INVALID_ARGS", "args must be an object.");
    }
    const auto iterator = object.find(key);
    if (iterator == object.end() || !iterator->is_object()) {
        throw KSMHostException(
            "INVALID_ARGS",
            std::string(key) + " is required."
        );
    }
    return *iterator;
}

std::string RequiredString(const Json& object, const char* key) {
    const auto value = StringField(object, key);
    if (value.empty()) {
        throw KSMHostException(
            "INVALID_ARGS",
            std::string(key) + " is required."
        );
    }
    return value;
}

KSMSqlValue SqlValue(const Json& value) {
    if (value.is_null()) {
        return nullptr;
    }
    if (value.is_boolean()) {
        return value.get<bool>();
    }
    if (value.is_number_integer()) {
        return value.get<std::int64_t>();
    }
    if (value.is_number_unsigned()) {
        const auto number = value.get<std::uint64_t>();
        if (number > 9223372036854775807ULL) {
            throw KSMHostException(
                "INVALID_ARGS",
                "SQL integer parameters must fit in a signed 64-bit integer."
            );
        }
        return static_cast<std::int64_t>(number);
    }
    if (value.is_number()) {
        return value.get<double>();
    }
    if (value.is_string()) {
        return value.get<std::string>();
    }
    throw KSMHostException(
        "INVALID_ARGS",
        "SQL parameters must be strings, numbers, booleans or null."
    );
}

Json JsonValue(const KSMSqlValue& value) {
    return std::visit(
        [](const auto& item) -> Json {
            using T = std::decay_t<decltype(item)>;
            if constexpr (std::is_same_v<T, std::nullptr_t>) {
                return nullptr;
            } else {
                return item;
            }
        },
        value
    );
}

std::vector<Json> QueryRows(
    const KSMPluginContext& context,
    const std::string& connection,
    const std::string& statement,
    const std::vector<KSMSqlValue>& params = {}
) {
    if (!context.host_services) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The SQL service is not configured."
        );
    }
    const auto result = context.host_services->SqlQuery(
        connection,
        statement,
        params,
        context.request_id
    );
    if (!result) {
        throw KSMHostException(
            "IO_ERROR",
            "The SQL query could not be completed."
        );
    }
    std::vector<Json> rows;
    rows.reserve(result->rows.size());
    for (const auto& row : result->rows) {
        Json value = Json::object();
        for (std::size_t index = 0; index < row.size(); ++index) {
            value[result->columns[index]] = JsonValue(row[index]);
        }
        rows.push_back(std::move(value));
    }
    return rows;
}

void ExecuteSql(
    const KSMPluginContext& context,
    const std::string& connection,
    const std::string& statement,
    const std::vector<KSMSqlValue>& params = {}
) {
    if (!context.host_services) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The SQL service is not configured."
        );
    }
    if (!context.host_services->SqlExecute(
            connection,
            statement,
            params,
            context.request_id
        )) {
        throw KSMHostException(
            "IO_ERROR",
            "The SQL statement could not be executed."
        );
    }
}

std::string Sha256Hex(const std::vector<std::uint8_t>& data) {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    DWORD object_length = 0;
    DWORD hash_length = 0;
    DWORD received = 0;
    const auto cleanup = [&]() {
        if (hash) {
            BCryptDestroyHash(hash);
            hash = nullptr;
        }
        if (algorithm) {
            BCryptCloseAlgorithmProvider(algorithm, 0);
            algorithm = nullptr;
        }
    };
    if (!BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(
            &algorithm,
            BCRYPT_SHA256_ALGORITHM,
            nullptr,
            0
        )) ||
        !BCRYPT_SUCCESS(BCryptGetProperty(
            algorithm,
            BCRYPT_OBJECT_LENGTH,
            reinterpret_cast<PUCHAR>(&object_length),
            sizeof(object_length),
            &received,
            0
        )) ||
        !BCRYPT_SUCCESS(BCryptGetProperty(
            algorithm,
            BCRYPT_HASH_LENGTH,
            reinterpret_cast<PUCHAR>(&hash_length),
            sizeof(hash_length),
            &received,
            0
        ))) {
        cleanup();
        throw KSMHostException("IO_ERROR", "SHA-256 is unavailable.");
    }
    std::vector<std::uint8_t> object(object_length);
    std::vector<std::uint8_t> digest(hash_length);
    if (!BCRYPT_SUCCESS(BCryptCreateHash(
            algorithm,
            &hash,
            object.data(),
            static_cast<ULONG>(object.size()),
            nullptr,
            0,
            0
        )) ||
        !BCRYPT_SUCCESS(BCryptHashData(
            hash,
            const_cast<PUCHAR>(data.data()),
            static_cast<ULONG>(data.size()),
            0
        )) ||
        !BCRYPT_SUCCESS(BCryptFinishHash(
            hash,
            digest.data(),
            static_cast<ULONG>(digest.size()),
            0
        ))) {
        cleanup();
        throw KSMHostException("IO_ERROR", "SHA-256 failed.");
    }
    cleanup();
    static constexpr char kHex[] = "0123456789abcdef";
    std::string result;
    result.reserve(digest.size() * 2);
    for (const auto byte : digest) {
        result.push_back(kHex[(byte >> 4) & 0x0F]);
        result.push_back(kHex[byte & 0x0F]);
    }
    return result;
}

std::optional<std::vector<std::uint8_t>> DecodeBase64(
    const std::string& text
) {
    static const std::string kAlphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::vector<int> values(256, -1);
    for (std::size_t index = 0; index < kAlphabet.size(); ++index) {
        values[static_cast<unsigned char>(kAlphabet[index])] =
            static_cast<int>(index);
    }
    std::vector<std::uint8_t> output;
    int buffer = 0;
    int bits = -8;
    for (const unsigned char character : text) {
        if (character == '=') {
            break;
        }
        if (std::isspace(character)) {
            continue;
        }
        const int value = values[character];
        if (value < 0) {
            return std::nullopt;
        }
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 0) {
            output.push_back(
                static_cast<std::uint8_t>((buffer >> bits) & 0xFF)
            );
            bits -= 8;
        }
    }
    return output;
}

std::string CoverExtension(const std::string& mime) {
    const std::string lower = LowerAscii(mime);
    if (lower == "image/png") {
        return "png";
    }
    if (lower == "image/webp") {
        return "webp";
    }
    if (lower == "image/gif") {
        return "gif";
    }
    if (lower == "image/avif") {
        return "avif";
    }
    return "jpg";
}

bool IsAudioName(const std::string& name) {
    const auto extension = FileExtension(name);
    const auto& extensions = AudioExtensions();
    return std::find(
        extensions.begin(),
        extensions.end(),
        extension
    ) != extensions.end();
}

std::string Trimmed(std::string value) {
    const auto begin = value.find_first_not_of(" \t\r\n");
    if (begin == std::string::npos) {
        return {};
    }
    const auto end = value.find_last_not_of(" \t\r\n");
    return value.substr(begin, end - begin + 1);
}

std::string SafeDownloadName(std::string value) {
    static constexpr std::string_view kInvalid = "<>:\"/\\|?*";
    for (char& character : value) {
        const unsigned char byte = static_cast<unsigned char>(character);
        if (byte < 0x20 || kInvalid.find(character) != std::string_view::npos) {
            character = '_';
        }
    }
    value = Trimmed(value);
    while (!value.empty() && value.back() == '.') {
        value.pop_back();
    }
    if (value.empty()) {
        value = "track.mp3";
    }
    if (value.size() > 180) {
        value.resize(180);
    }
    static constexpr std::string_view kReserved[] = {
        "con", "prn", "aux", "nul", "clock$",
        "com1", "com2", "com3", "com4", "com5",
        "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5",
        "lpt6", "lpt7", "lpt8", "lpt9"
    };
    const std::string stem = LowerAscii(value.substr(0, value.find('.')));
    for (const auto reserved : kReserved) {
        if (stem == reserved) {
            value.insert(value.begin(), '_');
            break;
        }
    }
    return value;
}

std::string UniqueDownloadPath(
    KSMHostServices& host,
    const std::string& directory,
    const std::string& name
) {
    const std::string base = directory + "/" + name;
    if (!host.PickedExists(base)) {
        return base;
    }
    const auto dot = name.find_last_of('.');
    const std::string stem = dot == std::string::npos
        ? name
        : name.substr(0, dot);
    const std::string extension = dot == std::string::npos
        ? std::string()
        : name.substr(dot);
    for (int index = 2; index <= 999; ++index) {
        const std::string candidate =
            directory + "/" + stem + " (" + std::to_string(index) + ")" +
            extension;
        if (!host.PickedExists(candidate)) {
            return candidate;
        }
    }
    throw KSMHostException(
        "RESOURCE_LIMIT",
        "A unique destination file name could not be created."
    );
}

std::string UrlEncode(const std::string& value) {
    static constexpr char kHex[] = "0123456789ABCDEF";
    std::string encoded;
    encoded.reserve(value.size());
    for (const unsigned char character : value) {
        if (
            std::isalnum(character) ||
            character == '-' ||
            character == '_' ||
            character == '.' ||
            character == '~'
        ) {
            encoded.push_back(static_cast<char>(character));
            continue;
        }
        encoded.push_back('%');
        encoded.push_back(kHex[(character >> 4) & 0x0F]);
        encoded.push_back(kHex[character & 0x0F]);
    }
    return encoded;
}

std::string FormEncode(const Json& value) {
    if (!value.is_object()) {
        return {};
    }
    std::string body;
    for (auto iterator = value.begin(); iterator != value.end(); ++iterator) {
        if (
            !iterator.value().is_string() &&
            !iterator.value().is_number() &&
            !iterator.value().is_boolean()
        ) {
            continue;
        }
        if (!body.empty()) {
            body.push_back('&');
        }
        body += UrlEncode(iterator.key());
        body.push_back('=');
        body += UrlEncode(
            iterator.value().is_string()
                ? iterator.value().get<std::string>()
                : iterator.value().dump()
        );
    }
    return body;
}

std::optional<std::string> ReadSetting(
    const KSMPluginContext& context,
    const std::string& connection,
    const std::string& key
) {
    const auto rows = QueryRows(
        context,
        connection,
        "SELECT value FROM app_setting WHERE key = ?",
        {key}
    );
    if (rows.empty()) {
        return std::nullopt;
    }
    return StringField(rows.front(), "value");
}

void WriteSetting(
    const KSMPluginContext& context,
    const std::string& connection,
    const std::string& key,
    const std::string& value
) {
    ExecuteSql(
        context,
        connection,
        "INSERT INTO app_setting (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        {key, value}
    );
}

Json PerformJsonRequest(
    const KSMPluginContext& context,
    const std::string& method,
    const std::string& url,
    std::vector<KSMHttpHeader> headers,
    const std::string& body,
    const std::string& userAgent = {},
    const std::string& referer = {},
    const std::string& cookie = {}
) {
    if (!context.host_services) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The HTTP service is not configured."
        );
    }
    KSMHttpRequestSpec request;
    request.url = url;
    request.method = method;
    request.headers = std::move(headers);
    request.body = body;
    if (!userAgent.empty()) {
        request.user_agent = userAgent;
    }
    if (!referer.empty()) {
        request.referer = referer;
    }
    if (!cookie.empty()) {
        request.cookie_header = cookie;
    }
    const auto response = context.host_services->HttpRequest(
        request,
        context.request_id
    );
    if (!response) {
        throw KSMHostException("IO_ERROR", "The HTTP request failed.");
    }
    if (response->status < 200 || response->status > 299) {
        throw KSMHostException(
            "IO_ERROR",
            "The upstream request failed with HTTP " +
                std::to_string(response->status) + "."
        );
    }
    if (response->body.size() > 8 * 1024 * 1024) {
        throw KSMHostException(
            "RESOURCE_LIMIT",
            "The upstream response is too large."
        );
    }
    try {
        return Json::parse(response->body);
    } catch (const std::exception&) {
        throw KSMHostException(
            "IO_ERROR",
            "The upstream response is not valid JSON."
        );
    }
}

std::string ImageMimeFromBytes(
    const std::vector<std::uint8_t>& bytes
) {
    if (
        bytes.size() >= 8 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47
    ) {
        return "image/png";
    }
    if (
        bytes.size() >= 3 &&
        bytes[0] == 0xFF &&
        bytes[1] == 0xD8 &&
        bytes[2] == 0xFF
    ) {
        return "image/jpeg";
    }
    if (
        bytes.size() >= 12 &&
        bytes[0] == 'R' &&
        bytes[1] == 'I' &&
        bytes[2] == 'F' &&
        bytes[3] == 'F' &&
        bytes[8] == 'W' &&
        bytes[9] == 'E' &&
        bytes[10] == 'B' &&
        bytes[11] == 'P'
    ) {
        return "image/webp";
    }
    if (
        bytes.size() >= 6 &&
        bytes[0] == 'G' &&
        bytes[1] == 'I' &&
        bytes[2] == 'F' &&
        bytes[3] == '8'
    ) {
        return "image/gif";
    }
    if (
        bytes.size() >= 12 &&
        bytes[4] == 'f' &&
        bytes[5] == 't' &&
        bytes[6] == 'y' &&
        bytes[7] == 'p'
    ) {
        return "image/avif";
    }
    return "image/jpeg";
}

} // namespace

class MusicStormPlugin final : public KSMPlugin {
public:
    const std::string& Id() const override {
        static const std::string id = "musicstorm";
        return id;
    }

    const std::vector<std::string>& Commands() const override {
        static const std::vector<std::string> commands = {kCommand};
        return commands;
    }

    const std::vector<std::string>& Permissions() const override {
        static const std::vector<std::string> permissions = {kPermission};
        return permissions;
    }

    const std::vector<std::string>& Events() const override {
        static const std::vector<std::string> events = {kEvent};
        return events;
    }

    bool ValidateArgs(
        const std::string& command,
        const nlohmann::json& args
    ) const override {
        return command == kCommand &&
            args.is_object() &&
            args.contains("command") &&
            args.at("command").is_string() &&
            args.contains("args") &&
            args.at("args").is_object();
    }

    nlohmann::json Handle(
        const std::string& command,
        const nlohmann::json& args,
        const KSMPluginContext& context
    ) override;

private:
    std::string Database(const KSMPluginContext& context);
    Json Dispatch(
        const std::string& name,
        const Json& payload,
        const KSMPluginContext& context
    );
    std::string NewId(const std::string& prefix);
    Json TrackFromProbe(
        const std::string& path,
        const std::string& name,
        const std::optional<KSMMediaProbe>& probe
    );
    Json CacheCoverBytes(
        const KSMPluginContext& context,
        const std::vector<std::uint8_t>& bytes,
        const std::string& mime
    );
    Json ClearCoverCache(
        const KSMPluginContext& context,
        const Json& payload,
        std::optional<std::uint64_t> max_bytes
    );
    bool MiniPlayerVisible(const KSMPluginContext& context);
    bool DesktopLyricVisible(const KSMPluginContext& context);

    std::string database_;
    std::mutex database_mutex_;
    std::uint64_t next_id_ = 1;
    bool mini_player_visible_ = false;
    bool desktop_lyric_visible_ = false;
    Json mini_player_state_ = Json{
        {"title", ""},
        {"artist", ""},
        {"coverUrl", nullptr},
        {"isPlaying", false},
        {"positionMs", 0},
        {"durationMs", 0}
    };
    Json desktop_lyric_state_ = Json{
        {"positionMs", 0},
        {"lines", Json::array()},
        {"trackTitle", ""},
        {"trackArtist", ""}
    };
    std::string mini_player_window_;
    std::string desktop_lyric_window_;
};

inline std::string MusicStormPlugin::Database(
    const KSMPluginContext& context
) {
    std::lock_guard lock(database_mutex_);
    if (!database_.empty()) {
        return database_;
    }
    if (!context.host_services) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The SQL service is not configured."
        );
    }
    const auto opened = context.host_services->SqlOpen(
        "sqlite",
        "app://data/musicstorm.db"
    );
    if (!opened) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The SQLite driver is not available."
        );
    }
    database_ = *opened;
    for (const auto& statement : Schema()) {
        ExecuteSql(context, database_, statement);
    }
    return database_;
}

inline std::string MusicStormPlugin::NewId(const std::string& prefix) {
    return prefix + "-" + std::to_string(NowMs()) + "-" +
        std::to_string(next_id_++);
}

inline bool MusicStormPlugin::MiniPlayerVisible(
    const KSMPluginContext& context
) {
    if (mini_player_window_.empty() || !context.host_services) {
        return false;
    }
    const auto state =
        context.host_services->GetWindowState(mini_player_window_);
    if (!state) {
        mini_player_window_.clear();
        mini_player_visible_ = false;
        return false;
    }
    mini_player_visible_ = state->visible;
    return state->visible;
}

inline bool MusicStormPlugin::DesktopLyricVisible(
    const KSMPluginContext& context
) {
    if (desktop_lyric_window_.empty() || !context.host_services) {
        return false;
    }
    const auto state =
        context.host_services->GetWindowState(desktop_lyric_window_);
    if (!state) {
        desktop_lyric_window_.clear();
        desktop_lyric_visible_ = false;
        return false;
    }
    desktop_lyric_visible_ = state->visible;
    return state->visible;
}

inline Json MusicStormPlugin::TrackFromProbe(
    const std::string& path,
    const std::string& name,
    const std::optional<KSMMediaProbe>& probe
) {
    const std::vector<std::uint8_t> path_bytes(path.begin(), path.end());
    Json result = Json::object();
    result["id"] = Sha256Hex(path_bytes).substr(0, 32);
    result["title"] =
        probe && probe->title && !probe->title->empty()
            ? *probe->title
            : FileStem(name);
    result["artist"] =
        probe && probe->artist ? *probe->artist : std::string();
    result["album"] =
        probe && probe->album ? *probe->album : std::string();
    result["path"] = path;
    result["durationMs"] =
        probe && probe->duration_ms ? *probe->duration_ms : 0;
    result["fileName"] = name;
    result["coverPath"] = probe && probe->cover
        ? Json(*probe->cover)
        : Json(nullptr);
    result["lyricText"] = probe && probe->lyrics
        ? Json(*probe->lyrics)
        : Json(nullptr);
    result["lrcPath"] = nullptr;
    return result;
}

inline Json MusicStormPlugin::CacheCoverBytes(
    const KSMPluginContext& context,
    const std::vector<std::uint8_t>& bytes,
    const std::string& mime
) {
    if (bytes.empty()) {
        throw KSMHostException("IO_ERROR", "The cover image is empty.");
    }
    if (bytes.size() > kMaxCoverBytes) {
        throw KSMHostException(
            "RESOURCE_LIMIT",
            "The cover image is too large."
        );
    }
    if (!context.file_system) {
        throw KSMHostException(
            "NOT_SUPPORTED",
            "The filesystem is not configured."
        );
    }
    const std::string extension = CoverExtension(mime);
    const std::string hash = Sha256Hex(bytes);
    const std::string original =
        "app://cache/covers/originals/" + hash + "." + extension;
    const std::string thumbnail =
        "app://cache/covers/thumbnails/" + hash + "." + extension;
    if (!context.file_system->WriteBytes(original, bytes)) {
        throw KSMHostException(
            "IO_ERROR",
            "The cover could not be cached."
        );
    }
    context.file_system->WriteBytes(thumbnail, bytes);
    return Json{
        {"originalPath", original},
        {"thumbnailPath", thumbnail}
    };
}

inline Json MusicStormPlugin::ClearCoverCache(
    const KSMPluginContext& context,
    const Json& payload,
    std::optional<std::uint64_t> max_bytes
) {
    if (!context.file_system) {
        return Json{{"removed", 0}, {"bytes", 0}};
    }
    std::vector<std::string> keep;
    if (payload.contains("keepHashes") && payload.at("keepHashes").is_array()) {
        for (const auto& value : payload.at("keepHashes")) {
            if (value.is_string()) {
                keep.push_back(LowerAscii(value.get<std::string>()));
            }
        }
    }
    struct CoverFile {
        std::string path;
        std::string hash;
        std::uint64_t size;
        std::int64_t modified;
    };
    std::vector<CoverFile> files;
    const auto collect = [&](const std::string& root, auto&& self) -> void {
        const auto entries = context.file_system->ReadDir(root);
        if (!entries) {
            return;
        }
        for (const auto& entry : *entries) {
            if (entry.metadata.kind == KSMFileKind::Directory) {
                self(entry.path, self);
                continue;
            }
            const std::string hash = LowerAscii(FileStem(entry.name));
            if (hash.size() != 64) {
                continue;
            }
            files.push_back(CoverFile{
                entry.path,
                hash,
                entry.metadata.size,
                entry.metadata.modified_at_ms.value_or(0)
            });
        }
    };
    collect("app://cache/covers/originals", collect);
    collect("app://cache/covers/thumbnails", collect);
    std::uint64_t total = 0;
    for (const auto& file : files) {
        total += file.size;
    }
    std::sort(
        files.begin(),
        files.end(),
        [](const CoverFile& left, const CoverFile& right) {
            return left.modified < right.modified;
        }
    );
    std::uint64_t removed = 0;
    std::uint64_t bytes_removed = 0;
    const auto kept = [&](const std::string& hash) {
        return std::find(keep.begin(), keep.end(), hash) != keep.end();
    };
    for (const auto& file : files) {
        if (max_bytes && total <= *max_bytes) {
            break;
        }
        if (kept(file.hash)) {
            continue;
        }
        if (context.file_system->Remove(file.path)) {
            total -= file.size;
            removed += 1;
            bytes_removed += file.size;
        }
    }
    return Json{{"removed", removed}, {"bytes", bytes_removed}};
}

inline Json MusicStormPlugin::Dispatch(
    const std::string& name,
    const Json& payload,
    const KSMPluginContext& context
) {
    if (name == "event_emit") {
        const std::string event = StringField(payload, "event");
        if (event.empty()) {
            throw KSMHostException("INVALID_ARGS", "event is required.");
        }
        const Json envelope = {
            {"event", event},
            {"payload", payload.value("payload", Json::object())}
        };
        return Json{{"emitted", context.emit_event(kEvent, envelope)}};
    }
    if (name == "is_mini_player_visible") {
        return MiniPlayerVisible(context);
    }
    if (name == "is_desktop_lyric_visible") {
        return DesktopLyricVisible(context);
    }
    if (name == "update_mini_player") {
        if (payload.contains("state") && payload.at("state").is_object()) {
            mini_player_state_ = payload.at("state");
        }
        if (!mini_player_window_.empty() && context.host_services) {
            const Json envelope = {
                {"event", "musicstorm:mini-player-state"},
                {"payload", mini_player_state_}
            };
            context.host_services->EmitWindowEvent(
                mini_player_window_,
                kEvent,
                envelope.dump()
            );
        }
        return Json{{"updated", true}};
    }
    if (name == "get_mini_player_state") {
        return mini_player_state_;
    }
    if (name == "update_desktop_lyric") {
        if (payload.contains("state") && payload.at("state").is_object()) {
            desktop_lyric_state_ = payload.at("state");
        }
        if (!desktop_lyric_window_.empty() && context.host_services) {
            const Json envelope = {
                {"event", "musicstorm:desktop-lyric-update"},
                {"payload", desktop_lyric_state_}
            };
            context.host_services->EmitWindowEvent(
                desktop_lyric_window_,
                kEvent,
                envelope.dump()
            );
        }
        return Json{{"updated", true}};
    }
    if (name == "get_desktop_lyric_state") {
        return desktop_lyric_state_;
    }
    if (name == "window_toggle_maximize") {
        if (!context.host_services) {
            return Json{{"maximized", false}, {"updated", false}};
        }
        const auto state = context.host_services->GetWindowState("");
        const bool was_maximized = state && state->maximized;
        const bool updated = was_maximized
            ? context.host_services->RestoreWindow()
            : context.host_services->MaximizeWindow();
        const auto next = context.host_services->GetWindowState("");
        return Json{
            {
                "maximized",
                next
                    ? next->maximized
                    : (updated ? !was_maximized : was_maximized)
            },
            {"updated", updated}
        };
    }
    if (name == "window_start_dragging") {
        const std::string window_id = StringField(payload, "windowId");
        const bool dragging = context.host_services &&
            context.host_services->StartWindowDrag(window_id);
        return Json{{"dragging", dragging}};
    }
    if (name == "show_mini_player") {
        if (!mini_player_window_.empty() && context.host_services) {
            const auto existing =
                context.host_services->GetWindowState(mini_player_window_);
            if (existing) {
                context.host_services->ShowWindowById(
                    mini_player_window_,
                    true
                );
                mini_player_visible_ = true;
                return Json{
                    {"visible", true},
                    {"windowId", mini_player_window_}
                };
            }
        }
        if (MiniPlayerVisible(context)) {
            context.host_services->ShowWindowById(mini_player_window_, true);
            return Json{{"visible", true}, {"windowId", mini_player_window_}};
        }
        mini_player_window_.clear();
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The window service is not configured."
            );
        }
        KSMWindowState state;
        state.visible = true;
        state.always_on_top = true;
        state.transparent = true;
        state.resizable = false;
        state.decorations = false;
        state.skip_taskbar = true;
        state.width = 380;
        state.height = 110;
        state.title = "MusicStorm Mini Player";
        const auto created =
            context.host_services->CreateWindowInstance("mini-player", state);
        if (!created) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The mini player window could not be created."
            );
        }
        mini_player_window_ = *created;
        mini_player_visible_ = true;
        return Json{{"visible", true}, {"windowId", mini_player_window_}};
    }
    if (name == "hide_mini_player") {
        if (!mini_player_window_.empty() && context.host_services) {
            context.host_services->ShowWindowById(mini_player_window_, false);
        }
        mini_player_visible_ = false;
        return Json{{"visible", false}};
    }
    if (name == "show_desktop_lyric") {
        if (!desktop_lyric_window_.empty() && context.host_services) {
            const auto existing = context.host_services->GetWindowState(
                desktop_lyric_window_
            );
            if (existing) {
                context.host_services->ShowWindowById(
                    desktop_lyric_window_,
                    true
                );
                desktop_lyric_visible_ = true;
                return Json{
                    {"visible", true},
                    {"windowId", desktop_lyric_window_}
                };
            }
        }
        if (DesktopLyricVisible(context)) {
            context.host_services->ShowWindowById(desktop_lyric_window_, true);
            return Json{{"visible", true}, {"windowId", desktop_lyric_window_}};
        }
        desktop_lyric_window_.clear();
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The window service is not configured."
            );
        }
        KSMWindowState state;
        state.visible = true;
        state.always_on_top = true;
        state.transparent = true;
        state.resizable = true;
        state.decorations = false;
        state.skip_taskbar = true;
        state.width = 460;
        state.height = 180;
        state.title = "MusicStorm Desktop Lyrics";
        const auto created = context.host_services->CreateWindowInstance(
            "desktop-lyric",
            state
        );
        if (!created) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The desktop lyric window could not be created."
            );
        }
        desktop_lyric_window_ = *created;
        desktop_lyric_visible_ = true;
        return Json{
            {"visible", true},
            {"windowId", desktop_lyric_window_}
        };
    }
    if (name == "hide_desktop_lyric") {
        if (!desktop_lyric_window_.empty() && context.host_services) {
            context.host_services->ShowWindowById(
                desktop_lyric_window_,
                false
            );
        }
        desktop_lyric_visible_ = false;
        return Json{{"visible", false}};
    }
    if (
        name == "macos_now_playing_update" ||
        name == "macos_now_playing_clear"
    ) {
        return Json{{"supported", false}};
    }
    if (name == "get_storage_paths") {
        return Json{
            {"appDir", "app://data"},
            {"configDir", "app://data"},
            {"cacheDir", "app://cache"},
            {"databasePath", "app://data/musicstorm.db"},
            {"databaseExists", context.file_system &&
                context.file_system->Exists("app://data/musicstorm.db")}
        };
    }
    if (name == "ffmpeg_detect") {
        const auto tool = context.host_services
            ? context.host_services->DetectExternalTool("ffmpeg")
            : std::nullopt;
        if (tool && tool->valid) {
            return Json{
                {"available", true},
                {"path", tool->path},
                {"version", tool->version},
                {"source", "environment"},
                {"error", nullptr}
            };
        }
        return Json{
            {"available", false},
            {"path", nullptr},
            {"version", nullptr},
            {"source", "missing"},
            {"error", "FFmpeg was not found in PATH."}
        };
    }
    if (name == "ffmpeg_validate") {
        const std::string path = RequiredString(payload, "path");
        const auto tool = context.host_services
            ? context.host_services->ValidateExternalTool(path)
            : std::nullopt;
        const bool valid = tool && tool->valid;
        return Json{
            {"available", valid},
            {"path", path},
            {"version", valid ? Json(tool->version) : Json(nullptr)},
            {"source", "manual"},
            {"error", valid ? Json(nullptr) : Json("The selected file is not a usable FFmpeg.")}
        };
    }
    if (name == "ffmpeg_set_path") {
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The external tool service is not configured."
            );
        }
        const std::string path = Trimmed(StringField(payload, "path"));
        if (!path.empty()) {
            const auto tool =
                context.host_services->ValidateExternalTool(path);
            if (!tool || !tool->valid) {
                throw KSMHostException(
                    "INVALID_ARGS",
                    "The selected file is not a usable FFmpeg."
                );
            }
        }
        context.host_services->SetExternalToolPath("ffmpeg", path);
        const auto tool = context.host_services->DetectExternalTool("ffmpeg");
        if (tool && tool->valid) {
            return Json{
                {"available", true},
                {"path", tool->path},
                {"version", tool->version},
                {"source", path.empty() ? "environment" : "configured"},
                {"error", nullptr}
            };
        }
        return Json{
            {"available", false},
            {"path", nullptr},
            {"version", nullptr},
            {"source", "missing"},
            {"error", "FFmpeg was not found in PATH."}
        };
    }
    if (name == "pick_ffmpeg_executable") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto path = context.host_services->PickExternalTool("ffmpeg");
        return path ? Json(*path) : Json(nullptr);
    }
    if (name == "pick_cover_image") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto picked = context.host_services->OpenFile(
            {"*.png;*.jpg;*.jpeg;*.webp"}
        );
        if (!picked) {
            return nullptr;
        }
        const auto bytes =
            context.host_services->ReadPickedBytes(*picked);
        if (!bytes) {
            throw KSMHostException(
                "IO_ERROR",
                "The selected image could not be read."
            );
        }
        if (bytes->size() > 16 * 1024 * 1024) {
            throw KSMHostException(
                "RESOURCE_LIMIT",
                "The selected image is too large."
            );
        }
        return CacheCoverBytes(context, *bytes, ImageMimeFromBytes(*bytes));
    }

    const std::string connection = Database(context);

    if (name == "api_cache_get") {
        const std::string key = RequiredString(payload, "key");
        const std::int64_t now = NowMs();
        ExecuteSql(
            context,
            connection,
            "DELETE FROM api_cache WHERE expires_at < ?",
            {now}
        );
        const auto rows = QueryRows(
            context,
            connection,
            "SELECT body, created_at, expires_at FROM api_cache "
            "WHERE cache_key = ? AND expires_at >= ?",
            {key, now}
        );
        if (rows.empty()) {
            return nullptr;
        }
        return Json{
            {"body", rows.front().at("body")},
            {"createdAt", rows.front().at("created_at")},
            {"expiresAt", rows.front().at("expires_at")}
        };
    }
    if (name == "api_cache_set") {
        const std::string key = RequiredString(payload, "key");
        const std::string body = StringField(payload, "body");
        const std::int64_t requested = payload.value("ttlMs", 0LL);
        const std::int64_t ttl = std::max<std::int64_t>(requested, 1000);
        const std::int64_t now = NowMs();
        ExecuteSql(
            context,
            connection,
            "DELETE FROM api_cache WHERE expires_at < ?",
            {now}
        );
        ExecuteSql(
            context,
            connection,
            "INSERT INTO api_cache (cache_key, body, created_at, expires_at) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(cache_key) DO UPDATE SET "
            "body = excluded.body, created_at = excluded.created_at, "
            "expires_at = excluded.expires_at",
            {key, body, now, now + ttl}
        );
        return nullptr;
    }
    if (name == "api_cache_clear") {
        ExecuteSql(context, connection, "DELETE FROM api_cache");
        return nullptr;
    }
    if (name == "api_cache_purge_expired") {
        const std::int64_t now = NowMs();
        const auto rows = QueryRows(
            context,
            connection,
            "SELECT COUNT(*) AS total FROM api_cache WHERE expires_at < ?",
            {now}
        );
        const std::int64_t total = rows.empty()
            ? 0
            : rows.front().at("total").get<std::int64_t>();
        ExecuteSql(
            context,
            connection,
            "DELETE FROM api_cache WHERE expires_at < ?",
            {now}
        );
        return total;
    }
    if (name == "bilibili_set_cookie") {
        const std::string cookie =
            Trimmed(RequiredString(payload, "cookie"));
        if (cookie.empty()) {
            throw KSMHostException(
                "INVALID_ARGS",
                "The login cookie is empty."
            );
        }
        WriteSetting(context, connection, "bilibili.cookie", cookie);
        return nullptr;
    }
    if (name == "bilibili_clear_cookie") {
        ExecuteSql(
            context,
            connection,
            "DELETE FROM app_setting WHERE key = ?",
            {"bilibili.cookie"}
        );
        return nullptr;
    }
    if (name == "bilibili_get_json" || name == "bilibili_post_json") {
        const bool post = name == "bilibili_post_json";
        const std::string url = Trimmed(RequiredString(payload, "url"));
        const bool passport =
            url.starts_with("https://passport.bilibili.com/");
        const std::string requestedCookie = StringField(payload, "cookie");
        const std::string cookie = requestedCookie.empty()
            ? ReadSetting(context, connection, "bilibili.cookie")
                  .value_or(std::string())
            : requestedCookie;
        std::string referer = "https://www.bilibili.com";
        const std::string userAgent =
            passport
                ? "Mozilla/5.0 BiliDroid/2.0.1 os/android "
                  "mobi_app/android_hd build/2001100 channel/master"
                : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/131.0.0.0 Safari/537.36";
        std::vector<KSMHttpHeader> headers = {
            {"Origin", "https://www.bilibili.com"},
            {"env", "prod"},
            {"app-key", passport ? "android_hd" : "android64"},
            {"Accept", "application/json"},
            {"Accept-Language", "zh-CN,zh;q=0.9"},
            {"Sec-Fetch-Site", "same-site"},
            {"Sec-Fetch-Mode", "cors"}
        };
        std::string body;
        if (post) {
            const Json form = payload.value("body", Json::object());
            body = form.is_object()
                ? FormEncode(form)
                : form.is_string() ? form.get<std::string>() : std::string();
            headers.push_back({
                "Content-Type",
                "application/x-www-form-urlencoded; charset=utf-8"
            });
            const std::string requestedReferer =
                Trimmed(StringField(payload, "refererUrl"));
            if (!requestedReferer.empty()) {
                referer = requestedReferer;
            }
        }
        return PerformJsonRequest(
            context,
            post ? "POST" : "GET",
            url,
            std::move(headers),
            body,
            userAgent,
            referer,
            cookie
        );
    }
    if (name == "bilibili_cache_audio") {
        if (!context.host_services || !context.file_system) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The audio cache service is not configured."
            );
        }
        const std::string bvid = Trimmed(RequiredString(payload, "bvid"));
        const bool valid_bvid = bvid.size() == 12 &&
            bvid.starts_with("BV") &&
            std::all_of(
                bvid.begin() + 2,
                bvid.end(),
                [](unsigned char character) {
                    return (character >= '0' && character <= '9') ||
                        (character >= 'A' && character <= 'Z') ||
                        (character >= 'a' && character <= 'z');
                }
            );
        if (!valid_bvid) {
            throw KSMHostException("INVALID_ARGS", "视频编号无效");
        }
        const std::int64_t cid = payload.value("cid", 0LL);
        const std::int64_t audio_id = payload.value("audioId", 0LL);
        if (cid <= 0 || audio_id <= 0) {
            throw KSMHostException("INVALID_ARGS", "音频编号无效");
        }
        const std::string extension = LowerAscii(
            Trimmed(RequiredString(payload, "extension"))
        );
        if (extension != "flac" && extension != "m4a") {
            throw KSMHostException("INVALID_ARGS", "音频格式无效");
        }
        const std::string url = Trimmed(RequiredString(payload, "url"));
        const auto parsed = KSMUrlPolicy::ParseHttpUrl(url, true);
        if (!parsed) {
            throw KSMHostException("INVALID_ARGS", "音频地址无效");
        }
        const std::string host = LowerAscii(parsed->origin.host);
        const bool media_host =
            host == "bilivideo.com" || host.ends_with(".bilivideo.com") ||
            host == "bilivideo.cn" || host.ends_with(".bilivideo.cn") ||
            host == "hdslb.com" || host.ends_with(".hdslb.com") ||
            host == "szbdyd.com" || host.ends_with(".szbdyd.com") ||
            (host.starts_with("upos-") && host.ends_with(".akamaized.net"));
        if (!media_host) {
            throw KSMHostException(
                "PERMISSION_DENIED",
                "音频地址不在哔哩哔哩媒体域名内"
            );
        }
        const std::string path = "app://cache/bilibili/" + bvid + "-" +
            std::to_string(cid) + "-" + std::to_string(audio_id) + "." +
            extension;
        if (const auto metadata = context.file_system->Stat(path);
            metadata && metadata->kind == KSMFileKind::File &&
            metadata->size > 0) {
            return Json{{"path", path}, {"reused", true}};
        }
        std::vector<KSMHttpHeader> headers = {
            {"Referer", "https://www.bilibili.com"},
            {
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            },
            {"Accept", "*/*"}
        };
        if (const auto cookie = ReadSetting(
                context,
                connection,
                "bilibili.cookie"
            );
            cookie && !cookie->empty()) {
            headers.push_back({"Cookie", *cookie});
        }
        const auto downloaded = context.host_services->DownloadTrusted(
            url,
            path,
            true,
            context.request_id,
            headers,
            {
                "bilivideo.com",
                "bilivideo.cn",
                "hdslb.com",
                "szbdyd.com",
                "akamaized.net"
            }
        );
        if (!downloaded) {
            throw KSMHostException(
                "IO_ERROR",
                "下载哔哩哔哩音频失败"
            );
        }
        return Json{{"path", path}, {"reused", false}};
    }
    if (name == "netease_http_post") {
        const std::string url = Trimmed(RequiredString(payload, "url"));
        const bool allowed =
            url.starts_with("https://music.163.com/") ||
            url.starts_with("https://interface.music.163.com/") ||
            url.starts_with("https://interface3.music.163.com/") ||
            url.starts_with("https://interfacepc.music.163.com/");
        if (!allowed) {
            throw KSMHostException(
                "INVALID_ARGS",
                "The Netease request host is not allowed."
            );
        }
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The HTTP service is not configured."
            );
        }
        std::vector<KSMHttpHeader> headers = {
            {"Content-Type", "application/x-www-form-urlencoded"}
        };
        const std::string userAgent = StringField(payload, "userAgent");
        const std::string referer = StringField(payload, "referer");
        const std::string origin = StringField(payload, "origin");
        if (!origin.empty()) {
            headers.push_back({"Origin", origin});
        }
        const std::string cookie = StringField(payload, "cookie");
        const std::string realIp = StringField(payload, "realIp");
        if (!realIp.empty()) {
            headers.push_back({"X-Real-IP", realIp});
            headers.push_back({"X-Forwarded-For", realIp});
        }
        KSMHttpRequestSpec request;
        request.url = url;
        request.method = "POST";
        request.headers = std::move(headers);
        request.body = StringField(payload, "body");
        if (!userAgent.empty()) {
            request.user_agent = userAgent;
        }
        if (!referer.empty()) {
            request.referer = referer;
        }
        if (!cookie.empty()) {
            request.cookie_header = cookie;
        }
        const auto response = context.host_services->HttpRequest(
            request,
            context.request_id
        );
        if (!response) {
            throw KSMHostException(
                "IO_ERROR",
                "The Netease request failed."
            );
        }
        if (response->body.size() > 8 * 1024 * 1024) {
            throw KSMHostException(
                "RESOURCE_LIMIT",
                "The response is too large."
            );
        }
        Json cookies = Json::array();
        for (const auto& header : response->headers) {
            if (LowerAscii(header.name) != "set-cookie") {
                continue;
            }
            const auto semicolon = header.value.find(';');
            cookies.push_back(
                semicolon == std::string::npos
                    ? header.value
                    : header.value.substr(0, semicolon)
            );
        }
        return Json{
            {"status", response->status},
            {"body", response->body},
            {"cookies", std::move(cookies)}
        };
    }

    if (name == "db_get_setting") {
        const std::string key = RequiredString(payload, "key");
        const auto rows = QueryRows(
            context,
            connection,
            "SELECT value FROM app_setting WHERE key = ?",
            {key}
        );
        return rows.empty() ? Json(nullptr) : rows.front().at("value");
    }
    if (name == "db_set_setting") {
        const std::string key = RequiredString(payload, "key");
        const std::string value = StringField(payload, "value");
        ExecuteSql(
            context,
            connection,
            "INSERT INTO app_setting (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            {key, value}
        );
        return Json{{"saved", true}};
    }
    if (name == "db_upsert_folder") {
        const Json& input = ObjectField(payload, "input");
        const std::string path = RequiredString(input, "path");
        const std::int64_t now = NowMs();
        const std::string display_name =
            StringField(input, "displayName", FileName(path));
        const std::int64_t track_count = input.value("trackCount", 0LL);
        const std::string artist = StringField(input, "artist");
        const Json cover = input.value("coverData", Json(nullptr));
        const auto existing = QueryRows(
            context,
            connection,
            "SELECT id FROM library_folder WHERE path = ?",
            {path}
        );
        if (!existing.empty()) {
            const std::string id = existing.front().at("id");
            ExecuteSql(
                context,
                connection,
                "UPDATE library_folder SET display_name = ?, "
                "track_count = ?, last_scanned_at = ?, updated_at = ?, "
                "artist = ?, cover_data = ? WHERE id = ?",
                {
                    display_name,
                    track_count,
                    now,
                    now,
                    artist,
                    SqlValue(cover),
                    id
                }
            );
            return id;
        }
        const std::string id = NewId("folder");
        ExecuteSql(
            context,
            connection,
            "INSERT INTO library_folder (id, path, display_name, "
            "recursive, track_count, last_scanned_at, created_at, "
            "updated_at, artist, cover_data) "
            "VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)",
            {
                id,
                path,
                display_name,
                track_count,
                now,
                now,
                now,
                artist,
                SqlValue(cover)
            }
        );
        return id;
    }
    if (name == "db_upsert_tracks") {
        const Json tracks = payload.value("tracks", Json::array());
        const std::int64_t now = NowMs();
        std::uint64_t updated = 0;
        if (tracks.is_array()) {
            for (const auto& track : tracks) {
                if (!track.is_object()) {
                    continue;
                }
                const std::string id = StringField(track, "id");
                if (id.empty()) {
                    continue;
                }
                const std::string folder_path =
                    StringField(track, "folderPath");
                Json folder_id = nullptr;
                if (!folder_path.empty()) {
                    const auto folders = QueryRows(
                        context,
                        connection,
                        "SELECT id FROM library_folder WHERE path = ?",
                        {folder_path}
                    );
                    if (!folders.empty()) {
                        folder_id = folders.front().at("id");
                    }
                }
                ExecuteSql(
                    context,
                    connection,
                    "INSERT INTO track (id, source, title, artist, album, "
                    "duration_ms, cover_url, file_path, folder_id, "
                    "lrc_path, content_hash, file_name, added_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET "
                    "title = excluded.title, artist = excluded.artist, "
                    "album = excluded.album, "
                    "duration_ms = excluded.duration_ms, "
                    "cover_url = excluded.cover_url, "
                    "file_path = excluded.file_path, "
                    "folder_id = excluded.folder_id, "
                    "lrc_path = excluded.lrc_path, "
                    "content_hash = COALESCE(excluded.content_hash, "
                    "track.content_hash), "
                    "file_name = COALESCE(excluded.file_name, "
                    "track.file_name), updated_at = excluded.updated_at",
                    {
                        id,
                        StringField(track, "source"),
                        StringField(track, "title"),
                        StringField(track, "artist"),
                        StringField(track, "album"),
                        track.value("durationMs", 0LL),
                        SqlValue(track.value("coverUrl", Json(nullptr))),
                        SqlValue(track.value("filePath", Json(nullptr))),
                        SqlValue(folder_id),
                        SqlValue(track.value("lrcPath", Json(nullptr))),
                        SqlValue(track.value("contentHash", Json(nullptr))),
                        SqlValue(track.value("fileName", Json(nullptr))),
                        now,
                        now
                    }
                );
                updated += 1;
            }
        }
        return Json{{"updated", updated}};
    }
    if (name == "db_start_play_session") {
        const Json& input = ObjectField(payload, "input");
        const std::string id = RequiredString(input, "id");
        ExecuteSql(
            context,
            connection,
            "INSERT INTO play_session (id, track_id, source, started_at, "
            "ended_at, listened_ms, completed, quality_br, title, artist, "
            "album, file_path, file_name, content_hash, cover_url) "
            "VALUES (?, ?, ?, ?, NULL, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET "
            "track_id = excluded.track_id, source = excluded.source, "
            "started_at = excluded.started_at, "
            "quality_br = excluded.quality_br, title = excluded.title, "
            "artist = excluded.artist, album = excluded.album, "
            "file_path = excluded.file_path, "
            "file_name = excluded.file_name, "
            "content_hash = excluded.content_hash, "
            "cover_url = excluded.cover_url",
            {
                id,
                StringField(input, "trackId"),
                StringField(input, "source"),
                input.value("startedAt", NowMs()),
                SqlValue(input.value("qualityBr", Json(nullptr))),
                SqlValue(input.value("title", Json(nullptr))),
                SqlValue(input.value("artist", Json(nullptr))),
                SqlValue(input.value("album", Json(nullptr))),
                SqlValue(input.value("filePath", Json(nullptr))),
                SqlValue(input.value("fileName", Json(nullptr))),
                SqlValue(input.value("contentHash", Json(nullptr))),
                SqlValue(input.value("coverUrl", Json(nullptr)))
            }
        );
        return Json{{"started", true}};
    }
    if (name == "db_end_play_session") {
        const Json& input = ObjectField(payload, "input");
        const std::string id = RequiredString(input, "id");
        const std::string track_id = StringField(input, "trackId");
        const std::int64_t started_at = input.value("startedAt", NowMs());
        const std::int64_t listened_ms = input.value("listenedMs", 0LL);
        ExecuteSql(
            context,
            connection,
            "UPDATE play_session SET ended_at = ?, listened_ms = ?, "
            "completed = ?, title = COALESCE(?, title), "
            "artist = COALESCE(?, artist), album = COALESCE(?, album), "
            "file_path = COALESCE(?, file_path), "
            "file_name = COALESCE(?, file_name), "
            "content_hash = COALESCE(?, content_hash), "
            "cover_url = COALESCE(?, cover_url) WHERE id = ?",
            {
                input.value("endedAt", NowMs()),
                listened_ms,
                input.value("completed", false) ? 1 : 0,
                SqlValue(input.value("title", Json(nullptr))),
                SqlValue(input.value("artist", Json(nullptr))),
                SqlValue(input.value("album", Json(nullptr))),
                SqlValue(input.value("filePath", Json(nullptr))),
                SqlValue(input.value("fileName", Json(nullptr))),
                SqlValue(input.value("contentHash", Json(nullptr))),
                SqlValue(input.value("coverUrl", Json(nullptr))),
                id
            }
        );
        if (listened_ms <= 0 || track_id.empty()) {
            return Json{{"recorded", false}};
        }
        const std::string day = DayKey(started_at);
        ExecuteSql(
            context,
            connection,
            "INSERT INTO listen_daily (day, play_count, unique_tracks, "
            "total_ms) VALUES (?, 1, 0, ?) ON CONFLICT(day) DO UPDATE SET "
            "play_count = listen_daily.play_count + 1, "
            "total_ms = listen_daily.total_ms + excluded.total_ms",
            {day, listened_ms}
        );
        ExecuteSql(
            context,
            connection,
            "INSERT OR IGNORE INTO listen_day_track (day, track_id) "
            "VALUES (?, ?)",
            {day, track_id}
        );
        ExecuteSql(
            context,
            connection,
            "UPDATE listen_daily SET unique_tracks = "
            "(SELECT COUNT(*) FROM listen_day_track WHERE day = ?) "
            "WHERE day = ?",
            {day, day}
        );
        return Json{{"recorded", true}};
    }
    if (name == "db_get_listen_stats") {
        const std::string day =
            StringField(payload, "day", DayKey(NowMs()));
        const auto rows = QueryRows(
            context,
            connection,
            "SELECT day, play_count AS playCount, "
            "unique_tracks AS uniqueTracks, total_ms AS totalMs "
            "FROM listen_daily WHERE day = ?",
            {day}
        );
        return rows.empty() ? Json(nullptr) : rows.front();
    }
    if (
        name == "db_list_listen_stats" ||
        name == "db_listen_source_breakdown" ||
        name == "db_list_top_tracks"
    ) {
        const int requested_days = payload.value("days", 7);
        const int days = requested_days > 0 ? requested_days : 1;
        const std::string from_day = StringField(
            payload,
            "fromDay",
            DayKey(NowMs() - static_cast<std::int64_t>(days) * 86'400'000)
        );
        const std::string to_day =
            StringField(payload, "toDay", DayKey(NowMs()));
        if (name == "db_list_listen_stats") {
            return QueryRows(
                context,
                connection,
                "SELECT day, play_count AS playCount, "
                "unique_tracks AS uniqueTracks, total_ms AS totalMs "
                "FROM listen_daily WHERE day >= ? AND day <= ? "
                "ORDER BY day ASC",
                {from_day, to_day}
            );
        }
        if (name == "db_listen_source_breakdown") {
            return QueryRows(
                context,
                connection,
                "SELECT source, COUNT(*) AS playCount, "
                "COALESCE(SUM(listened_ms), 0) AS totalMs "
                "FROM play_session WHERE started_at >= ? "
                "AND started_at <= ? GROUP BY source "
                "ORDER BY totalMs DESC",
                {DayStartMs(from_day), DayEndMs(to_day)}
            );
        }
        const int limit = std::clamp(payload.value("limit", 20), 1, 200);
        return QueryRows(
            context,
            connection,
            "SELECT s.track_id AS trackId, s.source, "
            "COALESCE(MAX(s.title), '') AS title, "
            "COALESCE(MAX(s.artist), '') AS artist, "
            "COALESCE(MAX(s.album), '') AS album, "
            "COALESCE(MAX(s.cover_url), NULL) AS coverUrl, "
            "COALESCE(MAX(s.file_path), NULL) AS filePath, "
            "COALESCE(MAX(s.file_name), NULL) AS fileName, "
            "COALESCE(MAX(s.content_hash), NULL) AS contentHash, "
            "COALESCE(MAX(t.duration_ms), 0) AS durationMs, "
            "COUNT(*) AS playCount, "
            "COALESCE(SUM(s.listened_ms), 0) AS totalMs "
            "FROM play_session s LEFT JOIN track t ON t.id = s.track_id "
            "WHERE s.started_at >= ? AND s.started_at <= ? "
            "GROUP BY s.track_id, s.source ORDER BY totalMs DESC LIMIT ?",
            {DayStartMs(from_day), DayEndMs(to_day), limit}
        );
    }
    if (name == "db_local_add_to_playlist") {
        const Json& input = ObjectField(payload, "input");
        const std::string playlist_id = StringField(input, "playlistId");
        const Json track_ids = input.value("trackIds", Json::array());
        const Json anchor_track =
            input.value("anchorTrackId", Json(nullptr));
        const Json anchor_cover =
            input.value("anchorCover", Json(nullptr));
        const std::int64_t now = NowMs();
        std::uint64_t added = 0;
        if (track_ids.is_array()) {
            for (const auto& track_id : track_ids) {
                if (!track_id.is_string()) {
                    continue;
                }
                const std::string value = track_id.get<std::string>();
                if (value.empty()) {
                    continue;
                }
                ExecuteSql(
                    context,
                    connection,
                    "INSERT INTO local_playlist_entry (playlist_id, "
                    "track_id, added_at, anchor_track_id, anchor_cover) "
                    "VALUES (?, ?, ?, ?, ?) ON CONFLICT(playlist_id, "
                    "track_id) DO UPDATE SET added_at = excluded.added_at, "
                    "anchor_track_id = excluded.anchor_track_id, "
                    "anchor_cover = excluded.anchor_cover",
                    {
                        playlist_id,
                        value,
                        now,
                        SqlValue(anchor_track),
                        SqlValue(anchor_cover)
                    }
                );
                added += 1;
            }
        }
        return Json{{"added", added}};
    }
    if (name == "db_local_for_playlist") {
        const std::string playlist_id = StringField(payload, "playlistId");
        return QueryRows(
            context,
            connection,
            "SELECT t.id, t.title, t.artist, t.album, "
            "t.duration_ms AS durationMs, t.cover_url AS coverUrl, "
            "t.file_path AS filePath, e.added_at AS addedAt, "
            "e.anchor_track_id AS anchorTrackId "
            "FROM local_playlist_entry e "
            "JOIN track t ON t.id = e.track_id "
            "WHERE e.playlist_id = ? ORDER BY e.added_at DESC",
            {playlist_id}
        );
    }
    if (name == "db_local_remove_from_playlist") {
        const std::string playlist_id = StringField(payload, "playlistId");
        const Json track_ids = payload.value("trackIds", Json::array());
        std::uint64_t removed = 0;
        if (track_ids.is_array()) {
            for (const auto& track_id : track_ids) {
                if (!track_id.is_string()) {
                    continue;
                }
                ExecuteSql(
                    context,
                    connection,
                    "DELETE FROM local_playlist_entry WHERE playlist_id = ? "
                    "AND track_id = ?",
                    {playlist_id, track_id.get<std::string>()}
                );
                removed += 1;
            }
        }
        return Json{{"removed", removed}};
    }
    if (name == "db_local_playlist_covers") {
        const Json playlist_ids =
            payload.value("playlistIds", Json::array());
        Json result = Json::array();
        if (playlist_ids.is_array()) {
            for (const auto& playlist_id : playlist_ids) {
                if (!playlist_id.is_string()) {
                    continue;
                }
                const auto rows = QueryRows(
                    context,
                    connection,
                    "SELECT e.playlist_id AS playlistId, "
                    "t.cover_url AS coverUrl, e.anchor_cover AS anchorCover, "
                    "e.anchor_track_id AS anchorTrackId "
                    "FROM local_playlist_entry e "
                    "JOIN track t ON t.id = e.track_id "
                    "WHERE e.playlist_id = ? "
                    "ORDER BY e.added_at DESC LIMIT 1",
                    {playlist_id.get<std::string>()}
                );
                if (!rows.empty()) {
                    result.push_back(rows.front());
                }
            }
        }
        return result;
    }
    if (name == "cache_cover_data_url") {
        const std::string data_url = StringField(payload, "dataUrl");
        const auto comma = data_url.find(',');
        if (!data_url.starts_with("data:") || comma == std::string::npos) {
            throw KSMHostException(
                "INVALID_ARGS",
                "dataUrl is not a data URL."
            );
        }
        const std::string header = data_url.substr(5, comma - 5);
        if (header.find(";base64") == std::string::npos) {
            throw KSMHostException(
                "INVALID_ARGS",
                "dataUrl must be base64 encoded."
            );
        }
        const std::string mime = header.substr(0, header.find(';'));
        const auto bytes = DecodeBase64(data_url.substr(comma + 1));
        if (!bytes) {
            throw KSMHostException(
                "INVALID_ARGS",
                "dataUrl is not valid base64."
            );
        }
        return CacheCoverBytes(context, *bytes, mime);
    }
    if (name == "cache_cover_url") {
        std::string url = StringField(payload, "url");
        if (url.empty()) {
            throw KSMHostException("INVALID_ARGS", "url is required.");
        }
        if (url.starts_with("http://")) {
            url = "https://" + url.substr(7);
        }
        if (!url.starts_with("https://")) {
            throw KSMHostException(
                "INVALID_ARGS",
                "Cover URLs must use HTTPS."
            );
        }
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The HTTP service is not configured."
            );
        }
        KSMHttpRequestSpec request;
        request.url = url;
        request.method = "GET";
        request.user_agent = "Music" "Storm/26";
        if (const auto parsed = KSMUrlPolicy::ParseHttpUrl(url, true)) {
            const std::string host = LowerAscii(parsed->origin.host);
            const bool bilibili_image_host =
                host == "bilibili.com" ||
                host.ends_with(".bilibili.com") ||
                host == "hdslb.com" ||
                host.ends_with(".hdslb.com") ||
                host == "biliimg.com" ||
                host.ends_with(".biliimg.com");
            if (bilibili_image_host) {
                request.referer = "https://www.bilibili.com/";
            }
        }
        const auto response = context.host_services->HttpRequest(
            request,
            context.request_id
        );
        if (!response) {
            throw KSMHostException(
                "IO_ERROR",
                "The cover download failed."
            );
        }
        if (response->status < 200 || response->status > 299) {
            throw KSMHostException(
                "IO_ERROR",
                "Cover download failed with HTTP " +
                    std::to_string(response->status) + "."
            );
        }
        std::string mime = "image/jpeg";
        for (const auto& header : response->headers) {
            if (LowerAscii(header.name) == "content-type") {
                const auto separator = header.value.find(';');
                const std::string candidate =
                    header.value.substr(0, separator);
                if (candidate.starts_with("image/")) {
                    mime = candidate;
                }
                break;
            }
        }
        const std::vector<std::uint8_t> bytes(
            response->body.begin(),
            response->body.end()
        );
        return CacheCoverBytes(context, bytes, mime);
    }
    if (name == "cover_paths_exist") {
        Json result = Json::array();
        const Json paths = payload.value("paths", Json::array());
        if (paths.is_array()) {
            for (const auto& path : paths) {
                result.push_back(
                    path.is_string() &&
                    context.file_system &&
                    context.file_system->Exists(
                        path.get<std::string>()
                    )
                );
            }
        }
        return result;
    }
    if (name == "clear_cover_cache") {
        return ClearCoverCache(context, payload, std::nullopt);
    }
    if (name == "purge_cover_cache_cmd") {
        const auto max_bytes = payload.value("maxBytes", 0LL);
        return ClearCoverCache(
            context,
            payload,
            max_bytes > 0
                ? std::optional<std::uint64_t>(
                    static_cast<std::uint64_t>(max_bytes)
                )
                : std::nullopt
        );
    }
    if (name == "pick_music_folder") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto scope = context.host_services->OpenFolder({});
        return scope ? Json(scope->path) : Json(nullptr);
    }
    if (name == "pick_music_files") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto scope = context.host_services->OpenFiles({});
        return scope ? Json(scope->files) : Json(nullptr);
    }
    if (name == "pick_download_folder") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto scope = context.host_services->OpenFolder({});
        return scope ? Json(scope->path) : Json(nullptr);
    }
    if (name == "close_devtools") {
        if (!context.host_services) {
            return false;
        }
        return context.host_services->OpenDevtools(false);
    }
    if (name == "save_url_to_file") {
        if (!context.file_system || !context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The download service is not configured."
            );
        }
        const std::string url = Trimmed(RequiredString(payload, "url"));
        const std::string default_name = SafeDownloadName(
            StringField(payload, "defaultName", "track.mp3")
        );
        const auto picked = context.host_services->SaveFile(default_name);
        if (!picked) {
            return nullptr;
        }
        const std::string temporary =
            "app://tmp/save-url-" + std::to_string(NowMs()) + ".bin";
        const auto downloaded = context.host_services->Download(
            url,
            temporary,
            true,
            context.request_id
        );
        if (!downloaded) {
            throw KSMHostException(
                "IO_ERROR",
                "The file could not be downloaded."
            );
        }
        auto bytes = context.file_system->ReadBytes(temporary);
        context.file_system->Remove(temporary);
        if (!bytes) {
            throw KSMHostException(
                "IO_ERROR",
                "The downloaded file could not be read."
            );
        }
        if (!context.host_services->WritePickedBytes(*picked, *bytes)) {
            throw KSMHostException(
                "IO_ERROR",
                "The file could not be saved."
            );
        }
        return *picked;
    }
    if (name == "save_audio_to_directory") {
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The file service is not configured."
            );
        }
        const std::string directory =
            Trimmed(RequiredString(payload, "directory"));
        const std::string file_name = SafeDownloadName(
            StringField(payload, "defaultName", "track.mp3")
        );
        const std::string source_path =
            Trimmed(StringField(payload, "sourcePath"));
        const std::string url = Trimmed(StringField(payload, "url"));
        std::optional<std::vector<std::uint8_t>> bytes;
        if (!source_path.empty()) {
            bytes = context.host_services->ReadPickedBytes(source_path);
            if (!bytes && context.file_system) {
                bytes = context.file_system->ReadBytes(source_path);
            }
        }
        if (!bytes && !url.empty()) {
            if (!context.file_system) {
                throw KSMHostException(
                    "NOT_SUPPORTED",
                    "The download service is not configured."
                );
            }
            const std::string temporary =
                "app://tmp/save-audio-" + std::to_string(NowMs()) + ".bin";
            const auto downloaded = context.host_services->Download(
                url,
                temporary,
                true,
                context.request_id
            );
            if (!downloaded) {
                throw KSMHostException(
                    "IO_ERROR",
                    "The audio file could not be downloaded."
                );
            }
            bytes = context.file_system->ReadBytes(temporary);
            context.file_system->Remove(temporary);
        }
        if (!bytes) {
            throw KSMHostException(
                "INVALID_ARGS",
                "A source path or URL is required."
            );
        }
        const std::string target = UniqueDownloadPath(
            *context.host_services,
            directory,
            file_name
        );
        if (!context.host_services->WritePickedBytes(target, *bytes)) {
            throw KSMHostException(
                "IO_ERROR",
                "The audio file could not be saved."
            );
        }
        return target;
    }
    if (name == "read_text_file") {
        const std::string path = RequiredString(payload, "path");
        if (context.file_system) {
            if (const auto text = context.file_system->ReadText(path)) {
                return *text;
            }
        }
        if (context.host_services) {
            if (const auto text =
                    context.host_services->ReadPickedText(path)) {
                return *text;
            }
        }
        throw KSMHostException("IO_ERROR", "The text file could not be read.");
    }
    if (name == "pick_text_file") {
        if (!context.host_services) {
            return nullptr;
        }
        const auto path = context.host_services->OpenFile(
            {"*.lrc;*.txt;*.md"}
        );
        if (!path) {
            return nullptr;
        }
        if (const auto text =
                context.host_services->ReadPickedText(*path)) {
            return *text;
        }
        throw KSMHostException("IO_ERROR", "The text file could not be read.");
    }
    if (
        name == "scan_music_folder" ||
        name == "scan_music_artist_folder"
    ) {
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The media service is not configured."
            );
        }
        const std::string path = RequiredString(payload, "path");
        std::vector<KSMWalkEntry> entries;
        if (path.starts_with("app://scope/")) {
            entries = context.host_services->Walk(
                path,
                context.request_id
            ).value_or(std::vector<KSMWalkEntry>{});
        } else if (context.file_system) {
            const auto directory = context.file_system->ReadDir(path);
            if (directory) {
                for (const auto& entry : *directory) {
                    entries.push_back(KSMWalkEntry{
                        entry.path,
                        entry.name,
                        entry.metadata.kind == KSMFileKind::Directory,
                        entry.metadata.size,
                        entry.metadata.modified_at_ms
                    });
                }
            }
        }
        std::vector<KSMWalkEntry> audio;
        for (const auto& entry : entries) {
            if (!entry.directory && IsAudioName(entry.name)) {
                audio.push_back(entry);
            }
        }
        if (name == "scan_music_folder") {
            Json tracks = Json::array();
            for (const auto& entry : audio) {
                tracks.push_back(TrackFromProbe(
                    entry.path,
                    entry.name,
                    context.host_services->ProbeMedia(entry.path)
                ));
            }
            return tracks;
        }
        Json groups = Json::array();
        for (const auto& entry : audio) {
            const std::string parent = ParentPath(entry.path);
            if (!parent.empty() &&
                parent != path &&
                std::find(groups.begin(), groups.end(), Json(parent)) ==
                    groups.end()) {
                groups.push_back(parent);
            }
        }
        Json tracks = Json::array();
        for (const auto& entry : audio) {
            tracks.push_back(TrackFromProbe(
                entry.path,
                entry.name,
                context.host_services->ProbeMedia(entry.path)
            ));
        }
        return Json{
            {"displayName", FileName(path)},
            {"groupFolders", groups},
            {"tracks", tracks}
        };
    }
    if (name == "scan_music_files") {
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The media service is not configured."
            );
        }
        Json tracks = Json::array();
        const Json paths = payload.value("paths", Json::array());
        if (paths.is_array()) {
            for (const auto& value : paths) {
                if (!value.is_string()) {
                    continue;
                }
                const std::string path = value.get<std::string>();
                const std::string file_name = FileName(path);
                if (!IsAudioName(file_name)) {
                    continue;
                }
                tracks.push_back(TrackFromProbe(
                    path,
                    file_name,
                    context.host_services->ProbeMedia(path)
                ));
            }
        }
        return tracks;
    }
    if (name == "find_local_setup") {
        if (!context.file_system) {
            return nullptr;
        }
        const auto expected_size = payload.value("expectedSize", 0LL);
        const std::string expected_hash =
            StringField(payload, "expectedSha256");
        const auto entries =
            context.file_system->ReadDir("app://cache/updates");
        if (!entries) {
            return nullptr;
        }
        for (const auto& entry : *entries) {
            if (entry.metadata.kind != KSMFileKind::File ||
                !LowerAscii(entry.name).ends_with("-setup.exe")) {
                continue;
            }
            if (expected_size > 0 &&
                entry.metadata.size !=
                    static_cast<std::uint64_t>(expected_size)) {
                continue;
            }
            if (!expected_hash.empty()) {
                const auto bytes = context.file_system->ReadBytes(entry.path);
                if (!bytes || Sha256Hex(*bytes) != expected_hash) {
                    continue;
                }
            }
            return entry.path;
        }
        return nullptr;
    }
    if (name == "download_update") {
        if (!context.file_system || !context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The download service is not configured."
            );
        }
        const std::string url = RequiredString(payload, "url");
        std::string file_name = FileName(url);
        const auto query = file_name.find('?');
        if (query != std::string::npos) {
            file_name = file_name.substr(0, query);
        }
        if (file_name.empty()) {
            file_name = "musicstorm-setup.exe";
        }
        const std::string path = "app://cache/updates/" + file_name;
        const auto downloaded = context.host_services->Download(
            url,
            path,
            true,
            context.request_id
        );
        if (!downloaded) {
            throw KSMHostException(
                "IO_ERROR",
                "The update package could not be downloaded."
            );
        }
        const std::string expected_hash = StringField(payload, "sha256");
        if (!expected_hash.empty()) {
            const auto bytes = context.file_system->ReadBytes(path);
            if (!bytes || Sha256Hex(*bytes) != expected_hash) {
                context.file_system->Remove(path);
                throw KSMHostException(
                    "IO_ERROR",
                    "The update package hash does not match."
                );
            }
        }
        return path;
    }
    if (name == "install_update") {
        if (!context.host_services) {
            throw KSMHostException(
                "NOT_SUPPORTED",
                "The updater is not configured."
            );
        }
        const std::string path = RequiredString(payload, "path");
        return Json{{
            "installed",
            context.host_services->InstallUpdate(
                path,
                {},
                {},
                context.request_id
            )
        }};
    }
    throw KSMHostException(
        "NOT_SUPPORTED",
        "MusicStorm command is not implemented on Windows: " + name
    );
}

inline nlohmann::json MusicStormPlugin::Handle(
    const std::string& command,
    const nlohmann::json& args,
    const KSMPluginContext& context
) {
    if (
        command != kCommand ||
        !context.has_permission ||
        !context.has_permission(kPermission)
    ) {
        throw KSMHostException(
            "PERMISSION_DENIED",
            "The MusicStorm extension is not authorized."
        );
    }
    const std::string name = args.at("command").get<std::string>();
    return Dispatch(name, args.at("args"), context);
}
