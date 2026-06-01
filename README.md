# tree-sitter-ucode

Tree-sitter grammar for [ucode](https://github.com/jow-/ucode), the ECMAScript-like scripting language used in OpenWrt.

Two grammars are provided:

| Grammar | Scope | File types |
|---------|-------|------------|
| `ucode` | `source.uc` | `.uc` |
| `ucode_tmpl` | `source.uc.tmpl` | `.uc.tmpl`, `.utpl` |

## Ucode vs JavaScript

Ucode is an ECMAScript subset with OpenWrt-specific extensions. Key differences:

| Feature | Ucode | JavaScript |
|---------|-------|------------|
| Alternative block syntax | `if/elif/else/endif`, `for/endfor`, `while/endwhile`, `function/endfunction` | Not supported |
| Two-variable for-in | `for (k, v in obj)` | Single variable only |
| Removed keywords | `var`, `new`, `typeof`, `void`, `class`, `instanceof`, `do`, `async`, `await`, `yield` | All supported |
| Removed features | Destructuring, `for...of`, `do-while`, generators, forward declarations, dynamic `import()` | All supported |
| Added number literals | `0177` (C octal), `0x1.8` (hex float), `0B`/`0O` prefixes | Standard only |
| Added escape sequences | `\e` (ESC), `\a` (BEL), octal `\177` | Standard only |
| Regex flags | `g`, `i`, `s` only | Full set |
| Module system | Static `import`/`export` only; no `from` on re-exports | Full ES modules |

## Requirements

- [tree-sitter CLI](https://github.com/tree-sitter/tree-sitter) ≥ 0.24
- Node.js ≥ 18 (for the Node.js bindings only)

## Build

```sh
npm install
npm run build        # generate + compile Node.js bindings
```

To regenerate parsers after editing a grammar file:

```sh
# ucode grammar
npx tree-sitter generate

# ucode_tmpl grammar
npx tree-sitter generate tmpl/grammar.js --output tmpl/src
```

## Test

```sh
npm test             # runs tree-sitter test for ucode and ucode_tmpl
```

To filter by corpus file name:

```sh
npx tree-sitter test --file-name control_flow
npx tree-sitter test -p tmpl --file-name template
```

## Use in Neovim (nvim-treesitter)

Add to your nvim-treesitter config (e.g. `~/.config/nvim/lua/plugins/treesitter.lua`):

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.ucode = {
  install_info = {
    url = "https://github.com/m00qek/tree-sitter-ucode",
    files = { "src/parser.c", "src/scanner.c" },
    branch = "main",
  },
  filetype = "ucode",
}

parser_config.ucode_tmpl = {
  install_info = {
    url = "https://github.com/m00qek/tree-sitter-ucode",
    files = { "tmpl/src/parser.c", "tmpl/src/scanner.c" },
    branch = "main",
  },
  filetype = "ucode_tmpl",
}
```

Associate `.uc` and `.uc.tmpl` files with the right filetypes:

```lua
vim.filetype.add({
  extension = {
    uc   = "ucode",
    utpl = "ucode_tmpl",
  },
  pattern = { [".*%.uc%.tmpl"] = "ucode_tmpl" },
})
```

## Use in Helix

Add to `~/.config/helix/languages.toml`:

```toml
[[language]]
name        = "ucode"
scope       = "source.uc"
file-types  = ["uc"]
comment-token = "//"
indent      = { tab-width = 2, unit = "  " }
grammar     = "ucode"

[[language]]
name        = "ucode-tmpl"
scope       = "source.uc.tmpl"
file-types  = ["uc.tmpl", "utpl"]
grammar     = "ucode_tmpl"

[[grammar]]
name   = "ucode"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "main" }

[[grammar]]
name   = "ucode_tmpl"
source = { git = "https://github.com/m00qek/tree-sitter-ucode", rev = "main", subpath = "tmpl" }
```

## Template files (.uc.tmpl / .utpl)

Template files mix raw text with code tags. The `ucode_tmpl` grammar produces
a document tree; editors use language injection to apply ucode highlighting
inside the code and expression tags.

| Tag | Purpose |
|-----|---------|
| `{% ... %}` | Execute ucode statements (no output) |
| `{{ ... }}` | Evaluate expression and emit output |
| `{# ... #}` | Template comment (discarded) |
| `{%- ... -%}` | Statement block — strip whitespace on both sides |
| `{{- ... -}}` | Expression block — strip whitespace on both sides |
| `{%+ ... %}` | Statement block — suppress `lstrip_blocks` stripping |
| `{#- ... -#}` | Comment — strip whitespace on both sides |

Opener and closer markers are independent: any opener variant may be combined with any closer variant. `{%-` / `{{-` / `{#-` strip the preceding raw text; `-%}` / `-}}` / `-#}` strip the following raw text. `{%+` suppresses `lstrip_blocks` stripping and may be combined with `-%}` (e.g. `{%+ ... -%}`).

Example:

```
Hello, {{ name }}!
{% for (let i in items): %}
  - {{ items[i] }}
{% endfor %}
```

## License

MIT
