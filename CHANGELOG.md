# Changelog

Notable changes to tree-sitter-ucode. Releases up to v0.8.0 are described in their
[GitHub release notes](https://github.com/m00qek/tree-sitter-ucode/releases).

## Unreleased

### Breaking changes

- **Templates are parsed as ucode's statement stream.** ucode compiles a template as one stream of
  statements: every `%}` acts as a `;`, and the text between `%}` and `{%` is a statement that
  prints it. The `ucode_markup` tree now follows that model. `statement_tag` and every `*_tag` node
  (`if_alt_statement_tag`, `if_statement_tag`, `function_alt_declaration`, …) are gone. Code inside
  tags appears as ordinary statements, and text between tags as `text_statement` nodes; that
  includes the trailing `%}` and any text after the last tag. Queries that name the old nodes must
  be updated (the bundled ones already are). In return, anything that holds statements can span
  tags: switch cases, function bodies, bare blocks, and two braces opened in one tag. An unbraced
  body that runs into `%}` is an empty statement, as in ucode (`{% if (a) %}x` is `if (a) ;`
  followed by the text). The markup parser shrank from 10.3 MB to 1.5 MB.
- **One directory per grammar.** The `ucode` grammar moved from the repository root to `ucode/`,
  and the template grammar from `markup/` to `ucode_markup/`; shared code is in `common/`.
  Anything that builds from paths must change, such as Helix `subpath`s or builds that compile
  `src/` or `markup/src/` directly.
- **Node: peer dependency `tree-sitter ^0.25.0`** (was `^0.22.0`). The parsers use ABI 15, so the
  0.22 runtime could never load them; the old range was simply wrong.
- **ucdocs has an external scanner** (`ucdocs/src/scanner.c`). Builds that compile only
  `ucdocs/src/parser.c` must add it.
- **ucdocs node changes:** new `property_tag` (`@property` / `@prop`, previously `unknown_tag`);
  `@typedef` type, name and description are each optional; the JSDoc ` - ` separator is no longer
  part of a description; `number`, `integer`, `double`, `object`, `array`, `regexp` and `resource`
  are `primitive_type` nodes (they were user type references).

### Added

- The Node package exports all three grammars: `.ucode`, `.ucode_markup` and `.ucdocs`. The
  package itself is still the `ucode` grammar.
- Helix support: queries generated for Helix's capture names under `editors/helix/queries/`, and a
  complete setup in the README (including `ucdocs` injection into doc comments). Tested with
  Helix 25.07.1.
- Templates: a doc comment in its own tag (`{% /** Doc. */ %}`) attaches to the declaration in
  the next tag in `tags.scm`.
- ucdocs: dotted and `[optional=default]` names with any default value, namepath `@typedef` names,
  rest parameters in function types, `Array.<T>`, `{{ name }}` as brace text, and markdown
  (`**bold**`, bullets) in prose. Of 1327 real doc comments, 8 fail to parse instead of 160.

### Fixed

- Templates keep errors local while being edited. A half-typed tag, a tag closed mid-expression,
  or a block left open at end of input no longer turns the rest of the file into an ERROR. When
  typing a block key by key, the share of the file under ERROR nodes drops from 52–61% to 3–7%.
- A statement ended by automatic semicolon insertion now ends at its last token. It used to
  stretch over the line break and any blank lines up to the next token, or over the space before a
  `%}`. Tree shapes are unchanged; only node end positions move.
- Highlights cover every token: member-access `.`, `:` after object keys, case labels and
  alt-syntax headers, and the ucdocs `function` type keyword, commas and `.<`.
- ucdocs: a record field after a tag no longer starts with the preceding space; a name followed
  by a full stop keeps its name; an `@` inside a word is prose.

### Development

- `npm test` adds structural checks the corpus tests cannot see: scanner token order, whitespace
  at node boundaries, highlight coverage. CI validates ucdocs against ucode's stdlib doc comments.
  `npm run test:bindings` smoke-tests the Node binding.
- Built parsers live in `.build/parsers/`. tree-sitter CLI 0.27.1. `.gitattributes` and
  `.editorconfig` added.
- `scripts/check-helix-indents.sh` checks the Helix indent queries in a real Helix.
