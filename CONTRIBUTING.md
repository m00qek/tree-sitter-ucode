# Contributing

## Prerequisites

- Node.js ≥ 18
- tree-sitter CLI ≥ 0.25, for ABI 15 (0.27.1 is installed as a dev dependency by `npm install`)

## Setup

```sh
git clone https://github.com/m00qek/tree-sitter-ucode
cd tree-sitter-ucode
npm install
```

## Project layout

The repo root holds only repo-level files (package, manifest, bindings, docs,
CI) and the query assertion tests in `test/`. Each grammar is its own directory
with the same four parts — `grammar.js`, `src/`, `queries/`, `test/` — and
anything two grammars share lives in `common/`.

```
common/
  define-grammar.js     THE grammar — one rule set for both ucode and ucode_markup
                        (edit this to add/change syntax)
  scanner.h             THE external lexer for both code grammars — all scanner
                        logic lives here (edit this)
ucode/                  plain scripts
  grammar.js            entry point: defineGrammar('ucode')
  src/scanner.c         thin shim: exports the entry points, #includes ../../common/scanner.h
  src/                  otherwise generated — do not edit
  queries/              queries for ucode AND the source of ucode_markup's (edit these)
  test/corpus/          corpus tests
ucode_markup/           templates
  grammar.js            entry point: defineGrammar('ucode_markup')
  src/scanner.c         thin shim, same as ucode's
  src/                  otherwise generated — do not edit
  queries/              GENERATED from ucode/queries by scripts/generate-markup-queries.js
  test/corpus/          corpus tests
  test/tag-docs/        doc-attachment fixtures for tags.scm (see scripts/run-tests.js)
ucdocs/                 doc comments — standalone grammar, edit directly
  grammar.js
  src/scanner.c         hand-written external lexer: star-runs in prose (vs the */ terminator)
  src/                  otherwise generated
  queries/  test/corpus/
test/highlight/         highlight assertion tests (.uc → ucode, .ut → ucode_markup)
test/tags/              tags assertion tests
editors/helix/queries/  GENERATED query files for Helix (Helix's capture names) — do not edit
bindings/               one directory per language (c, go, node, python, rust, swift), each
                        exposing all three grammars; the build files they need sit at the
                        root (binding.gyp, CMakeLists.txt, Makefile, Cargo.toml, go.mod,
                        pyproject.toml + setup.py, Package.swift)
scripts/
  generate-markup-queries.js  derives ucode_markup/queries/*.scm from ucode/queries/
  generate-helix-queries.js   derives editors/helix/queries/ (highlights/locals renamed to
                              Helix's names; Helix-style textobjects and indents inline)
  check-helix-indents.sh      types into a real Helix and checks each new line's indentation
  check-nvim-queries.lua      checks the Neovim indents, folds and text objects in Neovim
  run-tests.js                builds (into .build/parsers/) and tests all three grammars
  validate-corpus.js          validates the grammars against real ucode code
  validate-docs.js            validates ucdocs against real doc comments (ucode's stdlib)
  checks.js                   structural checks run by run-tests.js
  parsers.js                  where the built parsers live (.build/parsers/)
  tree-sitter-cli.js          the tree-sitter CLI the scripts run (the pinned one if installed)
```

## Editing the grammar

Both `.uc` grammars are built from `common/define-grammar.js` (the pattern tree-sitter-typescript uses for typescript/tsx). They differ only in the start rule and in the template-only `text_statement` rule; see the comment at the top of that file. After editing it, regenerate both parsers:

```sh
npx tree-sitter generate ucode/grammar.js --output ucode/src
npx tree-sitter generate ucode_markup/grammar.js --output ucode_markup/src
```

`ucdocs/grammar.js` is standalone (not derived from `common/define-grammar.js`). After editing it, regenerate its parser:

```sh
npx tree-sitter generate ucdocs/grammar.js --output ucdocs/src
```

`npm run build` regenerates all three parsers (ucode, ucode_markup, ucdocs) in one step. Commit the regenerated files under `ucode/src/`, `ucode_markup/src/`, `ucdocs/src/`, `ucode_markup/queries/` and `editors/helix/queries/` together with your change. CI verifies that generated files are up to date.

Every query applies to both grammars: edit the file under `ucode/queries/` and run `node scripts/generate-markup-queries.js` (or `npm run build`) to regenerate its `ucode_markup/queries/` copy — do not edit the generated copies. The Helix
copies under `editors/helix/queries/` come from `node scripts/generate-helix-queries.js` (also
part of `npm run build`), which fails if a new capture name has no Helix equivalent in its
mapping table. The few template-only highlight patterns (tag delimiters, `{# #}` comments) live in that script.
The Helix indent queries are written by hand in that script, and no CLI check can catch an
indent rule Helix rejects: Helix silently ignores an `indents.scm` it fails to compile. After
changing them, the scanner (node end positions drive indentation) or error recovery, run
`scripts/check-helix-indents.sh <helix-release-dir>`, which needs tmux and an unpacked Helix
release. It types into a real Helix and checks the indentation of each new line. CI runs it too
(the `helix` job, Helix 25.07.1).

