# How to register the grammars in Helix

What a Helix setup for these grammars has to declare: three languages, three
grammars, and the Helix query set. The repository's own `queries/`
directories use Neovim's capture names and do not work in Helix; the Helix
set is in `editors/helix/queries/` (see
[Choose a query set](choose-query-set.md)).

Use the same revision of this repository for the grammars and the queries.
The layout below (`ucode/`, `ucode_markup/`, `ucdocs/` and `editors/helix/`)
is newer than v0.8.0. The examples pin commit
`cb05bb84e761ec63cadbd02c98e1c07995e0ec6b`; replace it everywhere if you pin
another revision.

## Languages and grammars

```toml
[[language]]
name                 = "ucode"
scope                = "source.uc"
file-types           = [{ glob = "*.uc" }, { glob = "*.ucode" }]
shebangs             = ["ucode"]
comment-tokens       = "//"
block-comment-tokens = { start = "/*", end = "*/" }
indent               = { tab-width = 2, unit = "  " }
grammar              = "ucode"

[[language]]
name                 = "ucode-markup"
scope                = "source.ucode.markup"
file-types           = [{ glob = "*.ut" }]
block-comment-tokens = { start = "{#", end = "#}" }
indent               = { tab-width = 2, unit = "  " }
grammar              = "ucode_markup"

# Doc comments; injected, never opened directly (Helix declares its jsdoc the same way).
[[language]]
name            = "ucdocs"
scope           = "source.ucdocs"
injection-regex = "^ucdocs$"
file-types      = ["ucdocs"]
grammar         = "ucdocs"

[[grammar]]
name   = "ucode"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucode" }

[[grammar]]
name   = "ucode_markup"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucode_markup" }

[[grammar]]
name   = "ucdocs"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "cb05bb84e761ec63cadbd02c98e1c07995e0ec6b", subpath = "ucdocs" }
```

- The Helix language for templates is `ucode-markup`, with a hyphen; its
  grammar is `ucode_markup`. The query directories follow the language names.
- `ucdocs` must have `injection-regex = "^ucdocs$"`: the injection queries
  name the language `ucdocs`.
- Helix cannot choose a language by file content when two languages share an
  extension, so this setup opens every `.uc` file as a script. A `.uc`
  template needs `:set-language ucode-markup` or a per-project
  `.helix/languages.toml` override.

In a personal setup this goes in `~/.config/helix/languages.toml`; build the
grammars with `hx --grammar fetch && hx --grammar build`.

## Queries

Helix finds queries by language name under its runtime directory. Copy
`editors/helix/queries/*` from the same revision:

```sh
git clone https://github.com/m00qek/tree-sitter-ucode /tmp/tree-sitter-ucode
git -C /tmp/tree-sitter-ucode checkout cb05bb84e761ec63cadbd02c98e1c07995e0ec6b
mkdir -p ~/.config/helix/runtime/queries
cp -r /tmp/tree-sitter-ucode/editors/helix/queries/* ~/.config/helix/runtime/queries/
```

`editors/helix/queries/` has `highlights`, `injections`, `locals`, `tags`,
`indents` and `textobjects` for `ucode` and `ucode-markup`, and `highlights`
and `tags` for `ucdocs`.

## Check

```sh
hx --health ucode
hx --health ucode-markup
hx --health ucdocs
```

`hx --health` lists a query file as found even when Helix fails to compile
it; Helix then ignores that file silently. The repository checks the indent
queries in a real Helix 25.07.1 (see
[Check the editor queries](check-editor-queries.md)).
