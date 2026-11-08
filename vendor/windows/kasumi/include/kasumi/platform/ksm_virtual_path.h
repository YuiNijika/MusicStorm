#pragma once

#include <filesystem>
#include <optional>
#include <string>

class KSMVirtualPath {
public:
  enum class ReadOnlyRoot { None, Resource, Asset };

  static bool IsSafe(const std::string &path);
  static bool IsSafeDirectory(const std::string &path);
  static bool IsSafeStat(const std::string &path);
  static bool IsPicked(const std::string &path);
  static bool IsReadOnly(const std::string &path);
  static std::string PickedPath(const std::string &token);
  static std::string NormalizeDirectory(const std::string &path);
  static std::optional<std::filesystem::path>
  ResolveWritable(const std::string &path,
                  const std::filesystem::path &data_root,
                  const std::filesystem::path &cache_root,
                  const std::filesystem::path &temp_root);
  static std::optional<std::filesystem::path>
  ResolveWritableDirectory(const std::string &path,
                           const std::filesystem::path &data_root,
                           const std::filesystem::path &cache_root,
                           const std::filesystem::path &temp_root);
  static std::optional<std::filesystem::path>
  ResolveReadable(const std::string &path,
                  const std::filesystem::path &data_root,
                  const std::filesystem::path &cache_root,
                  const std::filesystem::path &temp_root,
                  const std::filesystem::path &resource_root,
                  const std::filesystem::path &asset_root);
  static std::optional<std::filesystem::path>
  ResolveReadableDirectory(const std::string &path,
                           const std::filesystem::path &data_root,
                           const std::filesystem::path &cache_root,
                           const std::filesystem::path &temp_root,
                           const std::filesystem::path &resource_root,
                           const std::filesystem::path &asset_root);
  static std::optional<ReadOnlyRoot> ReadOnlyRootFor(const std::string &path);
  static std::optional<std::string>
  ReadOnlyRelativePath(const std::string &path, ReadOnlyRoot root);
};
