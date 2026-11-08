# MSVC emits /showIncludes lines as UTF-8 when piped, but CMake's automatic
# prefix detection decodes them with the ANSI code page on non-UTF-8 systems.
# That garbles the prefix Ninja needs, so header dependencies are silently
# dropped and incremental builds miss source changes. Re-probe with an explicit
# UTF-8 decoder and override the prefix used by the Ninja generator.

if(NOT MSVC OR NOT CMAKE_GENERATOR MATCHES "^Ninja")
    return()
endif()

if(KASUMI_COMPILER_DEPENDENCIES_CHECKED)
    return()
endif()
set(KASUMI_COMPILER_DEPENDENCIES_CHECKED TRUE)

set(
    KASUMI_SHOWINCLUDES_PROBE_DIR
    "${CMAKE_BINARY_DIR}/CMakeFiles/KasumiShowIncludes"
)
file(MAKE_DIRECTORY "${KASUMI_SHOWINCLUDES_PROBE_DIR}")
file(WRITE "${KASUMI_SHOWINCLUDES_PROBE_DIR}/foo.h" "\n")
file(
    WRITE
    "${KASUMI_SHOWINCLUDES_PROBE_DIR}/main.c"
    "#include \"foo.h\"\nint main(){}\n"
)
execute_process(
    COMMAND
        "${CMAKE_CXX_COMPILER}"
        ${CMAKE_CXX_COMPILER_ID_ARG1}
        /nologo /showIncludes /c main.c
    WORKING_DIRECTORY "${KASUMI_SHOWINCLUDES_PROBE_DIR}"
    OUTPUT_VARIABLE KASUMI_SHOWINCLUDES_OUTPUT
    ERROR_QUIET
    RESULT_VARIABLE KASUMI_SHOWINCLUDES_RESULT
    ENCODING UTF-8
)

if(
    KASUMI_SHOWINCLUDES_RESULT EQUAL 0
    AND KASUMI_SHOWINCLUDES_OUTPUT MATCHES
        "(^|\n)([^:\n][^:\n]+:[^:\n]*[^: \n][^: \n]:?[ \t]+)([A-Za-z]:\\\\|\\./|\\.\\\\|/)"
)
    set(KASUMI_SHOWINCLUDES_PREFIX "${CMAKE_MATCH_2}")
    string(ASCII 239 191 189 KASUMI_REPLACEMENT_CHARACTER)
    string(
        FIND
        "${KASUMI_SHOWINCLUDES_PREFIX}"
        "${KASUMI_REPLACEMENT_CHARACTER}"
        KASUMI_REPLACEMENT_INDEX
    )
    if(
        KASUMI_REPLACEMENT_INDEX EQUAL -1
        AND NOT CMAKE_CL_SHOWINCLUDES_PREFIX STREQUAL
            KASUMI_SHOWINCLUDES_PREFIX
    )
        set(CMAKE_CL_SHOWINCLUDES_PREFIX "${KASUMI_SHOWINCLUDES_PREFIX}")
    endif()
endif()
