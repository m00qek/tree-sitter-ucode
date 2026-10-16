# Grammars and file types

## The three grammars

| Grammar | Directory | Scope | Root node | File types | Injection regex |
| --- | --- | --- | --- | --- | --- |
| `ucode` | `ucode/` | `source.uc` | `program` | `.uc`, `.ucode`; first line `#!…ucode` | `^ucode$` |
| `ucode_markup` | `ucode_markup/` | `source.ucode.markup` | `markup` | `.ut`; `.uc`, `.ucode` by content | `^ucode_markup$` |
| `ucdocs` | `ucdocs/` | `source.ucdocs` | `document` | none (injected) | `^ucdocs$` |

- `ucode` parses scripts.
- `ucode_markup` parses templates: raw text mixed with `{% %}`, `{{ }}` and
  `{# #}` tags. The code inside the tags produces the same nodes as in a
  script.
- `ucdocs` parses the contents of a `/** … */` doc comment. The `ucode` and
  `ucode_markup` injection queries inject it into every `doc_comment` node.

## Requirements

| Item | Minimum |
| --- | --- |
| Parser ABI | 15 |
| tree-sitter runtime (C library, Rust crate, py-tree-sitter, go-tree-sitter, Node.js `tree-sitter`, web-tree-sitter) | 0.25 |
| tree-sitter CLI, to generate or build the parsers | 0.25 (the repository pins 0.27.1) |

## Injection languages

| Host grammar | Content node | Injected language |
| --- | --- | --- |
| `ucode`, `ucode_markup` | `doc_comment` | `ucdocs` |
| `ucode`, `ucode_markup` | `regex_pattern` | `regex` |
| `ucode`, `ucode_markup` | first-argument `string_fragment` of `printf()` / `sprintf()` | `printf` |

`ucdocs` injects nothing. Template `raw_text` is not injected by default; see
[Set up injections](../how-to/set-up-injections.md).

## tree-sitter.json

`tree-sitter.json` at the repository root declares the grammars. Its entries:

| Field | `ucode` | `ucode_markup` | `ucdocs` |
| --- | --- | --- | --- |
| `path` | `ucode` | `ucode_markup` | `ucdocs` |
| `file-types` | `ucode`, `uc` | `ucode`, `uc`, `ut` | |
| `content-regex` | | `(?m)^\s*\{[%{#]` | |
| `first-line-regex` | `^#!.*\bucode\b` | | |
| `external-files` | `common/scanner.h` | `common/scanner.h` | |
| `highlights` | `ucode/queries/highlights.scm` | `ucode_markup/queries/highlights.scm` | `ucdocs/queries/highlights.scm` |
| `locals` | `ucode/queries/locals.scm` | `ucode_markup/queries/locals.scm` | |
| `injections` | `ucode/queries/injections.scm` | `ucode_markup/queries/injections.scm` | |
| `tags` | `ucode/queries/tags.scm` | `ucode_markup/queries/tags.scm` | `ucdocs/queries/tags.scm` |

`folds`, `indents` and `textobjects` are not listed: the manifest schema does
not define them. The files still ship in each `queries/` directory.

`external-files` makes the CLI rebuild its cached parsers when the shared
scanner changes.

## File-type detection

- `.ut` belongs to `ucode_markup` only.
- `.uc` and `.ucode` are claimed by both code grammars. A tool that reads
  `tree-sitter.json` and honors `content-regex` routes such a file to
  `ucode_markup` when a tag opener (`{%`, `{{` or `{#`) starts a line, after
  optional whitespace, and to `ucode` otherwise. `tree-sitter highlight` run
  in this repository does this.
- An extensionless file whose first line is a `#!` naming `ucode` goes to
  `ucode` through `first-line-regex`, in tools that read that field.
- `tree-sitter parse` (CLI 0.27.1) run in this repository does not use these
  rules: it parsed a `.ut` file with the `ucode` grammar, and rejects
  `--scope source.ucode.markup` as an unknown scope. Name the grammar
  explicitly:

    ```sh
    tree-sitter parse --lib-path .build/parsers/ucode_markup.so --lang-name ucode_markup file.ut
    ```

    `--lang-name` is ignored unless `--lib-path` is also given.

- Neovim and Helix do their own file-type detection. See
  [Register in Neovim](../how-to/register-neovim.md#file-types) and
  [Register in Helix](../how-to/register-helix.md#languages-and-grammars).

## Template tags

| Tag | Meaning |
| --- | --- |
| `{% … %}` | run ucode statements, no output |
| `{{ … }}` | evaluate an expression and print it |
| `{# … #}` | template comment, discarded |
| `{%- … -%}` | statement tag, strip whitespace on both sides |
| `{{- … -}}` | expression tag, strip whitespace on both sides |
| `{%+ … %}` | statement tag, suppress `lstrip_blocks` stripping |
| `{#- … -#}` | comment, strip whitespace on both sides |

Opener and closer variants are independent: any opener can pair with any
closer. `{%-`, `{{-` and `{#-` strip the raw text before the tag; `-%}`,
`-}}` and `-#}` strip the raw text after it. `{%+` can be combined with
`-%}`.

The node each delimiter produces is listed in
[ucode_markup nodes](nodes-ucode-markup.md#tag-delimiters).