The Neovim indents, folds and text objects (`ucode/queries/`, Neovim's capture names) are read
by plugins, nvim-treesitter's `indentexpr` and nvim-treesitter-textobjects, so check them in a
real Neovim after changing them, or the scanner or error recovery:

```sh
nvim --headless --clean -l scripts/check-nvim-queries.lua <nvim-treesitter> <nvim-treesitter-textobjects>
```

Both plugin arguments are checkouts of their `main` branch; CI's `neovim` job pins the commits.

CI pins every GitHub Action to a commit SHA, with the version it was resolved from in a comment
(`uses: actions/checkout@<sha> # v6.1.0`). To update one, resolve the new tag to its commit
(`gh api repos/actions/checkout/commits/v6.2.0 --jq .sha`) and replace both.

The external lexer is hand-written and handles features that context-free grammars cannot express: automatic semicolon insertion, template string, string and regex content, comment terminators, template tag delimiters, and zero-width tokens for error recovery. All of its logic lives in **`common/scanner.h`** — edit that file. `ucode/src/scanner.c` and `ucode_markup/src/scanner.c` are thin shims that only export the entry points and `#include "../../common/scanner.h"`, so a single implementation is shared by both the `ucode` and `ucode_markup` parsers. None of these are touched by `tree-sitter generate`.

`tree-sitter.json` lists `common/scanner.h` under `external-files`, so the CLI's parser cache (`~/.cache/tree-sitter`, used by `tree-sitter test`/`parse` without `--lib-path`) is rebuilt when it changes, not only when a `scanner.c` shim does. Every binding passes `-I<grammar>/src` because `common/scanner.h` includes `"tree_sitter/parser.h"`, which GCC and Clang resolve via the include path, not relative to the including file — keep that in any new build file.

## Adding corpus tests

Corpus tests live in `<grammar>/test/corpus/*.txt`: `ucode/`, `ucode_markup/`, `ucdocs/`. Each test case follows this format:

```
================================================================================
Descriptive test name
================================================================================

<input code>

--------------------------------------------------------------------------------

<expected parse tree>
```

To get the expected parse tree for a new input:

```sh
node scripts/run-tests.js --build-only     # builds .build/parsers/{ucode,ucode_markup,ucdocs}.so

echo '<code>' > /tmp/test.uc
npx tree-sitter parse --lib-path .build/parsers/ucode.so --lang-name ucode /tmp/test.uc
npx tree-sitter parse --lib-path .build/parsers/ucode_markup.so --lang-name ucode_markup /tmp/test.uc
echo '/** @param {int} n */' > /tmp/test.doc
npx tree-sitter parse --lib-path .build/parsers/ucdocs.so --lang-name ucdocs /tmp/test.doc
```

Add the test to an existing file whose category matches (e.g. `expressions.txt`, `control_flow.txt`), or create a new file if no suitable one exists. Every new syntactic feature or deliberate removal should have at least one corpus test.

## Running tests

```sh
npm test                               # all three grammars (recommended)

# Individual grammars:
npx tree-sitter test -p ucode
npx tree-sitter test -p ucode_markup
npx tree-sitter test -p ucdocs

# Filter by corpus file name (the .txt extension is required):
npx tree-sitter test -p ucode --file-name control_flow.txt
npx tree-sitter test -p ucode_markup --file-name markup.txt
```

Besides the corpus tests, `npm test` runs structural checks (`scripts/checks.js`) that the
corpus tests cannot see, because they compare tree shapes only:

- each scanner's `TokenType` enum lists the grammar's external tokens in the same order;
- no name-like node in a corpus input starts or ends with whitespace (a lexer bug can absorb a
  space into a token without changing the tree's shape);
- every token of every corpus input is highlighted by `highlights.scm`, except the deliberate
  exceptions listed in `UNHIGHLIGHTED` (template `raw_text`, the ucdocs `/**` opener).

It then runs the query assertion tests in `test/highlight/` and `test/tags/` with `tree-sitter
test` from the repo root, where each file reaches its grammar through `tree-sitter.json` and is
checked by tree-sitter-highlight and tree-sitter-tags themselves. A comment under a line asserts
the capture of the token above its caret:

```
let r = /ab+/g;
//      ^ string.regexp
```

`// <- name` asserts the token at the comment's own column. In templates `//` is raw text, so
assertions are `{# ^ name #}` comments, with the caret placed under its token.

## Validating against real code

CI validates the grammar against the upstream ucode test suite — pinned to the commit ucode ships at in OpenWrt 25.12, see README.md's "Targeted ucode version" — and the firewall4 project. To reproduce locally:

```sh
node scripts/run-tests.js --build-only
git clone https://github.com/jow-/ucode /tmp/ucode && git -C /tmp/ucode checkout 85922056ef7abeace3cca3ab28bc1ac2d88e31b1
node scripts/validate-corpus.js corpus /tmp/ucode/tests/custom
node scripts/validate-docs.js /tmp/ucode /tmp/ucode/lib /tmp/ucode/include/ucode   # ucdocs vs the stdlib docs
git clone --depth 1 https://github.com/openwrt/firewall4 /tmp/firewall4
node scripts/validate-corpus.js project /tmp/firewall4
```

A small number of upstream test cases contain code that ucode itself rejects (not grammar bugs). They are listed in `EXPECTED_INVALID` inside `scripts/validate-corpus.js`, and must fail to parse: an entry that parses clean, or names no testcase, fails the run. `KNOWN_GRAMMAR_GAPS` in the same file lists the opposite, checked the same way: valid ucode the grammar doesn't parse yet (currently empty — see README.md). Any ERROR or MISSING node counts as a failure; `.ut` files are parsed as templates in project mode.

## Before submitting a PR

- Grammar change regenerates cleanly (`npm run build`, or the per-grammar `tree-sitter generate` commands above)
- All corpus tests pass (`npm test`)
- New syntax has at least one corpus test
- For removed/unsupported JS features, a test in `js_differences.txt` documents the parse behaviour
- Generated files (`ucode/src/`, `ucode_markup/src/`, `ucdocs/src/`, `ucode_markup/queries/`) are committed

## Bindings

The bindings started from what `tree-sitter init` (CLI 0.27.1) scaffolds, adapted for three
grammars the way tree-sitter-typescript does it: one library per grammar for C, one package
exposing all three elsewhere. Do not run `tree-sitter init --update` — it would put the
single-grammar templates back, convert the Node package to ESM, and rewrite `tree-sitter.json`
(dropping `content-regex`). CI's Bindings jobs build and test every binding; locally:

```sh
make && cmake -S . -B cmake-build && cmake --build cmake-build    # C
make test-c                                                          # C: install, link, load, compile queries
cargo test                                                           # Rust
go test -a ./bindings/go/                                            # Go (-a: see below)
python -m build && pip install dist/*.whl && python -m unittest discover -s bindings/python/tests
swift test                                                           # Swift (macOS, or the swift Docker image)
npm run test:bindings                                                # Node
```

Every binding test parses a sample per grammar and compiles the shipped queries. `make test-c`
needs the tree-sitter runtime (0.25 or newer) through pkg-config, or `TS_CFLAGS` / `TS_LIBS`.
Go's build cache does not notice a regenerated `parser.c` (cgo `#include`s it from outside the
package), so without `-a` `go test` can run against a stale parser.

The version lives in `package.json`, `tree-sitter.json`, `Cargo.toml`, `pyproject.toml`,
`CMakeLists.txt`, `Makefile`, `package-lock.json` and `Cargo.lock`; bump them together:

```sh
npx tree-sitter version X.Y.Z        # package.json, tree-sitter.json, Cargo.toml, pyproject.toml, CMakeLists.txt
sed -i 's/^VERSION := .*/VERSION := X.Y.Z/' Makefile
npm install --package-lock-only      # package-lock.json
cargo update -p tree-sitter-ucode    # Cargo.lock
```

## Note on tree-sitter.json

Keep the repository root free of grammars and corpora: every grammar lives in its own directory, and tests run per grammar (`npm test`, or `tree-sitter test -p <grammar>`).

Earlier versions left the `scope` off the `ucdocs` entry. While the `ucode` grammar lived at the root, a valid manifest made `tree-sitter test` run there test the root corpus with the `ucdocs` grammar (178 of 224 tests failed; reproduced on CLI 0.27.1). Omitting the scope made the whole manifest fail to parse (`missing field 'scope'`), so the CLI fell back to the root grammar — at the cost of every manifest-driven feature (content-based routing, CLI highlighting and injection). With no grammar at the root there is nothing to mis-route, so all three entries have a scope again (re-checked 2026-10-14 on CLI 0.27.1: each grammar's tests pass through the manifest, and `tree-sitter highlight` routes templates and injects `ucdocs`).
