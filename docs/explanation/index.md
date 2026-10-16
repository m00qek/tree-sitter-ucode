# Explanation

Background and reasoning: why the grammars are built the way they are. These
pages are for reading away from the keyboard; the facts they rely on are in
the [reference](../reference/index.md).

## For integrators

- [The public API and stability](public-api.md): which parts of the grammars
  you can rely on across versions.
- [The targeted ucode version](targeted-version.md): why the grammar follows
  one OpenWrt release instead of ucode's `master`.
- [Error recovery](error-recovery.md): what the grammar does with code that
  is still being typed.

## Design

Mostly for contributors.

- [Architecture](architecture.md): one definition, three grammars.
- [Templates as a statement stream](templates.md): why templates are not
  parsed with injections.
- [The external scanner](scanner.md): what the hand-written lexer does, its
  zero-width tokens, and why it sometimes emits tokens the parser did not ask
  for.
- [Lenient semicolon insertion](asi.md): why a line break ends a statement
  here but not in ucode.
- [Doc comments and ucdocs](doc-comments.md): a separate grammar for
  `/** */`.
- [Editor queries in this repository](editor-queries.md): why Neovim and
  Helix queries live here.
