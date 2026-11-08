
####### Expanded from @PACKAGE_INIT@ by configure_package_config_file() #######
####### Any changes to this file will be overwritten by the next CMake run ####
####### The input file was KasumiConfig.cmake.in                            ########

get_filename_component(PACKAGE_PREFIX_DIR "${CMAKE_CURRENT_LIST_DIR}/../../../" ABSOLUTE)

macro(set_and_check _var _file)
  set(${_var} "${_file}")
  if(NOT EXISTS "${_file}")
    message(FATAL_ERROR "File or directory ${_file} referenced by variable ${_var} does not exist !")
  endif()
endmacro()

macro(check_required_components _NAME)
  foreach(comp ${${_NAME}_FIND_COMPONENTS})
    if(NOT ${_NAME}_${comp}_FOUND)
      if(${_NAME}_FIND_REQUIRED_${comp})
        set(${_NAME}_FOUND FALSE)
      endif()
    endif()
  endforeach()
endmacro()

####################################################################################

set(KASUMI_VERSION "26.11.7")

include(CMakeFindDependencyMacro)
find_dependency(nlohmann_json CONFIG)
find_dependency(unofficial-sqlite3 CONFIG)
find_dependency(unofficial-webview2 CONFIG)

include("${CMAKE_CURRENT_LIST_DIR}/kasumiWindowsTargets.cmake")
include("${CMAKE_CURRENT_LIST_DIR}/KasumiCompilerDependencies.cmake")
check_required_components(Kasumi)
