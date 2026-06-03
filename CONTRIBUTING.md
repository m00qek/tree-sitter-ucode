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

```
grammar.js              ucode grammar (edit this to add/change syntax)
src/
  scanner.c             Hand-written external lexer — edit directly, not generated
  parser.c              Generated — do not edit
  grammar.json          Generated — do not edit
tmpl/
  grammar.js            ucode_tmpl grammar (template .uc files, detected by content)
  src/                  Generated parser for the template grammar
  queries/              Highlight, inject, and locals queries for ucode_tmpl
queries/                Highlight, locals, and tags queries for ucode
test/corpus/            Corpus tests for the ucode grammar
tmpl/test/corpus/       Corpus tests for ucode_tmpl
scripts/
  validate-corpus.js    Validates the grammar against real ucode projects
```

## Editing the grammar

The grammar for `.uc` files lives in `grammar.js`; the template grammar (for template `.uc` files detected by content) lives in `tmpl/grammar.js`. After editing either file, regenerate the parser:

```sh
# ucode grammar
npx tree-sitter generate

# ucode_tmpl grammar
npx tree-sitter generate tmpl/grammar.js --output tmpl/src
```

Commit the regenerated files under `src/` (or `tmpl/src/`) together with your grammar change. CI verifies that generated files are up to date.

The external lexer (`src/scanner.c`) is hand-written. It handles features that context-free grammars cannot express: automatic semicolon insertion, template string content, and ternary-vs-nullish disambiguation. Edit it directly — it is not touched by `tree-sitter generate`.

## Adding corpus tests

Corpus tests live in `test/corpus/*.txt` (ucode) and `tmpl/test/corpus/*.txt` (ucode_tmpl). Each test case follows this format:

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
# ucode
echo '<code>' > /tmp/test.uc
npx tree-sitter parse /tmp/test.uc

# ucode_tmpl (build the shared library first)
npx tree-sitter build --output ucode_tmpl.so ./tmpl
echo '<code>' > /tmp/test.uc
npx tree-sitter parse --lib-path ucode_tmpl.so --lang-name ucode_tmpl /tmp/test.uc
```

Add the test to an existing file whose category matches (e.g. `expressions.txt`, `control_flow.txt`), or create a new file if no suitable one exists. Every new syntactic feature or deliberate removal should have at least one corpus test.

## Running tests

```sh
npm test                               # both grammars, platform-aware (recommended)

# Individual grammars — ucode_tmpl is first in tree-sitter.json for content-regex
# routing, so the ucode grammar must be selected explicitly via --lib-path.
# On Windows replace .so with .dll in the commands below.
npx tree-sitter build --output ucode.so . && \
  npx tree-sitter test --lib-path ucode.so --lang-name ucode   # ucode only
npx tree-sitter test -p tmpl                                    # ucode_tmpl only

# Filter by corpus file name:
npx tree-sitter build --output ucode.so . && \
  npx tree-sitter test --lib-path ucode.so --lang-name ucode --file-name control_flow
npx tree-sitter test -p tmpl --file-name template
```

## Validating against real code

CI validates the grammar against the upstream ucode test suite and the firewall4 project. To reproduce locally:

```sh
git clone https://github.com/jow-/ucode /tmp/ucode
git clone https://github.com/nftables-project/firewall4 /tmp/firewall4

node scripts/validate-corpus.js corpus  /tmp/ucode/tests/custom
node scripts/validate-corpus.js project /tmp/firewall4
```

A small number of upstream test cases are intentionally skipped because they contain code that ucode itself rejects at compile time (not grammar bugs). They are listed in `EXPECTED_INVALID` inside `scripts/validate-corpus.js`.

## Before submitting a PR

- Grammar change regenerates cleanly (`npx tree-sitter generate`)
- All corpus tests pass (`npm test`)
- New syntax has at least one corpus test
- For removed/unsupported JS features, a test in `js_differences.txt` documents the parse behaviour
- Generated files (`src/`, `tmpl/src/`) are committed
