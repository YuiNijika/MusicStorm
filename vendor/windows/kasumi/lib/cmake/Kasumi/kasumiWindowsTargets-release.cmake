#----------------------------------------------------------------
# Generated CMake target import file for configuration "Release".
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "Kasumi::kasumi_windows_bridge_core" for configuration "Release"
set_property(TARGET Kasumi::kasumi_windows_bridge_core APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Kasumi::kasumi_windows_bridge_core PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "CXX"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_core.lib"
  )

list(APPEND _cmake_import_check_targets Kasumi::kasumi_windows_bridge_core )
list(APPEND _cmake_import_check_files_for_Kasumi::kasumi_windows_bridge_core "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_core.lib" )

# Import target "Kasumi::kasumi_windows_bridge_plugins" for configuration "Release"
set_property(TARGET Kasumi::kasumi_windows_bridge_plugins APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Kasumi::kasumi_windows_bridge_plugins PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "CXX"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_plugins.lib"
  )

list(APPEND _cmake_import_check_targets Kasumi::kasumi_windows_bridge_plugins )
list(APPEND _cmake_import_check_files_for_Kasumi::kasumi_windows_bridge_plugins "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_plugins.lib" )

# Import target "Kasumi::kasumi_windows_bridge_runtime" for configuration "Release"
set_property(TARGET Kasumi::kasumi_windows_bridge_runtime APPEND PROPERTY IMPORTED_CONFIGURATIONS RELEASE)
set_target_properties(Kasumi::kasumi_windows_bridge_runtime PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_RELEASE "CXX"
  IMPORTED_LOCATION_RELEASE "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_runtime.lib"
  )

list(APPEND _cmake_import_check_targets Kasumi::kasumi_windows_bridge_runtime )
list(APPEND _cmake_import_check_files_for_Kasumi::kasumi_windows_bridge_runtime "${_IMPORT_PREFIX}/lib/kasumi_windows_bridge_runtime.lib" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
