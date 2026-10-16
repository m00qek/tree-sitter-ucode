# How to register the grammars in Neovim

What a Neovim plugin that integrates these grammars has to set up. For a
working example, see
[tree-sitter-manager.nvim](https://github.com/m00qek/tree-sitter-manager.nvim),
which does all of this.

## Parsers and queries

Put the three parser libraries in a `parser/` directory on the runtime path,
named after the languages, and each grammar's queries under
`queries/<language>/`:

| Language | Parser | Queries from |
| --- | --- | --- |
| `ucode` | `parser/ucode.so` | `ucode/queries/` |
| `ucode_markup` | `parser/ucode_markup.so` | `ucode_markup/queries/` |
| `ucdocs` | `parser/ucdocs.so` | `ucdocs/queries/` |

Build the libraries with `node scripts/run-tests.js --build-only` (into
`.build/parsers/`) or `tree-sitter build`. Take parsers and queries from the
same revision; the queries name nodes that older or newer parsers may not
have.

Install `ucdocs` even though no buffer uses it as its file type: the
injection queries hand every `doc_comment` to the language named `ucdocs`.
The injections also name `regex` and `printf`; if those parsers are missing,
Neovim skips the injection and nothing else breaks.

Use the files in `<grammar>/queries/`, not `editors/helix/queries/`: see
[Choose a query set](choose-query-set.md).

## File types

Neovim gives `.uc` files its own `uc` file type and `.ut` files none, so a
plugin has to add detection. Naming the file types after the grammars means
no `vim.treesitter.language.register()` call is needed. The rules below
mirror `tree-sitter.json`: `.ut` is a template; a `.uc` or `.ucode` file is a
template when a line starts with `{%`, `{{` or `{#` after optional
whitespace; an extensionless file whose `#!` line names `ucode` is a script.

```lua
local function ucode_or_markup(_, bufnr)
  for _, line in ipairs(vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)) do
    if line:match('^%s*{[%%{#]') then
      return 'ucode_markup'
    end
  end
  return 'ucode'
end

vim.filetype.add({
  extension = {
    uc = ucode_or_markup,
    ucode = ucode_or_markup,
    ut = 'ucode_markup',
  },
  pattern = {
    ['.*'] = {
      function(_, bufnr)
        local first = vim.api.nvim_buf_get_lines(bufnr, 0, 1, false)[1] or ''
        if first:match('^#!.*%f[%w]ucode%f[%W]') then
          return 'ucode'
        end
      end,
      { priority = -math.huge },
    },
  },
})
```

## Per-buffer setup

Start highlighting and folding, and configure indentation, on the
`FileType` event:

```lua
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'ucode', 'ucode_markup' },
  callback = function(args)
    vim.treesitter.start(args.buf)
    vim.wo.foldmethod = 'expr'
    vim.wo.foldexpr = 'v:lua.vim.treesitter.foldexpr()'
    -- Needs nvim-treesitter (main branch); indents.scm uses its captures and #not-kind-eq?.
    vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    vim.opt_local.indentkeys:append({ '=endif', '=endfor', '=endwhile', '=endfunction', '=elif', '=else' })
  end,
})
```

- **Folds** use `folds.scm` through Neovim's built-in fold expression.
- **Indentation** uses `indents.scm` through nvim-treesitter's `indentexpr`.
  Without nvim-treesitter, leave `indentexpr` alone.
- **`indentkeys`**: Neovim re-indents the current line while typing only for
  the keys in `'indentkeys'`. The indent query dedents a line that starts
  with an alt-syntax end keyword, but unless those keywords are added,
  typing `endif` does not trigger it.
- **Text objects** in `textobjects.scm` follow
  [nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects)
  (`main` branch), which reads them from the `queries/` directories; its key
  maps are the user's configuration.

To check a setup, open a ucode file and run `:Inspect` on a keyword: the
list should show a capture ending in `.ucode` or `.ucode_markup`. On a tag
inside a doc comment it should also show a capture ending in `.ucdocs`.

## Related

- [Set up injections in a host editor](set-up-injections.md), including the
  opt-in HTML injection for template text.
- [Check the editor queries](check-editor-queries.md) runs these queries in
  a headless Neovim with both plugins.
- [Queries and captures](../reference/queries.md)
