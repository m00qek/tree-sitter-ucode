# External tokens

Tokens produced by the hand-written scanners instead of the generated lexer.
The design is discussed in [The external scanner](../explanation/scanner.md).

## ucode and ucode_markup

Both code grammars share one external-token list and one scanner,
`common/scanner.h`. `ucode/src/scanner.c` and `ucode_markup/src/scanner.c`
only include it and export the five `tree_sitter_<grammar>_external_scanner_*`
entry points. The markup shim compiles it with `UCODE_SCANNER_TEMPLATE` set
to 1, which enables the template-only behavior.

The order of the `externals` array in `common/define-grammar.js` and of the
`TokenType` enum in `common/scanner.h` must be identical; `npm test` checks
it.

| # | Token | Width | In the tree | Matches |
| --- | --- | --- | --- | --- |
| 0 | `_automatic_semicolon` | zero | hidden | an inserted `;` (see [ASI rules](#automatic-semicolon-insertion)) |
| 1 | `_template_chars` | text | hidden | the literal text of a template string, up to `` ` ``, `${` or `\` |
| 2 | `raw_text` | text | `raw_text` | template text outside tags, up to `{%`, `{{` or `{#` |
| 3 | `statement_tag_open` | text | named | `{%` |
| 4 | `statement_tag_trim_open` | text | named | `{%-` |
| 5 | `statement_tag_lstrip_open` | text | named | `{%+` |
| 6 | `statement_tag_close` | text | named | `%}` |
| 7 | `statement_tag_trim_close` | text | named | `-%}` |
| 8 | `expression_tag_open` | text | named | `{{` |
| 9 | `expression_tag_trim_open` | text | named | `{{-` |
| 10 | `expression_tag_close` | text | named | `}}` |
| 11 | `expression_tag_trim_close` | text | named | `-}}` |
| 12 | `comment_content` | text | named | the body of `{# … #}`, up to `#}` or `-#}` |
| 13 | `comment` | text | named, extra | a `//` line comment or a `/* */` block comment |
| 14 | `_single_quote_string_content` | text | as `string_fragment` | the body of `'…'`, up to `'`, `\` or end of input |
| 15 | `_double_quote_string_content` | text | as `string_fragment` | the body of `"…"`, up to `"`, `\` or end of input |
| 16 | `_regex_content` | text | as `regex_pattern` | the body of `/…/`, up to the closing `/` |
| 17 | `_octal_escape` | text | as `escape_sequence` | `\` and one to three octal digits, value at most 255 |
| 18 | `_asi_gap` | zero | hidden, extra | a no-op before an own-line comment when no `;` is inserted |
| 19 | `_tag_semicolon` | zero | as `empty_statement` | an empty unbraced body before `%}` or `-%}` (templates only) |
| 20 | `_text_end` | zero | hidden | the end of input, closing the root |
| 21 | `_return_marker` | never emitted | | valid only right after `return` |
| 22 | `_block_end` | zero | hidden | the end of input, closing one statement list |
| 23 | `doc_comment` | text | named, extra | a block comment that opens with exactly `/**` (not `/***`, not `/**/`) |
| 24 | `_error_sentinel` | never emitted | | valid only during error recovery |

### Scan order

On each call the scanner tries, in this order, and returns on the first
match:

1. If `_error_sentinel` is valid (error recovery), return no token.
2. `_text_end`, then `_block_end`, at end of input.
3. String and template-string bodies, then `_octal_escape`, then
   `_regex_content`. These come before comments so that `//` or `/*` inside a
   string or regex stays content.
4. `comment_content`, inside `{# … #}`.
5. `raw_text` and the tag openers.
6. `comment` and `doc_comment`, skipping whitespace first. The same step
   decides ASI before an own-line comment and may emit
   `_automatic_semicolon` or `_asi_gap` instead.
7. `_tag_semicolon`.
8. ASI after a line break.
9. The statement-tag and expression-tag closers.
10. ASI on the same line.
11. Templates only: a stray tag delimiter (see below).
12. `_block_end` at end of input, even where it is not valid (see below).

### Tokens emitted where they are not valid

The scanner returns two tokens in states where the parser did not list them
as valid. Both happen only on input that already has an error, and both are
deliberate:

| Token | When |
| --- | --- |
| a tag delimiter (`{%`, `%}`, `{{`, `}}`, any variant) | templates only: a delimiter appears in code where none is valid, such as a half-typed tag (`{% if (co` followed by the next tag) or a tag closed mid-expression (`{{ obj. }}`) |
| `_block_end` | at end of input, after a statement list's own `_block_end` has been shifted, until the root's `_text_end` has been emitted |

The reasons are in
[The external scanner](../explanation/scanner.md#emitting-tokens-the-parser-did-not-ask-for).

### State

The scanner serializes two flags (2 bytes):

| Flag | Meaning |
| --- | --- |
| `skip_asi_before_comment` | the previous call emitted `_asi_gap` before an own-line comment, so this call scans the comment itself |
| `text_end_emitted` | the root's `_text_end` has been emitted; no `_block_end` may follow |

### Automatic semicolon insertion

A `;` is inserted:

- on the same line, before `}`, end of input, `%}` or `-%}`, and in
  templates before `{%` or `{{`;
- after a line break, unless the next line starts with a character that
  continues the expression: `(` `[` `` ` `` `.` `,` `;` `+` `-` `*` `/` `%`
  `=` `<` `>` `!` `~` `&` `|` `^` `?`, or the keyword `in`. A `-` or `%` that
  starts `-%}` or `%}` does not continue it. Comments on their own lines in
  between are skipped for this decision;
- right after `return` followed by a line break, only before `}`, end of
  input, `%}` or `-%}`, in templates `{%` or `{{`, or a keyword that ends a
  statement list (`else`, `elif`, `endif`, `endfor`, `endwhile`,
  `endfunction`, `case`, `default`). Otherwise the next line is the return
  value.

The inserted `;` is zero-width and sits right after the statement's last
token. `export default …;` and `export function f() {};` take no inserted
`;`: the grammar requires a literal one there.

### Whitespace

Only ucode's whitespace is whitespace: space, tab, line feed, carriage return,
form feed and vertical tab. Only line feed and carriage return end a line. The
scanner does not depend on the host's locale.

## ucdocs

`ucdocs/src/scanner.c` has one external token.

| # | Token | Matches |
| --- | --- | --- |
| 0 | `_stars` | a run of `*` in description prose that is not followed by `/` |

A run of stars followed by `/` belongs to the closing `*/`, and the scanner
declines it. The scanner skips line frames (line break, indentation, one `*`)
itself before looking for a run, because it is called before the grammar's
extras are skipped.
