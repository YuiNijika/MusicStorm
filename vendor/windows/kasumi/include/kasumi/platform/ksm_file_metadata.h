#pragma once

#include <cstdint>
#include <optional>
#include <string>

enum class KSMFileKind {
    File,
    Directory
};

struct KSMFileMetadata {
    KSMFileKind kind = KSMFileKind::File;
    std::uint64_t size = 0;
    std::optional<std::int64_t> modified_at_ms;
};

struct KSMDirectoryEntry {
    std::string name;
    std::string path;
    KSMFileMetadata metadata;
};
