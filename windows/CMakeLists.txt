cmake_minimum_required(VERSION 3.25)

set(
    KASUMI_APP_VERSION
    "26.11.7"
    CACHE STRING
    "Application semantic version"
)
string(
    REGEX MATCH
    "^([0-9]+)\\.([0-9]+)\\.([0-9]+)"
    KASUMI_PROJECT_VERSION
    "${KASUMI_APP_VERSION}"
)
if(NOT KASUMI_PROJECT_VERSION)
    message(
        FATAL_ERROR
        "KASUMI_APP_VERSION must start with a numeric semantic version."
    )
endif()
project(kasumi_app VERSION ${KASUMI_PROJECT_VERSION} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(
    KASUMI_APP_PACKAGE_NAME
    "music-storm"
    CACHE STRING
    "Application package name"
)
set(
    KASUMI_APP_COMMANDS
    ""
    CACHE STRING
    "Comma-separated application command allowlist"
)
set(
    KASUMI_APP_PERMISSIONS
    ""
    CACHE STRING
    "Comma-separated application permission allowlist"
)
set(
    KASUMI_SHELL_ALLOWED_ORIGINS
    ""
    CACHE STRING
    "Comma-separated exact external-link origins"
)
set(
    KASUMI_HTTP_ALLOWED_ORIGINS
    ""
    CACHE STRING
    "Comma-separated exact HTTPS download origins"
)
set(
    KASUMI_WINDOW_BACKGROUND_COLOR
    ""
    CACHE STRING
    "WebView2 fallback background color as RRGGBB or AARRGGBB"
)
set(KASUMI_WINDOW_WIDTH 1080 CACHE STRING "Initial client width in DIP")
set(KASUMI_WINDOW_HEIGHT 720 CACHE STRING "Initial client height in DIP")
set(KASUMI_WINDOW_MIN_WIDTH 320 CACHE STRING "Minimum client width in DIP")
set(KASUMI_WINDOW_MIN_HEIGHT 240 CACHE STRING "Minimum client height in DIP")
set(KASUMI_WINDOW_MAX_WIDTH 0 CACHE STRING "Maximum client width in DIP; 0 means unlimited")
set(KASUMI_WINDOW_MAX_HEIGHT 0 CACHE STRING "Maximum client height in DIP; 0 means unlimited")
option(KASUMI_WINDOW_RESIZABLE "Allow the user to resize the window" ON)
set(
    KASUMI_APP_ICON
    ""
    CACHE FILEPATH
    "Path to the .ico file used for the application window and executable"
)
set(
    KASUMI_TRAY_ICON
    ""
    CACHE FILEPATH
    "Path to the .ico file used for the Windows tray icon"
)

if(NOT KASUMI_APP_PACKAGE_NAME MATCHES "^[A-Za-z0-9][A-Za-z0-9._-]*$")
    message(FATAL_ERROR "KASUMI_APP_PACKAGE_NAME has an invalid format.")
endif()
if(
    NOT KASUMI_APP_VERSION MATCHES
    "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$"
)
    message(FATAL_ERROR "KASUMI_APP_VERSION must be a semantic version.")
endif()

option(
    KASUMI_EXTERNAL_WEB
    "Copy built web assets beside the executable instead of embedding them"
    OFF
)

option(
    KASUMI_BUNDLE_WEBVIEW2_LOADER
    "Bundle WebView2Loader.dll instead of statically linking the loader"
    OFF
)

option(
    KASUMI_DEV_MODE
    "Build the native host without embedding production web assets"
    OFF
)

option(
    KASUMI_WINDOW_DECORATIONS
    "Show the native Windows title bar"
    ON
)
if(
    KASUMI_WINDOW_BACKGROUND_COLOR AND
    NOT KASUMI_WINDOW_BACKGROUND_COLOR MATCHES
    "^[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$" AND
    NOT KASUMI_WINDOW_BACKGROUND_COLOR MATCHES
    "^[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]$"
)
    message(
        FATAL_ERROR
        "KASUMI_WINDOW_BACKGROUND_COLOR must be RRGGBB or AARRGGBB."
    )
endif()
foreach(
    variable
    KASUMI_WINDOW_WIDTH
    KASUMI_WINDOW_HEIGHT
    KASUMI_WINDOW_MIN_WIDTH
    KASUMI_WINDOW_MIN_HEIGHT
    KASUMI_WINDOW_MAX_WIDTH
    KASUMI_WINDOW_MAX_HEIGHT
)
    if(NOT ${variable} MATCHES "^[0-9]+$")
        message(FATAL_ERROR "${variable} must be a non-negative integer.")
    endif()
endforeach()
if(KASUMI_WINDOW_MAX_WIDTH GREATER 0 AND KASUMI_WINDOW_MAX_WIDTH LESS KASUMI_WINDOW_MIN_WIDTH)
    message(FATAL_ERROR "KASUMI_WINDOW_MAX_WIDTH must be >= KASUMI_WINDOW_MIN_WIDTH.")
endif()
if(KASUMI_WINDOW_MAX_HEIGHT GREATER 0 AND KASUMI_WINDOW_MAX_HEIGHT LESS KASUMI_WINDOW_MIN_HEIGHT)
    message(FATAL_ERROR "KASUMI_WINDOW_MAX_HEIGHT must be >= KASUMI_WINDOW_MIN_HEIGHT.")
endif()
if(KASUMI_WINDOW_MAX_WIDTH GREATER 0 AND KASUMI_WINDOW_WIDTH GREATER KASUMI_WINDOW_MAX_WIDTH)
    message(FATAL_ERROR "KASUMI_WINDOW_WIDTH must be <= KASUMI_WINDOW_MAX_WIDTH.")
endif()
if(KASUMI_WINDOW_MAX_HEIGHT GREATER 0 AND KASUMI_WINDOW_HEIGHT GREATER KASUMI_WINDOW_MAX_HEIGHT)
    message(FATAL_ERROR "KASUMI_WINDOW_HEIGHT must be <= KASUMI_WINDOW_MAX_HEIGHT.")
endif()

find_package(Kasumi CONFIG REQUIRED)

add_executable(kasumi_app WIN32 main.cpp)
if(MSVC)
    target_compile_options(kasumi_app PRIVATE /utf-8)
endif()
target_compile_features(kasumi_app PRIVATE cxx_std_20)

get_target_property(
    KASUMI_WEBVIEW2_LOADER_TYPE
    unofficial::webview2::webview2
    TYPE
)
if(KASUMI_BUNDLE_WEBVIEW2_LOADER)
    if(NOT KASUMI_WEBVIEW2_LOADER_TYPE STREQUAL "SHARED_LIBRARY")
        message(
            FATAL_ERROR
            "KASUMI_BUNDLE_WEBVIEW2_LOADER=ON requires the vcpkg "
            "x64-windows triplet."
        )
    endif()
    get_target_property(
        KASUMI_WEBVIEW2_LOADER_DLL
        unofficial::webview2::webview2
        IMPORTED_LOCATION
    )
    add_custom_command(
        TARGET kasumi_app
        POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${KASUMI_WEBVIEW2_LOADER_DLL}"
            "$<TARGET_FILE_DIR:kasumi_app>/WebView2Loader.dll"
    )
else()
    if(NOT KASUMI_WEBVIEW2_LOADER_TYPE STREQUAL "STATIC_LIBRARY")
        message(
            FATAL_ERROR
            "System WebView2 mode requires the vcpkg "
            "x64-windows-static-md triplet. Pass "
            "-DKASUMI_BUNDLE_WEBVIEW2_LOADER=ON to bundle the loader DLL."
        )
    endif()
    add_custom_command(
        TARGET kasumi_app
        POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E rm -f
            "$<TARGET_FILE_DIR:kasumi_app>/WebView2Loader.dll"
    )
endif()

set(KASUMI_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${KASUMI_GENERATED_DIR}")
string(
    REGEX MATCH
    "^([0-9]+)\\.([0-9]+)\\.([0-9]+)"
    KASUMI_APP_VERSION_NUMERIC
    "${KASUMI_APP_VERSION}"
)
set(KASUMI_APP_VERSION_MAJOR "${CMAKE_MATCH_1}")
set(KASUMI_APP_VERSION_MINOR "${CMAKE_MATCH_2}")
set(KASUMI_APP_VERSION_PATCH "${CMAKE_MATCH_3}")

set(KASUMI_APP_ICON_RESOURCE "")
if(KASUMI_APP_ICON)
    if(NOT EXISTS "${KASUMI_APP_ICON}")
        message(FATAL_ERROR "KASUMI_APP_ICON does not exist: ${KASUMI_APP_ICON}")
    endif()
    if(NOT KASUMI_APP_ICON MATCHES "\\.[iI][cC][oO]$")
        message(FATAL_ERROR "KASUMI_APP_ICON must use the .ico extension.")
    endif()
    file(TO_CMAKE_PATH "${KASUMI_APP_ICON}" KASUMI_APP_ICON_RESOURCE_PATH)
    set(KASUMI_APP_ICON_RESOURCE "101 ICON \"${KASUMI_APP_ICON_RESOURCE_PATH}\"")
endif()

set(KASUMI_TRAY_ICON_RESOURCE "")
if(KASUMI_TRAY_ICON)
    if(NOT EXISTS "${KASUMI_TRAY_ICON}")
        message(FATAL_ERROR "KASUMI_TRAY_ICON does not exist: ${KASUMI_TRAY_ICON}")
    endif()
    if(NOT KASUMI_TRAY_ICON MATCHES "\\.[iI][cC][oO]$")
        message(FATAL_ERROR "KASUMI_TRAY_ICON must use the .ico extension.")
    endif()
    file(TO_CMAKE_PATH "${KASUMI_TRAY_ICON}" KASUMI_TRAY_ICON_RESOURCE_PATH)
    set(KASUMI_TRAY_ICON_RESOURCE "102 ICON \"${KASUMI_TRAY_ICON_RESOURCE_PATH}\"")
endif()

set(KASUMI_APP_VERSION_RC "${KASUMI_GENERATED_DIR}/app_version.rc")
configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/cmake/app_version.rc.in"
    "${KASUMI_APP_VERSION_RC}"
    @ONLY
)
target_sources(kasumi_app PRIVATE "${KASUMI_APP_VERSION_RC}")
target_compile_definitions(
    kasumi_app
    PRIVATE
        KASUMI_APP_PACKAGE_NAME="${KASUMI_APP_PACKAGE_NAME}"
        KASUMI_APP_VERSION="${KASUMI_APP_VERSION}"
        KASUMI_APP_COMMANDS="${KASUMI_APP_COMMANDS}"
        KASUMI_APP_PERMISSIONS="${KASUMI_APP_PERMISSIONS}"
        KASUMI_SHELL_ALLOWED_ORIGINS="${KASUMI_SHELL_ALLOWED_ORIGINS}"
        KASUMI_HTTP_ALLOWED_ORIGINS="${KASUMI_HTTP_ALLOWED_ORIGINS}"
        KASUMI_WINDOW_DECORATIONS=$<BOOL:${KASUMI_WINDOW_DECORATIONS}>
        KASUMI_WINDOW_BACKGROUND_COLOR="${KASUMI_WINDOW_BACKGROUND_COLOR}"
        KASUMI_WINDOW_WIDTH=${KASUMI_WINDOW_WIDTH}
        KASUMI_WINDOW_HEIGHT=${KASUMI_WINDOW_HEIGHT}
        KASUMI_WINDOW_MIN_WIDTH=${KASUMI_WINDOW_MIN_WIDTH}
        KASUMI_WINDOW_MIN_HEIGHT=${KASUMI_WINDOW_MIN_HEIGHT}
        KASUMI_WINDOW_MAX_WIDTH=${KASUMI_WINDOW_MAX_WIDTH}
        KASUMI_WINDOW_MAX_HEIGHT=${KASUMI_WINDOW_MAX_HEIGHT}
        KASUMI_WINDOW_RESIZABLE=$<BOOL:${KASUMI_WINDOW_RESIZABLE}>
)

if(KASUMI_DEV_MODE)
    target_compile_definitions(kasumi_app PRIVATE KASUMI_DEV_MODE=1)
else()
    set(
        KASUMI_WEB_ROOT
        "${CMAKE_CURRENT_SOURCE_DIR}/../frontend/dist"
    )
    if(NOT EXISTS "${KASUMI_WEB_ROOT}/index.html")
        message(
            FATAL_ERROR
            "frontend/dist/index.html is missing. Run the Kasumi frontend build first."
        )
    endif()

    if(KASUMI_EXTERNAL_WEB)
        target_compile_definitions(kasumi_app PRIVATE KASUMI_EXTERNAL_WEB=1)
        add_custom_command(
            TARGET kasumi_app
            POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${KASUMI_WEB_ROOT}"
                "$<TARGET_FILE_DIR:kasumi_app>/web"
        )
    else()
        file(
            GLOB_RECURSE KASUMI_WEB_FILES
            RELATIVE "${KASUMI_WEB_ROOT}"
            CONFIGURE_DEPENDS
            "${KASUMI_WEB_ROOT}/*"
        )
        list(SORT KASUMI_WEB_FILES)
        set(KASUMI_WEB_DEPENDS)
        foreach(relative_path IN LISTS KASUMI_WEB_FILES)
            list(APPEND KASUMI_WEB_DEPENDS "${KASUMI_WEB_ROOT}/${relative_path}")
        endforeach()

        set(KASUMI_RESOURCE_RC "${KASUMI_GENERATED_DIR}/web_resources.rc")
        set(KASUMI_RESOURCE_HEADER "${KASUMI_GENERATED_DIR}/web_resources.h")
        add_custom_command(
            OUTPUT "${KASUMI_RESOURCE_RC}" "${KASUMI_RESOURCE_HEADER}"
            COMMAND ${CMAKE_COMMAND}
                "-DWEB_ROOT=${KASUMI_WEB_ROOT}"
                "-DOUTPUT_RC=${KASUMI_RESOURCE_RC}"
                "-DOUTPUT_HEADER=${KASUMI_RESOURCE_HEADER}"
                "-DFILES=${KASUMI_WEB_FILES}"
                -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed_web.cmake"
            DEPENDS
                "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed_web.cmake"
                ${KASUMI_WEB_DEPENDS}
            VERBATIM
        )
        target_include_directories(
            kasumi_app
            PRIVATE
                "${KASUMI_GENERATED_DIR}"
        )
        target_sources(
            kasumi_app
            PRIVATE
                "${KASUMI_RESOURCE_RC}"
                "${KASUMI_RESOURCE_HEADER}"
        )
        add_custom_command(
            TARGET kasumi_app
            POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E remove_directory
                "$<TARGET_FILE_DIR:kasumi_app>/web"
        )
    endif()
endif()

target_link_libraries(kasumi_app PRIVATE Kasumi::kasumi_windows_bridge)

include(CTest)
if(BUILD_TESTING)
    add_test(NAME kasumi_app_smoke COMMAND kasumi_app --smoke-test)
    set_tests_properties(kasumi_app_smoke PROPERTIES TIMEOUT 30)
endif()
