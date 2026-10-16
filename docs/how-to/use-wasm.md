# How to build and load the WASM parsers

For web-tree-sitter: browser-based editors, VS Code extensions, or any
JavaScript host without native addons.

## Get the `.wasm` files

The npm package includes `tree-sitter-ucode.wasm`, `tree-sitter-ucode_markup.wasm`
and `tree-sitter-ucdocs.wasm` at its root; CI builds them for every release.
To build them from a checkout of the repository:

```sh
npx tree-sitter build --wasm ucode
npx tree-sitter build --wasm ucode_markup
npx tree-sitter build --wasm ucdocs
```

Each command writes `tree-sitter-<grammar>.wasm` to the current directory.
The CLI downloads the WebAssembly toolchain it needs into
`~/.cache/tree-sitter/` on first use.

`npm start` builds `ucode/tree-sitter-ucode.wasm` and opens the tree-sitter
playground on it.

## Load them

The parsers use ABI 15, so you need web-tree-sitter 0.25 or newer. These
files load with web-tree-sitter 0.25.10 and 0.27.1:

```js
import { Parser, Language } from 'web-tree-sitter';

await Parser.init();
const ucode = await Language.load('tree-sitter-ucode.wasm');
const markup = await Language.load('tree-sitter-ucode_markup.wasm');
const ucdocs = await Language.load('tree-sitter-ucdocs.wasm');

const parser = new Parser();
parser.setLanguage(ucode);
console.log(parser.parse('let x = 1;\n').rootNode.toString());
parser.setLanguage(markup);
console.log(parser.parse('{% if (a) { %}hi {{ b }}{% } %}\n').rootNode.toString());
parser.setLanguage(ucdocs);
console.log(parser.parse('/** @param {int} n */').rootNode.toString());
```

Run with Node.js, this prints:

```
(program (lexical_declaration (variable_declarator name: (identifier) value: (number))))
(markup (statement_tag_open) (if_statement condition: (parenthesized_expression (identifier)) consequence: (statement_block (text_statement (statement_tag_close) (raw_text) (expression_tag open: (expression_tag_open) (identifier) close: (expression_tag_close)) (statement_tag_open)))) (text_statement (statement_tag_close) (raw_text)))
(document (param_tag type: (type_expression (primitive_type)) name: (identifier)))
```

This was run with Node.js; in a browser, the files have to be served to the
page. See the web-tree-sitter documentation for loading its own runtime
`.wasm` there.

## Queries

The `.wasm` files contain only the parsers. Load the query files
(`<grammar>/queries/*.scm`) separately, from the npm package or the
repository, at the same version. web-tree-sitter 0.27.1 applies the
`#any-of?` filters in `highlights.scm` and `injections.scm`, and returns
`#set! injection.language` as a property of each injection match
(`match.setProperties`) for your code to act on. See
[Queries and captures](../reference/queries.md#predicates-and-directives).
