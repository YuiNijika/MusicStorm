#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

struct KSMWebResource {
  std::string mime_type;
  std::vector<std::uint8_t> data;
};

class KSMWebResourceProvider {
public:
  virtual ~KSMWebResourceProvider() = default;

  virtual std::optional<KSMWebResource> Read(const std::string &path) const = 0;
  virtual std::vector<std::string> List(const std::string &directory) const {
    return {};
  }
};

class KSMWebResourcePath {
public:
  static std::optional<std::string> FromAppLocalUrl(const std::string &url);
};
