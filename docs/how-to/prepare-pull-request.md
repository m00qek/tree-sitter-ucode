# How to prepare a pull request

Before you open a pull request, check that:

- the grammar regenerates cleanly (`npm run build`, or the per-grammar
  `tree-sitter generate` commands in [Change the grammar](change-grammar.md));
- all tests pass (`npm test`);
- new syntax has at least one corpus test;
- a removed or unsupported JavaScript feature has a test in
  `ucode/test/corpus/js_differences.txt` that documents how it parses;
- the generated files are committed: `ucode/src/`, `ucode_markup/src/`,
  `ucdocs/src/`, `ucode_markup/queries/` and `editors/helix/queries/`;
- a user-visible change has an entry under "Unreleased" in
  [`docs/changelog.md`](../changelog.md).

If the change touches indents, folds, text objects, the scanner or error
recovery, also [check the editor queries](check-editor-queries.md).

CI runs on pull requests to `main` that touch the grammars, queries,
bindings, build files, scripts or workflows. See
[CI workflows](../reference/ci.md).
