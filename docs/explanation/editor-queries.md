# About the editor queries in this repository

## Why they live here

Tree-sitter grammars usually ship highlights, injections, locals and tags,
and leave the editor-specific queries (indents, folds, text objects, and
Neovim's or Helix's flavor of highlights) to the editors' own repositories,
such as nvim-treesitter or Helix's runtime.

This repository ships them itself, for three reasons:

- **The trees change.** The grammar is before 1.0 and node names and fields
  still change (see the [changelog](../changelog.md)). A query in another
  repository breaks silently when a node it names disappears. Here, every
  query is compiled against the grammar on every test run, and CI runs the
  indent, fold and text-object queries in real Neovim and Helix.
- **Indentation depends on the scanner.** Editors indent by node positions,
  and those come from scanner decisions such as where an inserted `;` ends a
  statement. A change to the scanner can break indentation without changing
  any tree shape, so the indent queries are tested with the scanner they
  depend on.
- **Templates are unusual.** The statement-stream model (see
  [Templates](templates.md)) means indentation and folding must follow
  blocks across tags. Generic queries written for other template languages
  do not apply.

## One source, several outputs

The Neovim capture names are the source of truth: they are the most widely
used convention, and tree-sitter-highlight accepts them. From
`ucode/queries/`:

- `ucode_markup/queries/` is generated. Every code query applies to
  templates unchanged, because a template's tree is a script's tree plus
  `text_statement` and tag nodes. The generator only renames the root
  (`program` to `markup`) and adds the few template-only highlight and tags
  patterns. Neovim and Helix understand `; inherits: ucode`, but
  `tree-sitter.json` consumers and the CLI need one self-contained file per
  grammar, so the files are concatenated instead.
- `editors/helix/queries/` is generated too. Highlights and locals are
  renamed to Helix's names, and injections and tags are copied. Helix's text
  objects and indents follow a different model that does not translate
  mechanically, so they are written by hand inside the generator, adapted
  from Helix's own ECMAScript and C queries.

The generator refuses a highlight capture it cannot map to a Helix scope, so
a new capture cannot silently go unstyled in Helix.

## Locals and the plain capture name

`locals.scm` uses only the plain `@local.definition` capture and records the
kind of definition (`function`, `var`, `parameter`, `import`) as metadata.
Kind-specific names like `@local.definition.function` made `tree-sitter
tags` fail outright and were ignored by tree-sitter-highlight. Helix wants
the kind in the capture name, so its copy is generated with
`@local.definition.<scope>` names from that metadata.

## What is left to the integration

Two things the queries cannot do on their own:

- Neovim re-indents a line while typing only for the keys in
  `'indentkeys'`, which is editor configuration, not a query. An integration
  has to add the alt-syntax end keywords; see
  [Register in Neovim](../how-to/register-neovim.md#per-buffer-setup).
- Template text is not injected with any language, because what a template
  produces varies: HTML in LuCI, nftables rules in firewall4. An integration
  that knows its templates can opt in; see
  [Set up injections](../how-to/set-up-injections.md#template-text-opt-in).
