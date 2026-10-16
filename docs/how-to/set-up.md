# How to set up a development checkout

You need:

- Node.js 18 or newer;
- a C and C++ compiler (`npm install` compiles the Node.js binding, and the
  scripts compile the parsers);
- the tree-sitter CLI 0.25 or newer, for ABI 15. `npm install` installs the
  pinned version, 0.27.1, as a dev dependency.

Clone the repository and install the dependencies:

```sh
git clone https://github.com/m00qek/tree-sitter-ucode
cd tree-sitter-ucode
npm install
```

Build the three parsers into `.build/parsers/`:

```sh
node scripts/run-tests.js --build-only
```

`npm run build` does more: it regenerates the queries and the parsers from
the grammar sources first, then compiles the Node.js binding and the parsers.
See [Change the grammar](change-grammar.md).

The scripts run the CLI from `node_modules/tree-sitter-cli/` when it is
installed and fall back to a `tree-sitter` on `PATH`. In examples that call
the CLI directly, `npx tree-sitter` runs the pinned one.

## Next

- [Run the tests](run-tests.md)
- [Project layout](../reference/project-layout.md)
