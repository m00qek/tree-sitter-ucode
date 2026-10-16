# ucode compared with JavaScript

ucode is an ECMAScript subset with OpenWrt-specific extensions. The grammar
started from tree-sitter-javascript; these are the syntax differences it
implements.

| Feature | ucode | JavaScript |
| --- | --- | --- |
| Alternative block syntax | `if/elif/else/endif`, `for/endfor`, `while/endwhile`, `function/endfunction` | not supported |
| Two-variable for-in | `for (k, v in obj)` | one variable only |
| Removed keywords | `var`, `new`, `throw`, `typeof`, `void`, `class`, `instanceof`, `do`, `async`, `await`, `yield` | all supported |
| Removed features | destructuring, `for...of`, `do-while`, generators, labeled statements, `finally` | all supported |
| Added number literals | `0177` (C octal), `0x1.8` (hex float), `0B` / `0O` prefixes | standard only |
| Unsupported number literals | `1_000` (separators), `.5` (leading dot) | supported |
| Added escape sequences | `\e` (ESC), `\a` (BEL), octal `\177` (at most `\377`) | standard only |
| String Unicode escapes | `\uXXXX` only, no `\u{…}`; no `\u` escapes in identifiers | `\uXXXX` and `\u{…}` |
| Identifiers | ASCII letters, digits and `_`; no `$`, no non-ASCII letters | Unicode, `$` |
| Raw newlines in strings | allowed: `'…'` and `"…"` may span line breaks | syntax error |
| Regex flags | `g`, `i`, `s` only | full set |
| Module system | static `import` / `export` only; no `from` on re-exports | full ES modules |
| `try` | requires `catch`; the catch parameter is optional | `catch` or `finally` |
| `const` in a `for` header | not allowed | allowed |
| `?.[` and `?.(` | single tokens: nothing may separate `?.` from `[` or `(` | whitespace allowed |
| Whitespace | space, tab, LF, CR, form feed, vertical tab only | also Unicode spaces and U+2028 / U+2029 |

## Alternative block syntax

```js
if (x == 1): print("one"); elif (x == 2): print("two"); else print("other"); endif

for (let i = 0; i < 3; i++): print(i); endfor
for (k, v in obj): print(k, v); endfor
while (n--): print(n); endwhile

function f(a):
	return a;
endfunction
```

The body of an alt-syntax statement is a `statement_list` node. See
[ucode nodes](nodes-ucode.md).

## For-in

```js
for (x in list) print(x);          // variable: x
for (k, v in obj) print(k, v);     // key: k, value: v
for (let k, v in obj) print(k, v); // kind: let
```

The loop target must be a plain identifier, and only `let` may declare it.

## Not syntax differences

Some things ucode rejects only when it compiles a script, after parsing. The
grammar accepts them; see [Known deviations](deviations.md).
