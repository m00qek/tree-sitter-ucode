# tree-sitter-ucode

Tree-sitter grammars for [ucode](https://github.com/jow-/ucode), the
ECMAScript-like scripting language used in OpenWrt.

| Grammar | Parses | Root node |
| --- | --- | --- |
| `ucode` | ucode scripts (`.uc`, `.ucode`, `#!` scripts naming `ucode`) | `program` |
| `ucode_markup` | ucode templates (`.ut`, and `.uc` / `.ucode` files that contain template tags) | `markup` |
| `ucdocs` | the contents of `/** … */` doc comments, injected by the other two | `document` |

The grammars target the ucode shipped in OpenWrt 25.12. They come with
highlights, injections, locals and tags queries, Neovim folds, indents and
text objects, a Helix query set, and bindings for C, Rust, Go, Python, Swift
and Node.js. The parsers use tree-sitter ABI 15 and need a runtime of version
0.25 or newer.

## Build on the grammars

For people writing an editor integration, a language server, a linter or
another tool.

1. Tutorial: [Build on the grammars](tutorials/build-on-the-grammars.md).
2. Register the grammars: [Neovim](how-to/register-neovim.md),
   [Helix](how-to/register-helix.md), [a binding](how-to/use-bindings.md),
   [WASM](how-to/use-wasm.md).
3. Get the details right: [injections](how-to/set-up-injections.md),
   [ERROR and MISSING nodes](how-to/handle-errors.md),
   [which query set](how-to/choose-query-set.md).
4. Look things up: [grammars and file types](reference/grammars.md),
   [ucode nodes](reference/nodes-ucode.md),
   [template nodes](reference/nodes-ucode-markup.md),
   [ucdocs nodes](reference/nodes-ucdocs.md),
   [queries and captures](reference/queries.md),
   [bindings](reference/bindings.md),
   [compatibility](reference/compatibility.md).
5. Know what you can rely on: [the public API](explanation/public-api.md).

## Contribute

For people changing this repository.

1. Tutorial: [Make your first grammar change](tutorials/first-grammar-change.md).
2. Day to day: [set up](how-to/set-up.md),
   [change the grammar](how-to/change-grammar.md),
   [change a query](how-to/change-queries.md),
   [add a corpus test](how-to/add-corpus-test.md),
   [run the tests](how-to/run-tests.md),
   [prepare a pull request](how-to/prepare-pull-request.md).
3. Look things up: [project layout](reference/project-layout.md),
   [scripts](reference/scripts.md), [test suites](reference/test-suites.md),
   [external tokens](reference/external-tokens.md),
   [known deviations](reference/deviations.md).
4. Understand the design: [architecture](explanation/architecture.md),
   [templates](explanation/templates.md),
   [the external scanner](explanation/scanner.md),
   [error recovery](explanation/error-recovery.md).

Maintainers: [bump the version](how-to/bump-version.md),
[cut a release](how-to/cut-release.md).

## Links

- Source: <https://github.com/m00qek/tree-sitter-ucode>
- npm package: [`tree-sitter-ucode`](https://www.npmjs.com/package/tree-sitter-ucode)
- Release history: [Changelog](changelog.md)

## License

MIT. See [LICENSE](https://github.com/m00qek/tree-sitter-ucode/blob/main/LICENSE).
