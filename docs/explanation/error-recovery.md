# About error recovery

## The goal

An editor reparses a file on every keystroke, so most of the trees the
grammar produces are of code that is not finished. tree-sitter always
produces a tree; when the input has an error, it wraps part of the input in
an ERROR node or inserts a zero-width MISSING token. Which one, and how
large the ERROR is, decides whether the rest of the file keeps its
highlighting, folds and indentation, and whether the language server still
sees the functions it was tracking.

The grammar aims for errors that stay local: the smallest ERROR, close to
where the problem is, and the rest of the tree unchanged. Several design
choices serve that goal; this page collects them.

## Blocks still being typed

A file that ends inside an open block is the normal state of a file while a
block is being written:

```js
function f() {
  let x = 1;
```

The grammar gives this a `function_declaration` whose `statement_block` ends
in a `MISSING "}"`, instead of an ERROR around the whole function. The same
works for alt-syntax bodies (`MISSING "endif"`) and object literals, in
scripts and templates alike. The mechanism is the repeated zero-width
`_block_end` token described in
[The external scanner](scanner.md#end-of-input-inside-open-blocks).

It does not always succeed in very small files. tree-sitter weighs the cost
of each possible recovery: every MISSING token has a fixed cost, while an
ERROR wrapping the whole file costs more the larger the file is. With two or
more open blocks in a tiny file, one ERROR over everything is cheaper, and
tree-sitter picks it. These costs are constants in the tree-sitter runtime;
a grammar cannot change them.

Measured with a function and nested `if` blocks, all left open at the end of
the file:

| Open blocks | Whole file is one ERROR when the innermost block holds | Structure kept from |
| --- | --- | --- |
| 1 | never | 1 statement |
| 2 | 1–3 statements | 4 statements |
| 3 | 1 statement | 2 statements |
| 4 | 1–3 statements | 4 statements |

Code elsewhere in the file counts too: five complete statements before the
open function are enough for two open blocks to keep their structure. In
practice this happens only while a new file is being started without
auto-paired braces.

The grammar does not try to close blocks itself at the end of the file (for
example, with a zero-width closer from the scanner). That would make
incomplete code parse without errors, so `has_error` would be false and
editors would show nothing. Invalid code always produces ERROR or MISSING
nodes. A tool that needs exact structure for a tiny incomplete file can
append the missing closers and parse again.

## Half-typed tags

In a template, a tag that is half typed or closed too early,

```
<p>{{ obj. }}</p>
<b>{{ y }}</b>
```

produces a small ERROR inside the first `expression_tag`, and the text and
tags after it parse normally. Two mechanisms make this work:

- The scanner emits a tag delimiter even where the parser did not expect one,
  so the error stops at the tag boundary instead of running on until some
  later token fits.
- In a template, a statement ends before a `{%` or `{{` on the same line,
  because a tag inside a tag is always an error in ucode. Recovery then only
  has to supply the missing `%}`.

When a block is typed key by key in a template, the share of the file under
ERROR nodes dropped from 52–61% to 3–7% with these changes (see the
[changelog](../changelog.md)).

## Unterminated strings and regexes

ucode strings may contain raw line breaks, so an opening quote with no
closing one is unterminated only at the end of the file. A token that ran to
the end of input would swallow the rest of the file into one string while
the user types the closing quote. The scanner declines such a string at the
end of input instead, and the parser recovers statement by statement. The
price is that each reparse rescans the open string to the end of the file
(roughly 0.06 ms per KB of the rest of the file).

## Leniency that avoids errors

Some errors are avoided rather than recovered from:

- [Lenient semicolon insertion](asi.md) keeps a missing `;` at a line break
  from becoming an error at all.
- Checks that ucode's compiler makes after parsing, such as `break` outside
  a loop, are left to the compiler (see
  [Known deviations](../reference/deviations.md)).

## Where the grammar is strict anyway

Leniency has a cost: a tree that accepts invalid code tells the user nothing
is wrong. The grammar stays strict where ucode is, and where strictness does
not hurt editing: `export default` and `export function` keep their
mandatory `;`, `{{` inside a statement tag is an error, and so is text
inside an expression. The validators check both directions: ucode's own
invalid testcases must still fail to parse (see
[Validate against real code](../how-to/validate-real-code.md)).
