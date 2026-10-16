# How to change the grammar

## Edit the right file

| To change | Edit | Do not edit |
| --- | --- | --- |
| syntax of scripts or templates | `common/define-grammar.js` | `ucode/grammar.js`, `ucode_markup/grammar.js` (one-line entry points) |
| the external scanner of the code grammars | `common/scanner.h` | `ucode/src/scanner.c`, `ucode_markup/src/scanner.c` (shims) |
| doc-comment syntax | `ucdocs/grammar.js` | |
| the ucdocs scanner | `ucdocs/src/scanner.c` | |

Everything else under `<grammar>/src/` is generated. Both code grammars are
built from `common/define-grammar.js`; they differ only in the start rule and
in the template-only `text_statement` rule (see
[Architecture](../explanation/architecture.md)).

## Regenerate

After editing `common/define-grammar.js`, regenerate both code parsers:

```sh
npx tree-sitter generate ucode/grammar.js --output ucode/src
npx tree-sitter generate ucode_markup/grammar.js --output ucode_markup/src
```

After editing `ucdocs/grammar.js`:

```sh
npx tree-sitter generate ucdocs/grammar.js --output ucdocs/src
```

Or regenerate everything in one step, including the generated queries and
the built parsers:

```sh
npm run build
```

`tree-sitter generate` does not touch the scanners. A scanner change needs
only a rebuild: `node scripts/run-tests.js` rebuilds a parser whose sources,
including `common/scanner.h`, are newer than its library.

## Keep the scanner in step

If you add, remove or reorder an entry in the grammar's `externals`, make the
same change to the `TokenType` enum in the scanner. The order must match;
`npm test` checks it. See [External tokens](../reference/external-tokens.md).

## Commit the generated files

Commit the regenerated files under `ucode/src/`, `ucode_markup/src/`,
`ucdocs/src/`, `ucode_markup/queries/` and `editors/helix/queries/` together
with your change. CI regenerates them and fails if they differ.

## Then

- [Add a corpus test](add-corpus-test.md) for every new syntactic feature or
  deliberate removal.
- [Run the tests](run-tests.md).
- If the change touches the scanner or error recovery,
  [check the editor queries](check-editor-queries.md): node end positions
  drive indentation.
