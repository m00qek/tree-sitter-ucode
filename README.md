# tree-sitter-ucode

Tree-sitter grammar for [ucode](https://github.com/jow-/ucode), the ECMAScript-like scripting language used in OpenWrt.

Three grammars are provided:

| Grammar | Scope | File types | Purpose |
|---------|-------|------------|---------|
| `ucode` | `source.uc` | `.uc`, `.ucode`, `.ut` | Plain ucode source files |
| `ucode_markup` | `source.ucode.markup` | `.uc`, `.ucode`, `.ut` (template files — detected by content) | Ucode template files mixing raw text and code tags |
| `ucdocs` | — | injected | JSDoc-style `/** */` doc comment blocks |

`ucode` and `ucode_markup` share file extensions. Template files are distinguished from plain
code files by content: any file containing a tag opener (`{%`, `{{`, or `{#`) at the start
of a line (with optional leading whitespace) is automatically parsed by `ucode_markup`. Plain
code files fall back to `ucode`. See [File-type detection](#file-type-detection) below.

`ucdocs` is not a standalone file grammar — it is automatically injected by the `ucode` and
`ucode_markup` grammars into every `/** */` doc comment block. Tools that load grammars
directly from `tree-sitter.json`, and can parse the manifest, handle this automatically.
**At the time of writing, this repo's own `tree-sitter.json` cannot be parsed by the pinned
tree-sitter CLI** (see the note in [File-type detection](#file-type-detection) below), so
CLI commands run against this repo do not get automatic `ucdocs` injection either. Editor
plugins generally register `ucdocs` and its injection query directly rather than going
through `tree-sitter.json`, so they are unaffected — see the editor sections below.

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
| Removed features | Destructuring, `for...of`, `do-while`, generators, forward declarations, dynamic `import()` | All supported |
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
  `a\n/* note */\n+ b` a single addition, also matching ucode.
- **Unterminated tags and the single-line `// … %}` footgun are flagged, not tolerated.**
  ucode leniently accepts an unterminated `{% … ` at EOF, and (because `//` runs to
  end-of-line) silently swallows a same-line `%}` into the comment; the grammar reports an
  error in both cases so the mistake surfaces in an editor. Put the comment on its own line
  (with `%}` on the next) or use `/* */` to close on the same line.
- **Some constructs ucode rejects only at compile time still parse.** The grammar
  describes ucode's *syntax*; semantic rejections the compiler makes after parsing are
  left to the compiler (and to linters), not enforced here — matching how tree-sitter
  grammars work in general. Known cases: a statement-position or unparenthesized
  arrow-body object literal (`{a: 1};` and `x => {a: 1}`, which ucode treats as a block
  and rejects — write `({a: 1})`); and `break`/`continue` outside a loop or switch. These
  parse as well-formed trees even though `ucode -c` reports a syntax error.

## Doc comment grammar (ucdocs)

`/** */` blocks are parsed by the `ucdocs` grammar and injected into the host parse tree.
The grammar understands the following tags:

| Tag | Syntax |
|-----|--------|
| `@param` | `@param {Type} name description` |
| `@returns` / `@return` | `@returns {Type} description` |
| `@throws` / `@throw` | `@throws {Type} description` |
| `@type` | `@type {Type}` |
| `@typedef` | `@typedef {Type} TypeName` |
| `@template` | `@template T, U` |
| `@function` | `@function module:path#member` |
| `@module` | `@module name` |
| `@deprecated` | `@deprecated description` |
| `@since` | `@since version` |
| `@see` | `@see reference` |
| `@example` | `@example code` |
| `@default` | `@default value` |

Type expressions support: primitives (`int`, `float`, `string`, `boolean`, `null`, `void`,
`function`), `*`/`any`, `list<T>`, `dict<T>`, record types (`{field: T}`), named types
(`TypeName`, `TypeName<T, U>`), cross-module refs (`module:path.To.Type`), named function
types `(name: T) => U`, anonymous function types `function(T): U`, union `T | U`, nullable
`?T`, and array postfix `T[]`. Inline `{@link ...}` tags and optional params `[name=default]`
are also supported.

## Requirements

- [tree-sitter CLI](https://github.com/tree-sitter/tree-sitter) ≥ 0.24
- Node.js ≥ 18 (for the Node.js bindings only)

## Build

```sh
npm install
npm run build        # regenerate all three parsers; compile the Node.js binding (ucode only)
```

To regenerate parsers after editing a grammar file (run from the repo root):

```sh
# ucode grammar
npx tree-sitter generate

# ucode_markup grammar (generated from grammar.js — do not edit markup/grammar.js directly)
node scripts/generate-markup-grammar.js
npx tree-sitter generate markup/grammar.js --output markup/src

# ucdocs grammar (also regenerated by npm run build)
npx tree-sitter generate ucdocs/grammar.js --output ucdocs/src
```

## Test

```sh
npm test             # builds and tests all three grammars (ucode, ucode_markup, ucdocs)
```

To filter by corpus file name (run from the repo root):

```sh
npx tree-sitter test --file-name control_flow.txt
(cd markup && npx tree-sitter test --file-name markup.txt)
(cd ucdocs && npx tree-sitter test --file-name tags.txt)
(cd ucdocs && npx tree-sitter test --file-name types.txt)
```

## File-type detection

Both `ucode` and `ucode_markup` claim the same file extensions. Tools that can parse
`tree-sitter.json` and respect its `content-regex` field automatically route template files
to `ucode_markup` when a tag opener (`{%`, `{{`, or `{#`) appears at the start of a line
(with optional leading whitespace).

**This manifest-driven routing currently does not work when the tree-sitter CLI is pointed
directly at this repo.** `tree-sitter.json`'s `ucdocs` entry deliberately omits the `scope`
field — a required workaround for a tree-sitter 0.26.x bug where giving `ucdocs` a scope
makes bulk `tree-sitter test` runs mis-route between grammars (see CONTRIBUTING.md). That
omission makes the whole manifest fail strict CLI parsing (`Failed to parse tree-sitter.json
-- missing field 'scope'`), so the CLI falls back to a single default grammar entry with no
`content-regex` and no file-type list at all. The workaround is confirmed necessary — adding
the `scope` back fixes routing but reintroduces the mis-route bug — so it stays, and this note
documents the tradeoff rather than the fix.

Until that upstream CLI issue moves, drive template files explicitly instead of relying on
automatic routing: `tree-sitter parse --lib-path ./ucode_markup.so --lang-name ucode_markup
file.ut` (pair `--lang-name` with `--lib-path` — the flag is silently ignored alone). Editors
that manage their own filetype dispatch (Neovim, Helix) already need an explicit rule and are
unaffected — see the editor sections below.

## Use in Neovim

The easiest way to install this grammar in Neovim is with
[tree-sitter-manager.nvim](https://github.com/m00qek/tree-sitter-manager.nvim),
which handles parser registration, filetype detection, and query setup automatically.

## Use in Helix

Add to `~/.config/helix/languages.toml`:

```toml
[[language]]
name          = "ucode"
scope         = "source.uc"
file-types    = [{ glob = "*.uc" }, { glob = "*.ucode" }, { glob = "*.ut" }]
comment-token = "//"
indent        = { tab-width = 2, unit = "  " }
grammar       = "ucode"

[[language]]
name          = "ucode-markup"
scope         = "source.ucode.markup"
file-types    = [{ glob = "*.uc.tmpl" }]
comment-token = "{#"
indent        = { tab-width = 2, unit = "  " }
grammar       = "ucode_markup"

[[grammar]]
name   = "ucode"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "v0.7.0" }

[[grammar]]
name   = "ucode_markup"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "v0.7.0", subpath = "markup" }

[[grammar]]
name   = "ucdocs"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "v0.7.0", subpath = "ucdocs" }
```

Helix does not support content-based filetype detection for shared extensions. For
`.uc` files that are templates, use `:set-language ucode-markup` in command mode,
or configure a file-specific override via a `.helix/languages.toml` in your project.

## Template files

Template files mix raw text with code tags. The `ucode_markup` grammar produces a
`markup` tree; editors use language injection to apply ucode highlighting inside the
code and expression tags.

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

### Nesting alt-syntax blocks

Give each alt-syntax block its own tag pair — this nests to any depth:

```
{% for (x in xs): %}
  {% for (y in ys): %}{{ x }}{{ y }}{% endfor %}
{% endfor %}
```

A statement tag is a slice of ucode's statement stream, so extra statements may
share a tag with an alt-syntax keyword. **Trailing** statements are supported —
after the header colon (`{% if (c): log(c); %}`, already the case for `if`, and
now also `elif`) and after an end keyword (`{% endif; %}`, `{% endfor; print(n); %}`,
etc.). **Leading** statements in the same tag as the keyword
(`{% log(n); if (c): %}`, `{% log(n); endif %}`) are not supported — put them in
their own tag.

ucode also allows a *compact* form that packs several openers into one tag
and their closers into another (`{% for (x in xs): for (y in ys): %} … {% endfor; endfor %}`).
The grammar supports the compact form **only for two nested `for`-in loops**.
Compact triple (or deeper) nesting and compact mixed blocks
(`{% if (c): for (…): %} … {% endfor; endif %}`) parse as errors — use the
one-block-per-tag form above for those instead.

### Brace-bodied blocks spanning tags

ucode's ordinary brace-bodied statements are just as tag-transparent as the
alt-syntax (`:`…`endif`) forms above: a `{` opened in one tag can be closed by
a `}` in a later one, with the markup in between acting as the block's body —
supported for `if`/`else`/`else if`, `for`, `for`-in, `while`, `function`
declarations, and `try`/`catch`:

```
{% if (user) { %}
  Hello, {{ user }}!
{% } else { %}
  Please log in.
{% } %}
```

The same statement-stream rules as the alt-syntax forms apply: **trailing**
statements may share a tag with the brace (`{% if (c) { log(c); %}`,
`{% } log(n); %}`, `{% } else { log(n); %}`), but a **leading** statement in
the same tag as the `if`/`for`/`while`/`function`/`try` keyword itself
(`{% log(n); if (c) { %}`) is not supported, matching the alt-syntax
limitation above. `}` and a following `else`/`else if`/`catch` must share one
tag — splitting them across separate tags (`{% } %}{% else { %}`) is an
error. There is no compact form for brace blocks (unlike the two-nested-
`for`-in compact form above) — nested brace blocks need their own tag pair
each, same as nested alt-syntax blocks. `switch` bodies do not support this —
ucode itself rejects a `case`/`default` label split across tag boundaries.

## License

MIT
