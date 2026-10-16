# Test suites

All of these run in `npm test` except the editor checks, the real-code
validators and the binding tests. See [Run the tests](../how-to/run-tests.md).

## Corpus tests

`<grammar>/test/corpus/*.txt`, run with `tree-sitter test`.

| File | Tests |
| --- | --- |
| `ucode/test/corpus/control_flow.txt` | `if` and loops, in brace and alt syntax |
| `ucode/test/corpus/crlf.txt` | CRLF line endings |
| `ucode/test/corpus/expressions.txt` | expressions |
| `ucode/test/corpus/functions.txt` | functions and arrow functions |
| `ucode/test/corpus/js_differences.txt` | JavaScript features ucode removes or changes, ASI, and documented divergences |
| `ucode/test/corpus/literals.txt` | numbers, strings, regexes, template strings |
| `ucode/test/corpus/modules.txt` | `import` and `export` |
| `ucode/test/corpus/statements.txt` | declarations and other statements, `switch`, `try`, end-of-input recovery |
| `ucode_markup/test/corpus/markup.txt` | templates |
| `ucode_markup/test/corpus/crlf.txt` | CRLF line endings in templates |
| `ucdocs/test/corpus/tags.txt` | block and inline tags, prose |
| `ucdocs/test/corpus/types.txt` | type expressions |

### Format

```
================================================================================
<test name>
================================================================================

<input>

--------------------------------------------------------------------------------

<expected tree, without positions>
```

A test whose title block contains `:error` on its own line asserts only that
the input has a parse error; its expected tree is empty.

## Query compilation

Every `.scm` file in `<grammar>/queries/` and in
`editors/helix/queries/<language>/` is compiled against its grammar with
`tree-sitter query`. A reference to a node type or field that does not exist
fails the run.

## Tags fixtures

`ucode_markup/test/tag-docs/<case>.ut` with `<case>.ut.expected`.
`run-tests.js` runs `tags.scm` with `tree-sitter query`, keeps one match per
name the way tree-sitter-tags does (the lowest pattern index wins), and
compares lines of the form `row:col name <- first line of doc` (or
`(no doc)`) with the `.expected` file. `--update` rewrites the `.expected`
files.

## Structural checks

In `scripts/checks.js`. They catch what corpus tests cannot see, because
corpus tests compare tree shapes only.

| Check | Fails when |
| --- | --- |
| external tokens | a scanner's `TokenType` enum does not list the grammar's external tokens in the same order |
| positions | a name-like node in a corpus input starts or ends with whitespace, or a named node other than the root ends with whitespace |
| highlights | a token of a corpus input is not covered by a capture in `highlights.scm`, outside the exceptions below; checked for both the grammar's own and the Helix highlights |

Deliberately unhighlighted (`UNHIGHLIGHTED` in `checks.js`):

| Grammar | Token |
| --- | --- |
| `ucode_markup` | `raw_text` |
| `ucdocs` | `/**` |

## Assertion tests

`test/highlight/` and `test/tags/`, run by `tree-sitter test` from the
repository root, where each file reaches its grammar through
`tree-sitter.json` and is checked by tree-sitter-highlight and
tree-sitter-tags themselves (including injections, locals and `#strip!`).

| File | Grammar |
| --- | --- |
| `test/highlight/script.uc` | `ucode` |
| `test/highlight/template.ut` | `ucode_markup` |
| `test/tags/script.uc` | `ucode` |

An assertion is a comment under a line. A caret asserts the capture of the
token above it:

```js
let r = /ab+/g;
//      ^ string.regexp
```

`// <- name` asserts the token at the comment's own column. In templates `//`
is raw text, so assertions are `{# ^ name #}` comments with the caret under
the token.

The root run warns that there is no `test/corpus` at the root; that is
expected.

## Binding tests

| Binding | Test | Does |
| --- | --- | --- |
| C | `bindings/c/test.c` (`make test-c`) | parse a sample per grammar, compile every installed query |
| Rust | `bindings/rust/lib.rs` (`cargo test`) | parse a sample per grammar, compile the bundled queries |
| Go | `bindings/go/binding_test.go` | parse a sample per grammar, compile `<grammar>/queries/*.scm` |
| Python | `bindings/python/tests/test_binding.py` | parse a sample per grammar, compile the packaged queries |
| Swift | `bindings/swift/TreeSitterUcodeTests/` | parse a sample per grammar, load the bundled queries |
| Node.js | `bindings/node/binding_test.js` | parse a sample per grammar, compile `<grammar>/queries/*.scm` after removing `#strip!`, `#select-adjacent!` and `#kind-eq?` / `#not-kind-eq?`, which the runtime rejects |

## Fuzzing

The `Fuzz` workflow runs tree-sitter's fuzzer on each grammar's scanner. See
[CI workflows](ci.md#fuzz).
