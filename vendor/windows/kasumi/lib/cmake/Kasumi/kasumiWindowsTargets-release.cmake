#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "Kasumi::kasumi_windows_bridge" for configuration "Release"
set_property(TARGET Kasumi::kasumi_windows_bridge APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Kasumi::kasumi_windows_bridge PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "CXX"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge.lib"
  )

list(APPEND _cmake_import_check_targets Kasumi::kasumi_windows_bridge )
list(APPEND _cmake_import_check_files_for_Kasumi::kasumi_windows_bridge "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge.lib" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
