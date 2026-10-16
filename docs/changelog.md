# Changelog

Notable changes to tree-sitter-ucode. Releases up to v0.8.0 are described in their
[GitHub release notes](https://github.com/m00qek/tree-sitter-ucode/releases).

## Unreleased

## 0.9.0 (2026-10-16)

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
  are `primitive_type` nodes (they were user type references). Fields that take new node types:
  `param_tag.name` may be a `param_path` (`@param opts.name`), `optional_param.name` a plain
  `identifier` (`[name]`), `typedef_tag.name` a `namepath`; `typedef_tag` has a `description`
  field; function types take a `rest_param` (`(...any) => R`). Now optional: `module_tag.name`,
  and the element / value of `list_type` / `dict_type` (bare `{list}`, `{dict}`).
- **`tree-sitter.json` no longer lists `folds`, `indents` or `textobjects`**, which the official
  schema does not define; the query files are still shipped under `queries/`.
- **Locals use the plain `@local.definition` capture.** `@local.definition.function`, `.var`,
  `.parameter` and `.import` made `tree-sitter tags` fail outright and were ignored by
  tree-sitter-highlight. The kind is now metadata on each pattern, `(#set! local.kind …)`; the
  Helix queries still get Helix's `@local.definition.<scope>` names.
- **`ucdocs/queries/tags.scm` is a tags query.** It was a field-extraction query (`@param.type`,
  `@template.param`, …) registered as tags, which tree-sitter-tags rejected. It now tags `@typedef`
  names as type definitions and named and module types as references.
- **Alt-syntax bodies are a `statement_list` node.** The statements of `if (c): … endif` (and its
  `elif` / `else`), `for (…): … endfor`, `while (c): … endwhile` and `function f(): … endfunction`
  were loose children of the statement; they are now one `statement_list`, absent when the body
  is empty. `function_declaration`'s `body` is a `statement_block` or a `statement_list`; it used
  to cover the colon form's `:` and `endfunction` too.
- **Alt-syntax `if` uses the brace form's field names:** `if_alt_statement` has `condition`,
  `consequence` and `alternative` (was `body` and `else_body`), `elif_clause` has `condition` and
  `consequence` (was `body`), and `else_alt_clause`'s body has no field name, like
  `else_clause`'s.
- **`for_statement`'s `condition` field no longer includes the `;`** after the condition.
- **`{#` / `#}` are named nodes** (`comment_tag_open`, `comment_tag_trim_open`,
  `comment_tag_close`, `comment_tag_trim_close`), like the delimiters of the other tags.
- **For-in fields say what they bind:** `for (k, v in o)` has `key`, `value` and `object`
  (was `left`, `value` and `right`); `for (x in o)` has `variable` and `object` (was `left` and
  `right`).
- **`default` in import and export lists is a named `(default)` node** in the `name` or `alias`
  field (`import { default as d }`, `export { d as default }`); it was an anonymous keyword.
- **Doc comments are `doc_comment` nodes:** `/** … */` with exactly two stars (`/***` and `/**/`
  stay `comment`). Queries that matched `(comment)` with a `#match?` on `^/\*\*` should match
  `(doc_comment)` instead; the bundled ones do.
- **ucdocs:** `union_type` is flat (`a | b | c` is one node with three members, not nested
  pairs), and a `description`'s prose is a list of `text` children that never cross a line end,
  so the comment frame (` * `) is never inside a child. Brace text in prose no longer spans line
  ends either.

### Added

- The Node package exports all three grammars: `.ucode`, `.ucode_markup` and `.ucdocs`. The
  package itself is still the `ucode` grammar.
- C, Rust, Python, Go and Swift bindings, each exposing all three grammars (C: one library per
  grammar, buildable with make or CMake). See [Use a binding](how-to/use-bindings.md); only
  the npm package is published so far.
- Helix support: queries generated for Helix's capture names under `editors/helix/queries/`, and a
  complete setup in [Register in Helix](how-to/register-helix.md) (including `ucdocs` injection into doc comments). Tested with
  Helix 25.07.1.
- Templates: a doc comment in its own tag (`{% /** Doc. */ %}`) attaches to the declaration in
  the next tag in `tags.scm`.
- ucdocs: dotted and `[optional=default]` names with any default value, namepath `@typedef` names,
  rest parameters in function types, `Array.<T>`, `{{ name }}` as brace text, and markdown
  (`**bold**`, bullets) in prose. Of 1327 real doc comments, 8 fail to parse instead of 160.
- Highlighting of ucode's builtins: the stdlib functions as `@function.builtin` when called, and
  `ARGV`, `SCRIPT_NAME`, `REQUIRE_SEARCH_PATH` and `global` as `@variable.builtin`.
- Injections: regex literals (`regex`) and the format string of `printf()` / `sprintf()`
  (`printf`). Doc comments are also `@comment.documentation`, and the target of `{@link …}` is
  `@markup.link`.
- Scripts are recognised by a `#!` line naming `ucode` (`first-line-regex` in tree-sitter.json,
  `shebangs` in the Helix setup).
- Highlight and tags assertion tests (`test/highlight/`, `test/tags/`), run by `npm test` through
  tree-sitter-highlight and tree-sitter-tags themselves.
- Node prebuilds for macOS on Intel (darwin-x64) and Windows on Arm (win32-arm64).
- Neovim: text objects follow nvim-treesitter-textobjects' conventions: `@parameter.outer`
  takes its comma; call arguments, import specifiers and array/object elements are parameters;
  `@block.inner` and the other `.inner` objects select everything between the braces; new
  `@statement`, `@return`, `@assignment`, `@comment`, `@regex` and `@number` objects. Indents
  dedent a line that starts with `}` `]` `)` or an end keyword, indent braceless bodies and empty
  `case`s, and keep doc comment lines as they are (new `ucdocs/queries/indents.scm`). Folds
  cover `case`s, multi-line comments and runs of imports.

### Fixed

- Templates keep errors local while being edited. A half-typed tag, a tag closed mid-expression,
  or a block left open at end of input no longer turns the rest of the file into an ERROR. When
  typing a block key by key, the share of the file under ERROR nodes drops from 52–61% to 3–7%.
- A statement ended by automatic semicolon insertion now ends at its last token. It used to
  stretch over the line break and any blank lines up to the next token, or over the space before a
  `%}`. Tree shapes are unchanged; only node end positions move.
- Highlights cover every token: member-access `.`, `:` after object keys, case labels and
  alt-syntax headers, and the ucdocs `function` type keyword, commas and `.<`.
- ucdocs: a description, and the tag holding it, ends at its last visible character instead of
  running on through trailing spaces before `*/` or a line end.
- `get` and `set` are ordinary identifiers, as in ucode: `for (get in o)`, `(get, set) => …` and
  `let set = …` used to produce ERROR nodes. The anonymous `get` / `set` node types are gone.
- `return` followed by a line break returns the next line's expression, as in ucode
  (`return⏎ a + b;`). It used to parse as an empty `return` followed by a separate statement.
- Only ucode's whitespace (space, tab, line feed, carriage return, form feed, vertical tab) is
  whitespace. No-break space, U+2028 / U+2029, zero-width space, word joiner and a byte order mark
  inside the file are now errors, as in ucode; a byte order mark at the very start is still
  skipped by tree-sitter itself. The scanner no longer depends on the host's locale.
- A file that ends inside open blocks (one still being typed) keeps its structure: each open
  `{`, alt-syntax body or object literal gets its MISSING closer at the end of input, in scripts
  as in templates. A script used to become one ERROR from the open construct on, and a template
  recovered only from a single open block.
- Templates: `{{` and `}}` are tag delimiters anywhere in code, as in ucode. `{% x = {a:{b:1}}; %}`,
  `{{ {a:{b:1}} }}` and a `{{` inside a `{% … %}` tag were accepted as braces; they are errors now.
  A broken expression tag (`{{ obj. }}`) is a local error instead of running into the text and
  tags after it.
- `tree-sitter tags` works for all three grammars (see the locals and ucdocs tags changes above).
- With tree-sitter-highlight (the CLI, GitHub): comments and doc-comment descriptions are
  highlighted again (`@spell` came last and replaced `@comment`), parameters keep their highlight
  inside the function body, a regex's slashes belong to the regex instead of being operators, and
  the `}` closing `${…}` matches its `${`.
- `.ut` files are templates: they go to `ucode_markup` only (the `ucode` grammar claimed them
  too), and the Helix setup maps `*.ut` to `ucode-markup` instead of `*.uc.tmpl`.
- Locals: alt-syntax `if` / `elif` / `else` / `while` bodies and `switch` bodies are scopes, as
  they are in ucode.
- Tags: every exported `const` / `let` that is not a function is tagged, with its doc comment;
  calls to ucode's builtins are not references; doc text no longer ends with `*/`.
- ucdocs: a record field after a tag no longer starts with the preceding space; a name followed
  by a full stop keeps its name; an `@` inside a word is prose.
- ucdocs: bare `{list}` and `{dict}` types, a lowercase `@template t` and a bare `@module` parse,
  and so does a `}` in prose with no `{` before it; all were errors. Identifiers no longer accept
  `$`, which ucode does not have.
- C: `make` rebuilt a code grammar's scanner only when its `scanner.c` shim changed, not when
  `common/scanner.h` (the scanner itself) did, so an incremental build could link a stale
  scanner.
- C: `make install PREFIX=…` after a plain `make` installed pkg-config files that still pointed at
  `/usr/local`; the `.pc` files are now generated at install time.
- Nothing may separate `?.` from a following `[` or `(`: `a?. [1]` and `a?.⏎(1)` are errors, as
  in ucode, which reads `?.[` and `?.(` as single tokens. `a?. b` is still fine.

### Development

- Documentation is an MkDocs site in `docs/`, published at
  <https://m00qek.github.io/tree-sitter-ucode/>. It replaces `CONTRIBUTING.md` and
  `CHANGELOG.md` (now this page); the README is a short pointer to the site.
- `npm test` adds structural checks the corpus tests cannot see: scanner token order, whitespace
  at node boundaries, highlight coverage. CI validates ucdocs against ucode's stdlib doc comments.
  `npm run test:bindings` smoke-tests the Node binding.
- Built parsers live in `.build/parsers/`. tree-sitter CLI 0.27.1. `.gitattributes` and
  `.editorconfig` added.
- `scripts/validate-corpus.js` fails on any MISSING node, checks that its expected-invalid
  testcases still fail, parses `.ut` files in project mode, and runs one tree-sitter process per
  grammar instead of one per testcase.
- Corpus tests that only assert a parse error use `:error` instead of a snapshot of the ERROR
  tree; CRLF line endings are tested.
- `tree-sitter.json` validates against the official schema, and declares `common/scanner.h` as
  an external file so the CLI rebuilds its cached parsers when the shared scanner changes.
- `scripts/check-helix-indents.sh` checks the Helix indent queries in a real Helix; CI runs it.
- CI: every GitHub Action is pinned to a commit SHA (the version is in a comment beside it),
  including in the publish path, which holds the token for npm provenance.
- CI: workflows grant only `contents: read` by default, checkouts drop their credentials, every
  job has a timeout, and `ci.yml` uses no caches because it builds the release artifacts. A
  `workflows` job runs actionlint and zizmor; Dependabot proposes action and docs-tool updates
  weekly. Docs-only pushes to `main` skip CI; `docs.yml` builds the site on pull requests and
  deploys it to GitHub Pages from `main`.
- `scripts/check-nvim-queries.lua` checks the Neovim indents, folds and text objects in a real
  Neovim with nvim-treesitter and nvim-treesitter-textobjects; CI runs it.
- Every binding test (C, Rust, Go, Python, Swift, Node) parses a sample per grammar and compiles the
  shipped queries. `make test-c` installs the C libraries into a temporary prefix and builds a
  program against the installed headers, pkg-config files and shared libraries; CI runs it with
  the oldest supported runtime, 0.25.
- CI: a tag must match all nine version strings before anything is published, and publishing waits
  for every binding job. firewall4 is pinned; fuzzing also runs on parser changes and weekly;
  Python is tested on 3.10 too.
