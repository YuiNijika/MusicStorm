#pragma once

#include <windows.h>

#include <string>
#include <vector>

#include "ksm_web_resource.h"

struct KSMWin32ResourceDescriptor {
  int resource_id = 0;
  std::string path;
  std::string mime_type;
};

class KSMWin32ResourceProvider final : public KSMWebResourceProvider {
public:
  KSMWin32ResourceProvider(HINSTANCE module,
                           std::vector<KSMWin32ResourceDescriptor> resources);

  std::optional<KSMWebResource> Read(const std::string &path) const override;
  std::vector<std::string> List(const std::string &directory) const override;

private:
  HINSTANCE module_;
  std::vector<KSMWin32ResourceDescriptor> resources_;
};
