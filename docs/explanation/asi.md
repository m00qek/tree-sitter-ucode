# About lenient semicolon insertion

## What ucode does

ucode never inserts a `;` at a line break. You may leave a statement's `;`
out only where nothing else could follow: before `}`, at the end of input,
before a template tag close, and before an alt-syntax keyword such as
`endif` or `elif`. So ucode rejects:

```js
x = 1
y = 2
```

## What the grammar does

The grammar also ends a statement at a line break, as ECMAScript's automatic
semicolon insertion does, unless the next line clearly continues the
expression (it starts with an operator, `.`, `(`, `[`, and so on). The
example above is two statements here.

## Why

A tree-sitter grammar spends most of its life in an editor, parsing code
that is half written. Consider adding a line:

```js
let a = 1;
let b = compute()
let c = 3;
```

With ucode's rule, the missing `;` after `compute()` makes the second and
third lines one broken statement. tree-sitter's error recovery then decides
how much of the surrounding code to wrap in an ERROR node, and the
highlighting, folds and indentation of the following lines can flicker as
you type. With the lenient rule, the tree is exactly what the author means,
and the missing `;` is left for ucode, or a linter, to report.

The grammar's job is to give editors and the language server a stable,
accurate structure. Matching ucode's rejection here would make the tree worse
for every keystroke between typing a line and typing its `;`, to catch an
error the compiler reports anyway.

## Where the leniency stops

The leniency is about line breaks only, and it tries not to change the
meaning of valid code:

- **Expressions that continue on the next line stay one expression.** A line
  that starts with `.`, `(`, `+`, `in` and the other continuation tokens
  continues the previous one, as in ucode. Comments on their own lines in
  between do not change that: `a⏎// note⏎.b` is one member access.
- **`return` keeps ucode's reading.** In ucode, `return` followed by a line
  break returns the next line's expression. ECMAScript would end the
  statement at the line break, and an earlier version of this grammar did,
  which changed the meaning of valid ucode. Now a line break after `return`
  ends the statement only before `}`, the end of input, a tag close, or a
  keyword that ends a block.
- **A statement on the closing line of a block comment is still an error**:
  `x = 1` followed by `/* c */ y = 2` on the next line. The comment's end is
  not a line break.
- **Two statements always need their `;`**: `export default …;` and
  `export function f() {};`. Leaving the `;` off is a JavaScript habit that
  ucode rejects when it loads the module, and an editor is the right place
  to catch it. These are written with a literal `;` in the grammar, so the
  scanner's inserted `;` cannot satisfy them.

## Positions

The inserted `;` has zero width and sits right after the statement's last
token. A statement therefore ends at its last character, not after the line
break and blank lines that follow it. Before this was fixed, statements
stretched over the following whitespace; tree shapes were the same, but
editors treated the next line as part of the previous statement's block.

The rules themselves are listed in
[External tokens](../reference/external-tokens.md#automatic-semicolon-insertion).
