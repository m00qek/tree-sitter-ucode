# Bindings

Each binding exposes all three grammars. Only the npm package is published;
the others are used from the Git repository. Usage examples are in
[Use a binding](../how-to/use-bindings.md).

## Runtime requirements

The parsers use ABI 15. They load in:

| Binding | Runtime |
| --- | --- |
| Node.js | `tree-sitter` 0.25 or newer (peer dependency `^0.25.0`), Node.js 18 or newer |
| C | libtree-sitter 0.25 or newer |
| Rust | the `tree-sitter` crate 0.25 or newer |
| Python | py-tree-sitter 0.25 or newer (the `core` extra); Python 3.10 or newer |
| Go | go-tree-sitter 0.25 or newer |
| Swift | SwiftTreeSitter (the package depends on `swift-tree-sitter` 0.10.0 or newer) |

## Node.js

Package `tree-sitter-ucode`, entry point `bindings/node`.

| Export | Grammar |
| --- | --- |
| the module itself | `ucode` |
| `.ucode` | `ucode` |
| `.ucode_markup` | `ucode_markup` |
| `.ucdocs` | `ucdocs` |

Each has `language` and `nodeTypeInfo`. The package includes prebuilt
binaries for linux-x64, linux-arm64, darwin-arm64, darwin-x64, win32-x64 and
win32-arm64, the `.wasm` parsers, and the `queries/` directories.

## C

One library per grammar. Build with `make` or CMake (`add_subdirectory()`
works).

| Grammar | Function | Header | Library and pkg-config name |
| --- | --- | --- | --- |
| `ucode` | `tree_sitter_ucode()` | `<tree_sitter/tree-sitter-ucode.h>` | `tree-sitter-ucode` |
| `ucode_markup` | `tree_sitter_ucode_markup()` | `<tree_sitter/tree-sitter-ucode-markup.h>` | `tree-sitter-ucode-markup` |
| `ucdocs` | `tree_sitter_ucdocs()` | `<tree_sitter/tree-sitter-ucdocs.h>` | `tree-sitter-ucdocs` |

`make install` and the CMake install also install each grammar's
`queries/*.scm` into `<datadir>/tree-sitter/queries/<grammar directory>/`
(`ucode`, `ucode_markup`, `ucdocs`). The shared library's soname version is
`<ABI>.<major version>`.

## Rust

Crate `tree-sitter-ucode`.

| Constant | Content |
| --- | --- |
| `LANGUAGE_UCODE`, `LANGUAGE_UCODE_MARKUP`, `LANGUAGE_UCDOCS` | the grammars, as `LanguageFn` |
| `UCODE_NODE_TYPES`, `UCODE_MARKUP_NODE_TYPES`, `UCDOCS_NODE_TYPES` | `node-types.json` |
| `UCODE_HIGHLIGHTS_QUERY`, `UCODE_INJECTIONS_QUERY`, `UCODE_LOCALS_QUERY`, `UCODE_TAGS_QUERY` | `ucode` queries |
| `UCODE_MARKUP_HIGHLIGHTS_QUERY`, `UCODE_MARKUP_INJECTIONS_QUERY`, `UCODE_MARKUP_LOCALS_QUERY`, `UCODE_MARKUP_TAGS_QUERY` | `ucode_markup` queries |
| `UCDOCS_HIGHLIGHTS_QUERY`, `UCDOCS_TAGS_QUERY` | `ucdocs` queries |

## Python

Package `tree_sitter_ucode`.

| Name | Content |
| --- | --- |
| `language_ucode()`, `language_ucode_markup()`, `language_ucdocs()` | the grammars, as capsules for `tree_sitter.Language` |
| `UCODE_HIGHLIGHTS_QUERY`, `UCODE_INJECTIONS_QUERY`, `UCODE_LOCALS_QUERY`, `UCODE_TAGS_QUERY` | `ucode` queries |
| `UCODE_MARKUP_HIGHLIGHTS_QUERY`, `UCODE_MARKUP_INJECTIONS_QUERY`, `UCODE_MARKUP_LOCALS_QUERY`, `UCODE_MARKUP_TAGS_QUERY` | `ucode_markup` queries |
| `UCDOCS_HIGHLIGHTS_QUERY`, `UCDOCS_TAGS_QUERY` | `ucdocs` queries |

The wheel is built for the stable ABI (`cp310-abi3`).

## Go

Package `github.com/m00qek/tree-sitter-ucode/bindings/go`.

| Function | Grammar |
| --- | --- |
| `LanguageUcode()` | `ucode` |
| `LanguageUcodeMarkup()` | `ucode_markup` |
| `LanguageUcdocs()` | `ucdocs` |

Each returns an `unsafe.Pointer` for `tree_sitter.NewLanguage()`.

## Swift

Package `TreeSitterUcode`, one library product with three targets:

| Module | Function | Bundled queries |
| --- | --- | --- |
| `TreeSitterUcode` | `tree_sitter_ucode()` | `ucode/queries` |
| `TreeSitterUcodeMarkup` | `tree_sitter_ucode_markup()` | `ucode_markup/queries` |
| `TreeSitterUcdocs` | `tree_sitter_ucdocs()` | `ucdocs/queries` |

## Build note

`common/scanner.h` includes `"tree_sitter/parser.h"`, which GCC and Clang
resolve through the include path, not relative to the including file. Every
build file therefore passes `-I<grammar>/src` (or its equivalent) when it
compiles a scanner. A new build file must do the same.
