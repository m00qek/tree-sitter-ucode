# CI workflows

All workflows are in `.github/workflows/`. Every action is pinned to a commit
SHA with its version in a comment, and Dependabot proposes updates weekly.
Each workflow grants the token only `contents: read` unless a job needs more,
checkouts do not persist credentials, and every job has a timeout.

## CI

`ci.yml`. Runs on pushes to `main` that change anything other than `docs/`,
`mkdocs.yml` or `README.md`; on every `v*` tag; and on pull requests to
`main` that touch `common/`, the grammar directories, `editors/`,
`bindings/`, `scripts/`, the build and package files, or the workflows and
Dependabot configuration. It uses no caches, because it builds the release
artifacts.

| Job | Runs on | Does |
| --- | --- | --- |
| `test` | Ubuntu, macOS, Windows | `node scripts/run-tests.js` with tree-sitter CLI 0.27.1 |
| `validate` | Ubuntu | Node.js binding test; regenerates the parsers and queries and fails on any difference or new untracked file; validates against ucode's test suite and stdlib doc comments at commit `85922056`, and against firewall4 at a pinned commit |
| `bindings` | Ubuntu | C with make and CMake, Rust, Go, Python 3.10 and 3.12 (sdist, wheel, tests), C link-and-load test against the tree-sitter 0.25.10 runtime |
| `bindings-swift` | macOS | `swift test` |
| `helix` | Ubuntu | `scripts/check-helix-indents.sh` with Helix 25.07.1 |
| `neovim` | Ubuntu | `scripts/check-nvim-queries.lua` with Neovim 0.12.5 and pinned commits of nvim-treesitter and nvim-treesitter-textobjects |
| `workflows` | Ubuntu | `actionlint` (with shellcheck) and `zizmor` over `.github/` |
| `wasm` | Ubuntu, after `test` and `validate` | builds the three `.wasm` parsers |
| `prebuild` | Ubuntu, macOS (arm64 and x64), Windows (x64 and arm64), after `test` and `validate` | Node.js prebuilds; Ubuntu also cross-builds linux-arm64 |
| `version` | Ubuntu, `v*` tags only | fails unless all nine [version strings](versions.md) equal the tag without its `v` |
| `publish` | Ubuntu, `v*` tags only, after `version`, `wasm`, `prebuild`, `bindings`, `bindings-swift`, `helix` and `neovim` | `npm publish --provenance` with the `.wasm` files and prebuilds |

A newer run on the same branch cancels an older one, except on `main` and on
tags.

## Fuzz

`fuzz.yml`. Runs tree-sitter's fuzz action on the scanner of each of the
three grammars. Triggered by pushes to `main` that change
`common/scanner.h`, a `scanner.c` or a `parser.c`; weekly on Monday; and by
hand.

## Docs

`docs.yml`. Builds this site with `mkdocs build --strict` on pull requests
and pushes to `main` that change `docs/`, `mkdocs.yml` or the workflow, and
by hand. On `main` it deploys the result to GitHub Pages. See
[How to build and publish this site](../how-to/publish-docs.md).
