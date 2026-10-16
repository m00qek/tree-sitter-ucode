# How to handle ERROR and MISSING nodes

tree-sitter always returns a tree. Where the input does not fit the grammar,
the tree contains ERROR nodes (input that could not be placed) and MISSING
nodes (zero-width tokens the parser inserted).

## Find them

With the Node.js binding:

```js
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const parser = new Parser();
parser.setLanguage(ucode.ucode);
const tree = parser.parse('function f() {\n  let x = 1 +;\n  print(x);\n');
console.log(tree.rootNode.toString());
console.log('hasError:', tree.rootNode.hasError);

function report(node) {
  const at = (p) => `${p.row + 1}:${p.column + 1}`;
  if (node.isError) console.log(`ERROR   ${at(node.startPosition)}-${at(node.endPosition)}`, JSON.stringify(node.text));
  else if (node.isMissing) console.log(`MISSING ${at(node.startPosition)}`, JSON.stringify(node.type));
  if (node.hasError) for (const child of node.children) report(child);
}
report(tree.rootNode);
```

```
(program (function_declaration name: (identifier) parameters: (formal_parameters) body: (statement_block (lexical_declaration (variable_declarator name: (identifier) value: (binary_expression left: (number) (ERROR) right: (call_expression function: (identifier) arguments: (arguments (identifier)))))) (MISSING "}"))))
hasError: true
ERROR   2:14-2:15 ";"
MISSING 4:1 "}"
```

- `hasError` is true on a node that is or contains an ERROR or MISSING node;
  descend only into those.
- `isError` marks an ERROR node, `isMissing` a MISSING one. A MISSING node
  has zero width; report it at its position, and use its `type` (`"}"` here)
  in the message.

A query finds them too: `(ERROR) @error` and `(MISSING) @missing`.

## Do not trust the shape around an error

In the example, the `;` is the ERROR, and recovery made `print(x)` the right
operand of `1 +`, across a line break. The tree is valid tree-sitter output,
but it is not what the author meant. Near an ERROR:

- report the ERROR and MISSING positions, and do not report further
  diagnostics derived from the surrounding structure;
- keep the last good tree for features that need accurate structure, such
  as symbol indexes, and use the new one again once `hasError` is false.

## Errors the grammar does not report

The grammar accepts some code that ucode rejects, so a tree without errors is
not proof that ucode will run the file:

- a missing `;` at a line break (the grammar inserts it; ucode does not);
- checks ucode makes when it compiles, such as `break` outside a loop or
  `{a: 1};` as a statement.

The full list is in [Known deviations](../reference/deviations.md). A
language server or linter that wants to report these has to check them
itself, or run `ucode -c`.

## What recovery looks like here

The grammar tries to keep errors small while code is being typed; for
example, a block left open at the end of the file usually ends in a
`MISSING "}"` instead of an ERROR around the whole block, and a broken
template tag becomes a small ERROR bounded by the next tag. ERROR shapes are
not part of the [public API](../explanation/public-api.md) and change between
versions. See [About error recovery](../explanation/error-recovery.md).
