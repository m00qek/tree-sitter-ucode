# About the public API and stability

A tree-sitter grammar has no function signatures, but integrations still
depend on it: a query names node types and fields, an editor theme keys on
capture names, a language server walks fields. This page explains which
parts of the grammars this project treats as public API, which it does not,
and why. The version rules that follow from it are in
[Compatibility](../reference/compatibility.md).

## What is API

Anything an integration names in its own code or queries:

- **Grammar names and their identities**: `ucode`, `ucode_markup`,
  `ucdocs`; their scopes, file types and injection names in
  `tree-sitter.json`; the names under which the bindings export them.
- **Named node types**: every named type in a grammar's `node-types.json`,
  such as `for_in_statement` or `doc_comment`, including the root nodes
  `program`, `markup` and `document`.
- **Field names**: `key`, `value`, `object`, `condition`, `consequence`, and
  so on. Fields are what make a query or a tree walk precise, so renaming one
  breaks integrations as surely as renaming a node.
- **Supertypes**: `statement`, `declaration`, `expression`,
  `primary_expression`. A query may name them.
- **Query files and capture names**: the files a grammar ships and the
  captures they produce (`@function.builtin`, `@local.definition`,
  `@definition.function`, …). Themes and editors key on capture names.

Renaming or removing any of these is a breaking change. While the version is
0.x, that means a minor version bump; after 1.0, a major one. The changelog
lists every such change under "Breaking changes".

## What is not API

- **Hidden rules and tokens**: anything whose name starts with `_`, such as
  `_automatic_semicolon`, `_block_end` or `_for_in_header`. They do not
  appear in trees and may change at any time.
- **The external scanner's internals**: the order of the external tokens,
  the scanner's state, and how it decides. The order matters only between
  the grammar and its scanner, and the test suite checks that they match.
- **The generated parser**: `parser.c`, state counts, parse-table layout.
- **The shape of trees for invalid input**: where an ERROR node starts and
  ends, which MISSING token recovery inserts, and how much of the input it
  keeps. Making recovery better is one of the project's goals (see
  [Error recovery](error-recovery.md)), so these shapes change in ordinary
  releases.
- **The patterns inside query files**: which nodes a capture lands on may
  be corrected, as long as the capture names keep their meaning. A fix that
  highlights a token that was not highlighted before is not breaking.

## The grey areas

Some changes sit between the two lists:

- **Node positions in valid input.** A fix moved the end of a statement
  ended by automatic semicolon insertion from after the following line break
  to its last token. No tree shape changed, but an integration that relied on
  the old end position saw different ranges. The project treated this as a
  fix.
- **Anonymous tokens.** Queries can match literal tokens such as `"endif"`
  or `"?."`. These follow ucode's syntax; they change when ucode's syntax
  does, or when the grammar learns that ucode treats something differently.
  `get` and `set` stopped being keywords because ucode never had them.
- **New syntax.** Supporting syntax that used to be an ERROR adds node types
  or fields and turns some ERROR trees into valid ones. That is additive: a
  minor version.

## Why draw the line here

The line follows what integrations can see and name. Everything on the API
list appears in `node-types.json` or in a shipped query file, and the
project's own queries, bindings and the ucode language server depend on the
same things an outside integration does. Everything off the list is either
invisible in the tree or describes input that is already wrong.

The alternative, freezing tree shapes in general, would freeze error
recovery, which is the part of the grammar that most needs to keep
improving. Keeping hidden rules private is what lets the grammar's internals
be restructured without breaking anyone who stayed on named nodes and
fields. When a restructuring does change named nodes, as the move to
[templates as a statement stream](templates.md) did, it is released as a
breaking change.
