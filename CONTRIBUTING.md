# Contributing

## Prerequisites

- Node.js ≥ 18
- tree-sitter CLI ≥ 0.24 (installed automatically as a dev dependency via `npm install`)

## Setup

```sh
git clone https://github.com/m00qek/tree-sitter-ucode
cd tree-sitter-ucode
npm install
```

## Project layout

The repo root holds only repo-level files (package, manifest, bindings, docs,
CI). Each grammar is its own directory with the same four parts — `grammar.js`,
`src/`, `queries/`, `test/` — and anything two grammars share lives in `common/`.

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
editors/helix/queries/  GENERATED query files for Helix (Helix's capture names) — do not edit
scripts/
  generate-markup-queries.js  derives ucode_markup/queries/*.scm from ucode/queries/
  generate-helix-queries.js   derives editors/helix/queries/ (highlights/locals renamed to
                              Helix's names; Helix-style textobjects and indents inline)
  run-tests.js                builds (into .build/parsers/) and tests all three grammars
  validate-corpus.js          validates the grammars against real ucode code
  validate-docs.js            validates ucdocs against real doc comments (ucode's stdlib)
  checks.js                   structural checks run by run-tests.js
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

`npm run build` regenerates all three parsers (ucode, ucode_markup, ucdocs) in one step. Commit the regenerated files under `ucode/src/`, `ucode_markup/src/`, and `ucdocs/src/` together with your grammar change. CI verifies that generated files are up to date.

Every query applies to both grammars: edit the file under `ucode/queries/` and run `node scripts/generate-markup-queries.js` (or `npm run build`) to regenerate its `ucode_markup/queries/` copy — do not edit the generated copies. The Helix
copies under `editors/helix/queries/` come from `node scripts/generate-helix-queries.js` (also
part of `npm run build`), which fails if a new capture name has no Helix equivalent in its
mapping table. The few template-only highlight patterns (tag delimiters, `{# #}` comments) live in that script.

The external lexer is hand-written and handles features that context-free grammars cannot express: automatic semicolon insertion, template string content, comment/prose terminators, and ternary-vs-nullish disambiguation. All of its logic lives in **`common/scanner.h`** — edit that file. `ucode/src/scanner.c` and `ucode_markup/src/scanner.c` are thin shims that only export the entry points and `#include "../../common/scanner.h"`, so a single implementation is shared by both the `ucode` and `ucode_markup` parsers. None of these are touched by `tree-sitter generate`.

> **Stale-scanner gotcha:** `tree-sitter build` recompiles the scanner from source every time, so it always picks up `common/scanner.h` edits. The staleness bites the *loader* cache instead: `tree-sitter test`/`parse` runs **without** `--lib-path` load a pre-built parser from `~/.cache/tree-sitter`, and that cache is keyed on `scanner.c` (not the `#include`d `common/scanner.h`), so an edit to `common/scanner.h` alone is not detected. After editing it, either `touch ucode/src/scanner.c ucode_markup/src/scanner.c` (bumps the key) or `rm -rf ~/.cache/tree-sitter` (nukes it) before running the CLI without `--lib-path` — otherwise the stale parser is reused and your change appears to have no effect. Passing `--lib-path` to a freshly `cc`-built `.so` sidesteps the cache entirely.

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

```sh
git clone https://github.com/jow-/ucode /tmp/ucode
git -C /tmp/ucode checkout 85922056ef7abeace3cca3ab28bc1ac2d88e31b1
git clone https://github.com/openwrt/firewall4 /tmp/firewall4

node scripts/validate-corpus.js corpus  /tmp/ucode/tests/custom
node scripts/validate-corpus.js project /tmp/firewall4
```

A small number of upstream test cases are intentionally skipped because they contain code that ucode itself rejects at compile time (not grammar bugs). They are listed in `EXPECTED_INVALID` inside `scripts/validate-corpus.js`. `KNOWN_GRAMMAR_GAPS` in the same file lists the opposite: valid ucode the grammar doesn't parse yet (currently empty — see README.md).

## Before submitting a PR

- Grammar change regenerates cleanly (`npm run build`, or the per-grammar `tree-sitter generate` commands above)
- All corpus tests pass (`npm test`)
- New syntax has at least one corpus test
- For removed/unsupported JS features, a test in `js_differences.txt` documents the parse behaviour
- Generated files (`ucode/src/`, `ucode_markup/src/`, `ucdocs/src/`, `ucode_markup/queries/`) are committed

## Note on tree-sitter.json

Keep the repository root free of grammars and corpora: every grammar lives in its own directory, and tests run per grammar (`npm test`, or `tree-sitter test -p <grammar>`).

Earlier versions left the `scope` off the `ucdocs` entry. While the `ucode` grammar lived at the root, a valid manifest made `tree-sitter test` run there test the root corpus with the `ucdocs` grammar (178 of 224 tests failed; reproduced on CLI 0.27.1). Omitting the scope made the whole manifest fail to parse (`missing field 'scope'`), so the CLI fell back to the root grammar — at the cost of every manifest-driven feature (content-based routing, CLI highlighting and injection). With no grammar at the root there is nothing to mis-route, so all three entries have a scope again (re-checked 2026-10-14 on CLI 0.27.1: each grammar's tests pass through the manifest, and `tree-sitter highlight` routes templates and injects `ucdocs`).
