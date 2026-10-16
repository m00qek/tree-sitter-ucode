# Known deviations from ucode

Where the grammar and the ucode compiler disagree, on purpose.

## Targeted ucode version

The grammar targets the ucode interpreter shipped in OpenWrt 25.12: package
`ucode-2026.01.16~85922056-r1`, commit
[`85922056ef7abeace3cca3ab28bc1ac2d88e31b1`](https://github.com/jow-/ucode/commit/85922056ef7abeace3cca3ab28bc1ac2d88e31b1)
of [jow-/ucode](https://github.com/jow-/ucode). CI validates against the test
suite at that commit. Syntax added to ucode's `master` branch after it is not
supported; see
[Compatibility](compatibility.md#known-upstream-changes-not-yet-supported).

## The grammar accepts more than ucode

### Line breaks end statements

ucode lets you leave out a statement's `;` only before `}`, end of input, a
template tag close, or an alt-syntax keyword (`endif`, `endfor`, `endwhile`,
`endfunction`, `elif`, `else`). The grammar also ends a statement at a line
break, as ECMAScript does:

```js
x = 1
y = 2
```

parses as two statements; ucode rejects it.

- A comment on its own line between two statements does not change this.
- A statement that starts on the closing line of a block comment is still an
  error, as in ucode: `x = 1` followed by `/* c */ y = 2` on the next line.
- A comment does not break an expression that continues on the next line:
  `a⏎// note⏎.b` is one member access, and `a⏎/* note */⏎+ b` one addition,
  as in ucode.
- `export default …;` and `export function f() {};` always need their `;`, as
  in ucode, which rejects the module without it.

The reasons are in [Lenient semicolon insertion](../explanation/asi.md).

### Compile-time rejections parse

The grammar describes ucode's syntax. Checks that ucode's compiler makes
after parsing are left to the compiler and to linters. These parse as
well-formed trees although `ucode -c` reports a syntax error:

| Input | Why ucode rejects it |
| --- | --- |
| `{a: 1};` in statement position | ucode opens a block at `{` and has no labels; write `({a: 1})` |
| `x => {a: 1}` | the arrow body is a block; write `x => ({a: 1})` |
| `break` / `continue` outside a loop or `switch` | context check in the compiler |
| `delete (5)` | `delete` needs a property access (the grammar rejects a bare `delete x`) |
| `a?.b = 1` | an optional chain is not assignable |
| `for (a in b; …)`, `for (a + b; …)`, `for (a.b; …)`, `for (a(); …)` | ucode's `for` initializer accepts only `x`, `x = e`, `x op= e` or `x => e` |

### `a++ / b` is division

ucode's lexer does not clear its "a value is expected next" state after a
postfix `++` or `--`. It then starts a regex at the following `/` and fails
with "Unterminated string". `(a++) / b` is not affected. This is a bug in
ucode, not a syntax rule, so the grammar parses `a++ / b` as the division it
is meant to be.

## Template differences that are not deviations

These match ucode, and are listed because they surprise people:

- An unbraced body that runs into `%}` is empty: `{% if (a) %}text{% %}` is
  `if (a) ;` followed by the text. A later `{% else %}` is an error. Use
  braces or the `:` form when the text is the body.
- `{{` and `}}` are tag delimiters anywhere in template code, outside
  strings, comments, regexes and template-string text: `{% x = {a:{b:1}}; %}`
  is an error; write `{a:{b:1} }`.
- A `//` comment runs to the end of the line and swallows a `%}` on it.
- A file may end inside an open `{%` tag, but not inside `{{` or `{#`.
- Text inside an expression (`{% x = [ %}a{% ] %}`) is an error.
