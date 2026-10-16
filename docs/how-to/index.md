# How-to guides

Directions for specific tasks, grouped by audience. They assume you know
tree-sitter; if you do not, start with the [tutorials](../tutorials/index.md).

## Integrating

For people building an editor integration, a language server, a linter or
another tool on the grammars.

- [Register the grammars in Neovim](register-neovim.md)
- [Register the grammars in Helix](register-helix.md)
- [Use a binding](use-bindings.md) (Node.js, C, Rust, Python, Go, Swift)
- [Build and load the WASM parsers](use-wasm.md)
- [Set up injections in a host editor](set-up-injections.md)
- [Handle ERROR and MISSING nodes](handle-errors.md)
- [Choose a query set](choose-query-set.md)

## Contributing

For people changing this repository.

- [Set up a development checkout](set-up.md)
- [Change the grammar](change-grammar.md)
- [Change a query](change-queries.md)
- [Add a corpus test](add-corpus-test.md)
- [Run the tests](run-tests.md)
- [Validate against real code](validate-real-code.md)
- [Check the editor queries](check-editor-queries.md)
- [Retarget a newer ucode release](retarget-ucode.md)
- [Prepare a pull request](prepare-pull-request.md)

## Maintaining

- [Bump the version](bump-version.md)
- [Cut a release](cut-release.md)
- [Update a pinned GitHub Action](update-actions.md)
- [Build and publish this site](publish-docs.md)
