cmake_minimum_required(VERSION 3.13)

project(tree-sitter-ucode
        VERSION "0.8.0"
        DESCRIPTION "Ucode grammars for tree-sitter"
        HOMEPAGE_URL "https://github.com/m00qek/tree-sitter-ucode"
        LANGUAGES C)

option(BUILD_SHARED_LIBS "Build using shared libraries" ON)
option(TREE_SITTER_REUSE_ALLOCATOR "Reuse the library allocator" OFF)

set(TREE_SITTER_ABI_VERSION 15 CACHE STRING "Tree-sitter ABI version")
if(NOT ${TREE_SITTER_ABI_VERSION} MATCHES "^[0-9]+$")
    unset(TREE_SITTER_ABI_VERSION CACHE)
    message(FATAL_ERROR "TREE_SITTER_ABI_VERSION must be an integer")
endif()

include(GNUInstallDirs)

# One library per grammar: tree-sitter-ucode, tree-sitter-ucode-markup and
# tree-sitter-ucdocs. Unlike the tree-sitter scaffold, nothing here regenerates
# the parsers: <grammar>/src is committed (CI checks it is current), and
# regenerating needs the CLI plus Node for common/define-grammar.js — tools a
# project that vendors this repository should not need. All paths are relative
# to this file, so `add_subdirectory()` from another project works.
function(add_grammar name dir)
    set(src "${CMAKE_CURRENT_SOURCE_DIR}/${dir}/src")
    add_library(tree-sitter-${name} "${src}/parser.c" "${src}/scanner.c")
    # The shared common/scanner.h includes "tree_sitter/parser.h", which
    # GCC/Clang resolve via the include path, not relative to the includer.
    target_include_directories(tree-sitter-${name}
                               PRIVATE "${src}"
                               INTERFACE $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/bindings/c>
                                         $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>)

    target_compile_definitions(tree-sitter-${name} PRIVATE
                               $<$<BOOL:${TREE_SITTER_REUSE_ALLOCATOR}>:TREE_SITTER_REUSE_ALLOCATOR>
                               $<$<CONFIG:Debug>:TREE_SITTER_DEBUG>)

    set_target_properties(tree-sitter-${name}
                          PROPERTIES
                          C_STANDARD 11
                          POSITION_INDEPENDENT_CODE ON
                          SOVERSION "${TREE_SITTER_ABI_VERSION}.${PROJECT_VERSION_MAJOR}"
                          DEFINE_SYMBOL "")

    configure_file("${CMAKE_CURRENT_SOURCE_DIR}/bindings/c/tree-sitter-${name}.pc.in"
                   "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-${name}.pc" @ONLY)

    install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/bindings/c/tree_sitter/tree-sitter-${name}.h"
            DESTINATION "${CMAKE_INSTALL_INCLUDEDIR}/tree_sitter")
    install(FILES "${CMAKE_CURRENT_BINARY_DIR}/tree-sitter-${name}.pc"
            DESTINATION "${CMAKE_INSTALL_LIBDIR}/pkgconfig")
    install(TARGETS tree-sitter-${name}
            LIBRARY DESTINATION "${CMAKE_INSTALL_LIBDIR}")

    file(GLOB queries "${CMAKE_CURRENT_SOURCE_DIR}/${dir}/queries/*.scm")
    install(FILES ${queries}
            DESTINATION "${CMAKE_INSTALL_DATADIR}/tree-sitter/queries/${dir}")
endfunction()

add_grammar(ucode ucode)
add_grammar(ucode-markup ucode_markup)
add_grammar(ucdocs ucdocs)

# Only when this is the top-level project, so the target name cannot clash
# with a parent project's.
if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    add_custom_target(ts-test node scripts/run-tests.js
                      WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
                      COMMENT "tree-sitter test")
endif()
