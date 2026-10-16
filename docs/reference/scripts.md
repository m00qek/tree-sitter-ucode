# Build files and scripts

## npm scripts

| Script | Runs |
| --- | --- |
| `npm run build` | `generate-markup-queries.js`, `generate-helix-queries.js`, `tree-sitter generate` for the three grammars, `node-gyp-build` (the Node.js binding), then `run-tests.js --build-only` |
| `npm test` | `node scripts/run-tests.js` |
| `npm run test:bindings` | `node --test bindings/node/binding_test.js` |
| `npm start` | builds `ucode/tree-sitter-ucode.wasm` (`prestart`), then `tree-sitter playground --grammar-path ucode` |
| `install` | `node-gyp-build` (runs on `npm install`) |

## Makefile targets

`make` builds one static and one shared library per grammar, plus a
pkg-config file. The grammar names in target names are `ucode`,
`ucode-markup` and `ucdocs`. The Makefile does not regenerate the parsers.

| Target | Does |
| --- | --- |
| `all` (default) | build `libtree-sitter-<g>.a`, the shared `libtree-sitter-<g>.so` (`.dylib` on macOS, `.dll` on Windows) and `tree-sitter-<g>.pc` for every grammar |
| `install`, `install-<g>` | install the libraries, header, pkg-config file and `queries/*.scm` under `PREFIX` |
| `uninstall`, `uninstall-<g>` | remove what `install` installed |
| `clean`, `clean-<g>` | remove the build output |
| `test` | `node scripts/run-tests.js` |
| `test-c` | install into `.build/c-test`, build `bindings/c/test.c` against the installed headers, pkg-config files and shared libraries, parse a sample per grammar and compile every installed query |

| Variable | Default |
| --- | --- |
| `PREFIX` | `/usr/local` |
| `DATADIR`, `INCLUDEDIR`, `LIBDIR`, `BINDIR`, `PCLIBDIR` | under `PREFIX` |
| `TS_CFLAGS`, `TS_LIBS` (for `test-c`) | `pkg-config --cflags` / `--libs tree-sitter` |

## CMake

`CMakeLists.txt` defines the targets `tree-sitter-ucode`,
`tree-sitter-ucode-markup` and `tree-sitter-ucdocs`, with install rules for
the libraries, headers, pkg-config files and queries. Options:
`BUILD_SHARED_LIBS` (on), `TREE_SITTER_REUSE_ALLOCATOR` (off),
`TREE_SITTER_ABI_VERSION` (15). When it is the top-level project it also
defines `ts-test`, which runs `node scripts/run-tests.js`.

## scripts/

### run-tests.js

```sh
node scripts/run-tests.js [--force] [--build-only] [--update]
```

Builds each grammar into `.build/parsers/` when the library is missing or
older than its C sources (for the code grammars, including
`common/scanner.h`), then for each grammar: runs `tree-sitter test`,
compiles every query file in `<grammar>/queries/` and
`editors/helix/queries/<language>/`, checks the tags fixtures in
`<grammar>/test/tag-docs/`, and runs the checks in `checks.js`. Finally runs
`tree-sitter test` at the root for the assertion tests. Exits 1 if anything
fails.

| Option | Effect |
| --- | --- |
| `--force` | rebuild every parser |
| `--build-only` | build and stop |
| `--update` | write the tags fixtures' current output to their `.expected` files |

### checks.js

The structural checks run by `run-tests.js`. See
[Test suites](test-suites.md#structural-checks).

### validate-corpus.js

```sh
node scripts/validate-corpus.js corpus <path/to/ucode/tests/custom>
node scripts/validate-corpus.js project <path/to/project>
```

- `corpus` extracts each testcase of ucode's own test suite and parses it.
- `project` parses every `.uc`, `.uc.tmpl` and `.ut` file under a directory.
  `.ut` files are parsed as templates; the others are templates when they
  contain a tag opener at the start of a line.

Any ERROR or MISSING node is a failure. Two lists in the script are checked
the same way, and each listed testcase must still fail to parse:

| List | Holds |
| --- | --- |
| `EXPECTED_INVALID` | testcases that ucode itself rejects |
| `KNOWN_GRAMMAR_GAPS` | valid ucode the grammar does not parse yet (currently empty) |

Keys have the form `<relative/path>#<testcase-index>`, 1-based, with forward
slashes, for example `00_syntax/16_for_loop#3`. A listed key that parses
clean or names no testcase fails the run.

Exit codes: 0 when everything passes, 1 on failures, 2 on a setup error
(missing CLI or parser, or no files found).

### validate-docs.js

```sh
node scripts/validate-docs.js <dir>...
```

Extracts every `/** … */` block from the `.c`, `.h` and `.uc` files directly
in each directory (not recursively) and parses it with `ucdocs`.
`KNOWN_INVALID` lists comments that are malformed upstream, matched by file
name and a snippet. Exit codes: 0, 1 on failures, 2 on a setup error.

### generate-markup-queries.js

Writes `ucode_markup/queries/*.scm` from `ucode/queries/*.scm`: rewrites
`(program)` to `(markup)` and adds the template-only highlight and tags
patterns.

### generate-helix-queries.js

Writes `editors/helix/queries/{ucode,ucode-markup,ucdocs}/`: renames
highlight captures to Helix scopes, turns `local.kind` into Helix's
`@local.definition.<scope>`, copies injections and tags, and writes the
Helix text objects and indents, which it defines itself. Fails if a capture
has no Helix equivalent.

### check-nvim-queries.lua

```sh
nvim --headless --clean -l scripts/check-nvim-queries.lua <nvim-treesitter> <nvim-treesitter-textobjects>
```

Checks the Neovim indents, folds and text objects with the two plugins.
Exits 1 on a failure, 2 on a usage or setup error.

### check-helix-indents.sh

```sh
scripts/check-helix-indents.sh <helix-release-dir>
```

Types into a real Helix in tmux and checks each new line's indentation.
Needs tmux and a C compiler. Exits 1 on a failure, 2 if tmux is missing.

### parsers.js, tree-sitter-cli.js

Helpers. `parsers.js` gives the path of each built parser
(`.build/parsers/<name>.so`, `.dll` on Windows). `tree-sitter-cli.js` gives
the CLI to run: `node_modules/tree-sitter-cli/tree-sitter` when installed,
otherwise `tree-sitter` on `PATH`.
