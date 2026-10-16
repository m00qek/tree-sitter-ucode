# About the architecture

## One definition, two code grammars

ucode code appears in two kinds of file: scripts, which are code from the
first byte, and templates, which are text with code in tags. A tree-sitter
grammar has one start rule, so the two need separate parsers. But the code
inside a template tag is ordinary ucode, and two copies of a 1,200-line rule
set would drift apart.

So both parsers are built from one function, `defineGrammar(name)` in
`common/define-grammar.js`, the same pattern tree-sitter-typescript uses for
TypeScript and TSX. `ucode/grammar.js` and `ucode_markup/grammar.js` are
one-line calls to it. The two grammars differ in only two ways:

- the start rule: `program` for scripts, `markup` for templates, which begins
  in text mode;
- the template-only rules: `text_statement` and the tag rules it uses, plus
  the zero-width empty statement before `%}`.

Everything else, including every node a query can name, is the same. That is
why one set of queries serves both grammars (see
[Editor queries](editor-queries.md)), and why the code in a template needs no
language injection to be highlighted.

The external-token list is identical in both grammars too, because the
scanner is shared; the script grammar simply never reaches the template
tokens.

## One scanner, two shims

The external scanner lives in `common/scanner.h`. Every function in it is
`static`, and each grammar's `src/scanner.c` is a shim that includes the
header and exports the five entry points tree-sitter expects under that
grammar's name. Each parser library therefore gets its own private copy of
the scanner, and no symbols leak from one library into the other. The markup
shim sets `UCODE_SCANNER_TEMPLATE` before the include, which turns on the
template-only lexing.

`tree-sitter generate` never touches the shims or the header. Two
consequences follow:

- Build tools that decide what to rebuild by looking at `scanner.c` miss
  changes to the header. `tree-sitter.json` lists `common/scanner.h` under
  `external-files` so the CLI's cache notices; the Makefile and
  `run-tests.js` list it as a dependency.
- `common/scanner.h` includes `"tree_sitter/parser.h"`, which compilers look
  up on the include path, not next to the header. Every build file passes
  `-I<grammar>/src`.

## ucdocs stands alone

Doc comments are a different language: tags, type expressions and prose, not
statements and expressions. Sharing the code grammar's rules would buy
nothing, so `ucdocs/grammar.js` is a standalone grammar with its own small
scanner. It is joined to the code grammars only through injection (see
[Doc comments and ucdocs](doc-comments.md)).

## A grammar-free root

Every grammar lives in its own directory, and the repository root holds none.
This came out of a problem with `tree-sitter.json`. While the `ucode` grammar
lived at the root, a valid manifest made `tree-sitter test` run at the root
test the root corpus with the `ucdocs` grammar: 178 of 224 tests failed (CLI
0.27.1). The workaround was to leave `scope` off the `ucdocs` entry, which
made the whole manifest fail to parse, so the CLI fell back to the root
grammar. That cost every feature that reads the manifest: content-based
routing, CLI highlighting and injection. With no grammar at the root there is
nothing to mis-route, so all three entries have a scope again, and tests run
per grammar (`tree-sitter test -p <grammar>`).

The root still runs one `tree-sitter test`: the highlight and tags assertion
tests in `test/`, which need the manifest to find each file's grammar.

## Bindings for three grammars

The bindings started from what `tree-sitter init` (CLI 0.27.1) scaffolds, and
were adapted for three grammars the way tree-sitter-typescript does it: one
library per grammar in C, one package exposing all three everywhere else.
`tree-sitter init --update` would undo that. It would put the single-grammar
templates back, convert the Node.js package to ESM, and rewrite
`tree-sitter.json`, dropping `content-regex`.

Nothing in the C, CMake or other binding build files regenerates the parsers.
`<grammar>/src` is committed, and regenerating needs the CLI and Node.js for
`common/define-grammar.js`: tools a project that vendors this repository
should not need.
