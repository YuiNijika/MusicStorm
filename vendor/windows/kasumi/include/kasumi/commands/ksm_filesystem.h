#pragma once

#include <atomic>
#include <filesystem>
#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "../platform/ksm_file_metadata.h"

class KSMFileSystem {
public:
  struct ReadOnlyResource {
    std::string mime_type;
    std::vector<std::uint8_t> data;
  };
  using ReadOnlyResourceProvider =
      std::function<std::optional<ReadOnlyResource>(
          bool is_asset, const std::string &relative_path)>;
  using ReadOnlyDirectoryProvider = std::function<std::vector<std::string>(
      bool is_asset, const std::string &relative_path)>;

  static constexpr std::size_t kMaxTextBytes = 16 * 1024 * 1024;

  KSMFileSystem(std::filesystem::path data_root,
                std::filesystem::path cache_root,
                std::filesystem::path temp_root,
                std::filesystem::path resource_root = {},
                std::filesystem::path asset_root = {},
                ReadOnlyResourceProvider read_only_resource_provider = {},
                ReadOnlyDirectoryProvider read_only_directory_provider = {});

  std::optional<std::string> ReadText(const std::string &path) const;
  bool WriteText(const std::string &path, const std::string &content) const;
  bool WriteTextAtomic(const std::string &path, const std::string &content) const;
  bool AppendText(const std::string &path, const std::string &content) const;
  bool Copy(const std::string &from_path,
            const std::string &to_path) const;
  bool Move(const std::string &from_path, const std::string &to_path) const;
  std::optional<std::vector<std::uint8_t>>
  ReadBytes(const std::string &path) const;
  bool WriteBytes(const std::string &path,
                  const std::vector<std::uint8_t> &bytes) const;
  bool Exists(const std::string &path) const;
  bool Remove(const std::string &path) const;
  std::optional<std::vector<KSMDirectoryEntry>>
  ReadDir(const std::string &path) const;
  std::optional<bool> MakeDirectory(const std::string &path,
                                    bool recursive) const;
  std::optional<KSMFileMetadata> Stat(const std::string &path) const;
  std::optional<std::string>
  CreateTemporaryText(const std::string &content) const;
  std::optional<std::filesystem::path>
  ResolveWritableFile(const std::string &path) const;
  std::optional<std::filesystem::path>
  ResolveReadableFile(const std::string &path) const;

private:
  std::optional<std::filesystem::path>
  ResolveReadable(const std::string &path) const;
  std::optional<std::filesystem::path>
  ResolveWritable(const std::string &path) const;
  std::optional<std::filesystem::path>
  ResolveReadableDirectory(const std::string &path) const;
  std::optional<std::filesystem::path>
  ResolveWritableDirectory(const std::string &path) const;
  std::optional<std::vector<KSMDirectoryEntry>>
  ReadBundledDirectory(const std::string &path) const;
  std::optional<KSMFileMetadata> StatBundled(const std::string &path) const;
  void PruneTemporaryText(std::size_t incoming_bytes) const;

  std::filesystem::path data_root_;
  std::filesystem::path cache_root_;
  std::filesystem::path temp_root_;
  std::filesystem::path resource_root_;
  std::filesystem::path asset_root_;
  ReadOnlyResourceProvider read_only_resource_provider_;
  ReadOnlyDirectoryProvider read_only_directory_provider_;
  mutable std::atomic<std::uint64_t> next_temp_id_{1};
};
