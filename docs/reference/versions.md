# Version strings

The version appears nine times, in eight files. CI's `version` job compares
each with the tag on a `v*` push.

| File | Location | Updated by |
| --- | --- | --- |
| `package.json` | `version` | `tree-sitter version` |
| `package-lock.json` | top-level `version` | `npm install --package-lock-only` |
| `package-lock.json` | `packages[""].version` | `npm install --package-lock-only` |
| `tree-sitter.json` | `metadata.version` | `tree-sitter version` |
| `Cargo.toml` | `version` in `[package]` | `tree-sitter version` |
| `Cargo.lock` | `version` of the `tree-sitter-ucode` package | `cargo update -p tree-sitter-ucode` |
| `pyproject.toml` | `version` in `[project]` | `tree-sitter version` |
| `CMakeLists.txt` | `VERSION` in `project()` | `tree-sitter version` |
| `Makefile` | `VERSION :=` | by hand |

Each generated `src/parser.c` also embeds the version, from
`tree-sitter.json`, in its language metadata. Regenerating the parsers
updates it; CI's `validate` job fails if a committed parser is stale.

The steps are in [Bump the version](../how-to/bump-version.md).

The C shared libraries use the major version in their soname
(`<ABI>.<major>`), and CMake takes `PROJECT_VERSION_MAJOR` from the
`project()` version.
