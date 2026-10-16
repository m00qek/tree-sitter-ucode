# How to run the tests

## Everything

```sh
npm test
```

This builds any parser that is out of date into `.build/parsers/` and, for
each of the three grammars, runs the corpus tests, compiles every query file
(the grammar's own and the Helix copies), checks the tags fixtures, and runs
the structural checks. It ends with the highlight and tags assertion tests in
`test/`. `make test` runs the same script.

`node scripts/run-tests.js` accepts:

| Option | Effect |
| --- | --- |
| `--force` | rebuild every parser, even if it is up to date |
| `--build-only` | build the parsers and stop |
| `--update` | rewrite the tags fixtures' `.expected` files with the current output |

## One grammar or one corpus file

```sh
npx tree-sitter test -p ucode
npx tree-sitter test -p ucode_markup
npx tree-sitter test -p ucdocs

npx tree-sitter test -p ucode --file-name control_flow.txt
npx tree-sitter test -p ucode_markup --file-name markup.txt
npx tree-sitter test -p ucdocs --file-name tags.txt
```

The `.txt` extension is required in `--file-name`. These commands build the
parser in the CLI's own cache (`~/.cache/tree-sitter`), not in
`.build/parsers/`. If a run looks wrong after a scanner change, delete the
cached library under `~/.cache/tree-sitter/lib/` and run again.

## The bindings

Each binding test parses a sample per grammar and compiles the shipped
queries.

```sh
make && cmake -S . -B cmake-build && cmake --build cmake-build    # C: build
make test-c                                                          # C: install, link, load, compile queries
cargo test                                                           # Rust
go test -a ./bindings/go/                                            # Go
python -m build && pip install dist/*.whl && python -m unittest discover -s bindings/python/tests
swift test                                                           # Swift (macOS, or the swift Docker image)
npm run test:bindings                                                # Node.js
```

- `make test-c` needs the tree-sitter runtime, 0.25 or newer, through
  pkg-config, or pass `TS_CFLAGS` and `TS_LIBS`.
- Pass `-a` to `go test`: Go's build cache does not notice a regenerated
  `parser.c`, because cgo includes it from outside the package, so without
  `-a` the test can run against a stale parser.
- The Python test imports `tree_sitter`; install `tree-sitter` 0.25 or newer
  in the same environment, or install the wheel with its `core` extra.

## Related

- [Test suites](../reference/test-suites.md) describes what each check
  verifies.
- [Validate against real code](validate-real-code.md) and
  [Check the editor queries](check-editor-queries.md) cover the checks that
  `npm test` does not run.
