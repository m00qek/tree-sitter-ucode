# tree-sitter-ucode

Tree-sitter grammar for [ucode](https://github.com/jow-/ucode), the ECMAScript-like scripting language used in OpenWrt.

Three grammars are provided:

| Grammar | Scope | File types | Purpose |
|---------|-------|------------|---------|
| `ucode` | `source.uc` | `.uc`, `.ucode`, `#!…ucode` scripts | Plain ucode source files |
| `ucode_markup` | `source.ucode.markup` | `.ut`; `.uc` / `.ucode` detected by content | Ucode template files mixing raw text and code tags |
| `ucdocs` | `source.ucdocs` | injected | JSDoc-style `/** */` doc comment blocks |

`.ut` files are templates. `.uc` and `.ucode` files can be either, so they are told apart by
content: one with a tag opener (`{%`, `{{`, or `{#`) at the start of a line (with optional
leading whitespace) is parsed by `ucode_markup`, and any other falls back to `ucode`. See
[File-type detection](#file-type-detection) below.

`ucdocs` is not a standalone file grammar — it is automatically injected by the `ucode` and
`ucode_markup` grammars into every `/** */` doc comment block. Tools that load grammars from
`tree-sitter.json` handle this automatically; editor plugins usually register `ucdocs` and its
injection query themselves — see the editor sections below.

## Targeted ucode version

This grammar targets the ucode interpreter as shipped in **OpenWrt 25.12**
(package `ucode-2026.01.16~85922056-r1`, commit
[`8592205`](https://github.com/jow-/ucode/commit/85922056ef7abeace3cca3ab28bc1ac2d88e31b1)
in [jow-/ucode](https://github.com/jow-/ucode)) — not ucode's unpinned `master`
branch, which moves independently and can be well ahead of what any released
OpenWrt version actually runs. `.github/workflows/ci.yml`'s corpus-validation
job checks out that exact commit; `scripts/validate-corpus.js`'s
`EXPECTED_INVALID` and `KNOWN_GRAMMAR_GAPS` sets are curated against it.

Syntax that lands on ucode `master` after that commit — at last check:
dynamic `import()` expressions, object method shorthand (`{ foo() {} }`),
function forward declarations (`function f;`), and `export function` without
a trailing `;` — is deliberately **not** supported yet. If your ucode build
is newer than OpenWrt 25.12's (e.g. built from a recent `master` checkout),
you may hit spurious ERRORs on these constructs; that's expected until the
grammar's target is bumped to match a newer OpenWrt release.

To re-target a newer release: find its ucode package version (e.g. via
`apk info -a ucode` / `opkg info ucode` on that release, or its image's
`/etc/os-release`), resolve the short hash embedded in the version string
against [jow-/ucode](https://github.com/jow-/ucode) to get the full commit,
update the `ref:` in `ci.yml`, and run `node scripts/validate-corpus.js
corpus <path to that commit's tests/custom>` to find what's newly valid (or
newly invalid) — this will very likely repopulate `KNOWN_GRAMMAR_GAPS` and/or
`EXPECTED_INVALID` in `scripts/validate-corpus.js` until the grammar catches
up.

## Ucode vs JavaScript

Ucode is an ECMAScript subset with OpenWrt-specific extensions. Key differences:

| Feature | Ucode | JavaScript |
|---------|-------|------------|
| Alternative block syntax | `if/elif/else/endif`, `for/endfor`, `while/endwhile`, `function/endfunction` | Not supported |
| Two-variable for-in | `for (k, v in obj)` | Single variable only |
| Removed keywords | `var`, `new`, `throw`, `typeof`, `void`, `class`, `instanceof`, `do`, `async`, `await`, `yield` | All supported |
| Removed features | Destructuring, `for...of`, `do-while`, generators | All supported |
| Added number literals | `0177` (C octal), `0x1.8` (hex float), `0B`/`0O` prefixes | Standard only |
| Added escape sequences | `\e` (ESC), `\a` (BEL), octal `\177` | Standard only |
| String unicode escapes | `\uXXXX` only (no `\u{…}`); no `\u` escapes in identifiers | `\uXXXX` and `\u{…}` |
| Raw newlines in strings | Allowed — `'…'` and `"…"` may span raw line terminators | SyntaxError (unterminated string) |
| Regex flags | `g`, `i`, `s` only | Full set |
| Module system | Static `import`/`export` only; no `from` on re-exports | Full ES modules |

The grammar tracks ucode's parser closely, with a few deliberate divergences:

- **Automatic semicolon insertion is kept ECMAScript-style (more lenient than the
  compiler).** ucode only lets you drop a statement's `;` before `}`, end-of-file, a
  template tag close, or an alt-syntax end keyword (`endif`/`endfor`/`endwhile`/
  `endfunction`/`elif`/`else`), whereas the grammar also tolerates a **bare newline
  between statements** so that in-progress edits are not flagged as errors. The leniency
  spans a comment that sits on **its own line** between two statements — the boundary
  semicolon is still inserted. It does not extend to a statement that begins on the
  comment's own closing line: `x = 1` `/* c */ y = 2` (with `y = 2` after the `*/`)
  errors, matching ucode. Conversely, a comment does **not** break an expression that
  continues on the next line — `a\n// note\n.b` stays a single member access and
  `a\n/* note */\n+ b` a single addition, also matching ucode. Two statements are
  exempt and always need their `;`, as in ucode: `export default …;` and
  `export function f() {};`. Leaving it off is a JavaScript habit that ucode rejects
  when it loads the module, so the grammar flags it.
- **Some constructs ucode rejects only at compile time still parse.** The grammar
  describes ucode's *syntax*; semantic rejections the compiler makes after parsing are
  left to the compiler (and to linters), not enforced here — matching how tree-sitter
  grammars work in general. Known cases: a statement-position or unparenthesized
  arrow-body object literal (`{a: 1};` and `x => {a: 1}`, which ucode treats as a block
  and rejects — write `({a: 1})`); and `break`/`continue` outside a loop or switch. These
  parse as well-formed trees even though `ucode -c` reports a syntax error.
- **`a++ / b` parses as division, not ucode's own lexer bug.** ucode's lexer never
  clears its "expect a value, not an operator" flag after a postfix `++`/`--`, so it
  starts scanning a regex at the following `/` and fails with "Unterminated string" once
  it runs off the end of the statement (`(a++) / b` is unaffected — only the bare,
  unparenthesized form triggers it). This is a bug in ucode itself, not a syntax rule;
  the grammar parses the ordinary, intended meaning instead of reproducing it, since
  `a++ / b` is overwhelmingly real division in practice.

## Doc comment grammar (ucdocs)

`/** */` blocks are `doc_comment` nodes in the code grammars (exactly two stars: `/***` and
`/**/` are plain `comment`s, as in JSDoc). They are parsed by the `ucdocs` grammar, injected
into the host parse tree.
The grammar understands the following tags:

| Tag | Syntax |
|-----|--------|
| `@param` | `@param {Type} name description` — name may be dotted (`opts.timeout`) or `[optional=default]` |
| `@returns` / `@return` | `@returns {Type} description` |
| `@throws` / `@throw` | `@throws {Type} description` |
| `@type` | `@type {Type}` |
| `@typedef` | `@typedef {Type} TypeName description` — the name may be a namepath (`module:core.TimeSpec`); type, name and description are all optional (a bare `@typedef` + `@name` + `@property` lines is the stdlib's enum style) |
| `@property` / `@prop` | `@property {Type} name description` — name may be a constant, dotted, `[optional=default]`, or `*` |
| `@template` | `@template T, U` |
| `@function` | `@function module:path#member` |
| `@module` | `@module name` |
| `@deprecated` | `@deprecated description` |
| `@since` | `@since version` |
| `@see` | `@see reference` |
| `@example` | `@example code` |
| `@default` | `@default value` |

Type expressions support: primitives (`int`, `integer`, `float`, `double`, `number`, `string`,
`boolean`, `null`, `void`, `function`, `object`, `array`, `regexp`, `resource` — the doc-convention
names plus ucode's own runtime type names), `*`/`any`, `list<T>`, `dict<T>`, record types (`{field: T}`), named types
(`TypeName`, `TypeName<T, U>`), cross-module refs (`module:path.To.Type`), named function
types `(name: T) => U`, anonymous function types `function(T): U` (both may end in a rest
parameter: `(...any) => R`, `function(string, ...any)`), JSDoc's dotted generic `Array.<T>`, union `T | U` (one flat `union_type` however many members), nullable
`?T`, and array postfix `T[]`. Inline `{@link ...}` tags and optional params `[name=default]`
are also supported; a default may be any value up to the closing `]`
(`[mode="r"]`, `[mode=0o666]`, `[end=buffer.length()]`).

A ` - ` between a name and its description is the JSDoc separator and is not part of the
description. A block tag starts at an `@` at the beginning of a word; an `@` inside a word
(`foo@bar.com`, `` `@` ``) is ordinary prose. Descriptions may contain markdown: only the
single ` * ` comment frame at the start of each line is stripped, so `**bold**`, `*italic*` and
`* bullets` stay intact. None of a `description`'s children (`text` runs, `inline_tag`s and the
tokens of brace text) crosses a line end, so its text without the frame is the source of its
children, line by line.

## Requirements

- [tree-sitter CLI](https://github.com/tree-sitter/tree-sitter) ≥ 0.25 (the parsers use ABI 15)
- Node.js ≥ 18 (for the Node.js bindings only)

## Build

```sh
npm install
npm run build        # regenerate all three parsers, build them into .build/parsers/,
                     # and compile the Node.js binding
```

To regenerate parsers after editing a grammar file (run from the repo root):

```sh
# ucode and ucode_markup (both are built from common/define-grammar.js)
npx tree-sitter generate ucode/grammar.js --output ucode/src
npx tree-sitter generate ucode_markup/grammar.js --output ucode_markup/src

# ucdocs
npx tree-sitter generate ucdocs/grammar.js --output ucdocs/src
```

## Test

```sh
npm test             # builds and tests all three grammars (ucode, ucode_markup, ucdocs)
```

To filter by corpus file name (run from the repo root):

```sh
npx tree-sitter test -p ucode --file-name control_flow.txt
npx tree-sitter test -p ucode_markup --file-name markup.txt
npx tree-sitter test -p ucdocs --file-name tags.txt
```

## File-type detection

`.ut` belongs to `ucode_markup` alone. `ucode` and `ucode_markup` both claim `.uc` and
`.ucode`; tools that read `tree-sitter.json` and respect its `content-regex` field route such a
file to `ucode_markup` when a tag opener (`{%`, `{{`, or `{#`) appears at the start of a line
(with optional leading whitespace) — `tree-sitter highlight` run in this repository does. An
extensionless script whose first line is a `#!` naming `ucode` goes to `ucode`.

`tree-sitter parse` picks a grammar by file extension alone, so name the template grammar
explicitly: `tree-sitter parse --lib-path .build/parsers/ucode_markup.so --lang-name
ucode_markup file.ut` (pair `--lang-name` with `--lib-path` — the flag is silently ignored
alone). Editors that manage their own filetype dispatch (Neovim, Helix) need an explicit rule
— see the editor sections below.

## Use from Node.js

The package needs the `tree-sitter` runtime 0.25 or newer (the parsers use ABI 15). The package
itself is the `ucode` grammar; all three grammars are also exported by name:

```js
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const parser = new Parser();
parser.setLanguage(ucode);               // or ucode.ucode — plain scripts
parser.setLanguage(ucode.ucode_markup);  // templates
parser.setLanguage(ucode.ucdocs);        // /** */ doc comments
```

## Use from other languages

C, Rust, Python, Go and Swift bindings ship in this repository too, each exposing the three
grammars. Only the npm package is published; until the others are, depend on the repository.

| Language | Get it | The three grammars |
| --- | --- | --- |
| C | `make install` or CMake (`add_subdirectory()` works) | `tree_sitter_ucode()`, `tree_sitter_ucode_markup()`, `tree_sitter_ucdocs()` — headers `<tree_sitter/tree-sitter-ucode.h>`, `-ucode-markup.h`, `-ucdocs.h`; libraries and pkg-config names `tree-sitter-ucode`, `tree-sitter-ucode-markup`, `tree-sitter-ucdocs` |
| Rust | `tree-sitter-ucode = { git = "https://github.com/m00qek/tree-sitter-ucode" }` | `LANGUAGE_UCODE`, `LANGUAGE_UCODE_MARKUP`, `LANGUAGE_UCDOCS`, plus `<GRAMMAR>_NODE_TYPES` and `<GRAMMAR>_HIGHLIGHTS_QUERY` (…`INJECTIONS`, `LOCALS`, `TAGS`) |
| Python | `pip install git+https://github.com/m00qek/tree-sitter-ucode` | `language_ucode()`, `language_ucode_markup()`, `language_ucdocs()`, plus the same `<GRAMMAR>_…_QUERY` constants |
| Go | `go get github.com/m00qek/tree-sitter-ucode/bindings/go` | `LanguageUcode()`, `LanguageUcodeMarkup()`, `LanguageUcdocs()` |
| Swift | `.package(url: "https://github.com/m00qek/tree-sitter-ucode", branch: "main")` | modules `TreeSitterUcode`, `TreeSitterUcodeMarkup`, `TreeSitterUcdocs` |

Each needs a tree-sitter runtime that loads ABI 15 parsers: py-tree-sitter 0.25+,
go-tree-sitter 0.25+, the `tree-sitter` crate 0.25+, libtree-sitter 0.25+.

## Use in Neovim

The easiest way to install this grammar in Neovim is with
[tree-sitter-manager.nvim](https://github.com/m00qek/tree-sitter-manager.nvim),
which handles parser registration, filetype detection, and query setup automatically.

## Use in Helix

Helix needs the grammars, a `languages.toml` entry per language — including `ucdocs`, which
Helix injects into `/** */` comments — and query files. Use the same revision of this repository
for the grammars and the queries. The layout below (`ucode/`, `ucode_markup/`, `ucdocs/` and
`editors/helix/`) is newer than v0.8.0, so until the next release the instructions pin commit
`cb05bb84e761`.

1. Add to `~/.config/helix/languages.toml`:

   ```toml
   [[language]]
   name                 = "ucode"
   scope                = "source.uc"
   file-types           = [{ glob = "*.uc" }, { glob = "*.ucode" }]
   shebangs             = ["ucode"]
   comment-tokens       = "//"
   block-comment-tokens = { start = "/*", end = "*/" }
   indent               = { tab-width = 2, unit = "  " }
   grammar              = "ucode"

   [[language]]
   name                 = "ucode-markup"
   scope                = "source.ucode.markup"
   file-types           = [{ glob = "*.ut" }]
   block-comment-tokens = { start = "{#", end = "#}" }
   indent               = { tab-width = 2, unit = "  " }
   grammar              = "ucode_markup"

   # Doc comments; injected, never opened directly (Helix declares its jsdoc the same way).
   [[language]]
   name            = "ucdocs"
   scope           = "source.ucdocs"
   injection-regex = "^ucdocs$"
   file-types      = ["ucdocs"]
   grammar         = "ucdocs"

   [[grammar]]
   name   = "ucode"
   source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucode" }

   [[grammar]]
   name   = "ucode_markup"
   source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucode_markup" }

   [[grammar]]
   name   = "ucdocs"
   source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucdocs" }
   ```

2. Build the grammars: `hx --grammar fetch && hx --grammar build`.

3. Install the queries. Helix finds them by language name under its runtime directory;
   `editors/helix/queries/` has one directory per language above, written for Helix's capture
   names (this repository's own `queries/` directories use Neovim's):

   ```sh
   git clone https://github.com/m00qek/tree-sitter-ucode /tmp/tree-sitter-ucode
   git -C /tmp/tree-sitter-ucode checkout cb05bb84e761ec63cadbd02c98e1c07995e0ec6b
   mkdir -p ~/.config/helix/runtime/queries
   cp -r /tmp/tree-sitter-ucode/editors/helix/queries/* ~/.config/helix/runtime/queries/
   ```

4. Check with `hx --health ucode` (and `ucode-markup`, `ucdocs`).

Highlights, locals, injections and text objects follow Helix's documented conventions, and CI
checks that the Helix highlights cover every token. The queries are tested with Helix 25.07.1,
including indentation while typing (`scripts/check-helix-indents.sh`).

Helix does not support content-based filetype detection for shared extensions. For
`.uc` files that are templates, use `:set-language ucode-markup` in command mode,
or configure a file-specific override via a `.helix/languages.toml` in your project.

## Template files

Template files mix raw text with code tags. The `ucode_markup` grammar produces a
`markup` tree that contains the code itself — the same nodes the `ucode` grammar
produces — so no language injection is needed to highlight the code in a template.

| Tag | Purpose |
|-----|---------|
| `{% ... %}` | Execute ucode statements (no output) |
| `{{ ... }}` | Evaluate expression and emit output |
| `{# ... #}` | Template comment (discarded) |
| `{%- ... -%}` | Statement block — strip whitespace on both sides |
| `{{- ... -}}` | Expression block — strip whitespace on both sides |
| `{%+ ... %}` | Statement block — suppress `lstrip_blocks` stripping |
| `{#- ... -#}` | Comment — strip whitespace on both sides |

Opener and closer markers are independent: any opener variant may be combined
with any closer variant. `{%-` / `{{-` / `{#-` strip the preceding raw text;
`-%}` / `-}}` / `-#}` strip the following raw text. `{%+` suppresses
`lstrip_blocks` stripping and may be combined with `-%}`.

Example:

```
Hello, {{ name }}!
{% for (let i in items): %}
  - {{ items[i] }}
{% endfor %}
```

### How templates are parsed

ucode's compiler reads a template as **one statement stream**: `{%` is dropped,
every `%}` acts as a `;`, and the text between `%}` and the next `{%` (raw text,
`{{ … }}` and `{# … #}` tags) is a statement that prints it. The grammar models
exactly that. A template is a statement list in which each `%} … {%` stretch, and
the text after the last `%}`, is a `text_statement`:

```
{% if (user) { %}
  Hello, {{ user }}!
{% } else { %}
  Please log in.
{% } %}
```

```
(markup
  (statement_tag_open)
  (if_statement
    condition: (parenthesized_expression (identifier))
    consequence: (statement_block
      (text_statement (statement_tag_close) (raw_text) (expression_tag …) (raw_text) (statement_tag_open)))
    alternative: (else_clause
      (statement_block
        (text_statement (statement_tag_close) (raw_text) (statement_tag_open)))))
  (text_statement (statement_tag_close)))
```

Text can appear anywhere ucode accepts a statement, and nowhere else. So
any construct that holds statements can span tags, with no special cases. That
covers brace blocks, the `:` … `endif` alt-syntax, function and arrow-function
bodies, `switch` cases, bare `{ }` blocks, several statements or openers sharing
one tag (`{% log(n); if (c) { %}`, `{% for (x in xs): for (y in ys): %}`), and a
file that ends inside an open `{%` tag. Text inside an expression
(`{% x = [ %}a{% ] %}`) is an error, as in ucode.

Because `%}` is a `;`, an unbraced body that runs straight into a tag close is
empty: `{% if (a) %}text{% %}` is `if (a) ;` (an `empty_statement` consequence)
followed by the text as the next statement. A later `{% else %}` is then an
error, just as in ucode. Use braces or the `:` form when the text is the body.

As in ucode, `{{` and `}}` are tag delimiters anywhere in template code, not
just in text: `{% x = {a:{b:1}}; %}` is an error (separate the braces: `{a:{b:1} }`), and so is
a `{{` inside a `{% … %}` tag. Inside strings, regexes and template-literal text
they are ordinary characters.

A `//` comment runs to the end of its line, so it swallows a `%}` on the same
line, again as in ucode; put the `%}` on the next line or use `/* */`. A file may
end inside an open `{%` tag, but not inside `{{` or `{#`: those are errors, as
in ucode.

While a file is being edited, errors stay local. Blocks and alt-syntax bodies
that are not closed yet at the end of the file each end in a zero-width
`(MISSING "}")` / `(MISSING "endif")` node instead of an ERROR around them, in
scripts and templates alike. A half-typed or broken tag (`{% if (co`,
`{{ obj. }}`) becomes a small ERROR, bounded by the next tag delimiter, rather
than swallowing the rest of the file.

## License

MIT
