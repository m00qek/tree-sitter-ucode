# How to check the editor queries

`npm test` compiles every query file, but it cannot tell whether an indent,
fold or text-object query does the right thing in an editor. Two scripts run
the queries in the real editors. CI runs both (the `neovim` and `helix` jobs).

Run them after changing indents, folds or text objects, and after changing
the scanner or error recovery: node end positions drive indentation.

## Neovim

You need Neovim (CI uses 0.12.5) and checkouts of the `main` branch of
[nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) and
[nvim-treesitter-textobjects](https://github.com/nvim-treesitter/nvim-treesitter-textobjects).
CI pins both to commits; see the `neovim` job in `.github/workflows/ci.yml`.

```sh
node scripts/run-tests.js --build-only
git clone https://github.com/nvim-treesitter/nvim-treesitter /tmp/nvim-treesitter
git clone https://github.com/nvim-treesitter/nvim-treesitter-textobjects /tmp/nvim-treesitter-textobjects
nvim --headless --clean -l scripts/check-nvim-queries.lua /tmp/nvim-treesitter /tmp/nvim-treesitter-textobjects
```

The script loads the parsers from `.build/parsers/` and the queries from
`<grammar>/queries/`, prints `ok` or `FAIL` per case, and exits 1 if any case
fails.

## Helix

You need tmux, a C compiler, and an unpacked Helix release (CI uses 25.07.1,
`helix-25.07.1-x86_64-linux.tar.xz` from the Helix releases page).

```sh
npm run build
scripts/check-helix-indents.sh <helix-release-dir>
```

`<helix-release-dir>` is the directory that holds the `hx` binary and its
`runtime/`. The script runs Helix in a throwaway configuration with grammars
built from this checkout and the queries from `editors/helix/queries/`. For
each case it opens a file, presses `o` on a line, types a character and saves,
then compares the new line's indentation. It exits 1 if any case fails.

Helix silently ignores an `indents.scm` it cannot compile, and `hx --health`
still reports it as found, so this script is the only check for that.
