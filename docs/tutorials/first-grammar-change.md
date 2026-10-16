# Make your first grammar change

In this tutorial we will make one small change to the grammar from start to
finish: we will give the name in a rest parameter (`...args`) its own field,
`name`. Along the way we will write a corpus test, edit
`common/define-grammar.js`, regenerate the parsers, run the test suite,
update two queries to use the new field, and regenerate the queries derived
from them. At the end we will undo everything, because the change is only an
exercise.

## Before we start

We need git, Node.js 18 or newer, and a C and C++ compiler. Work in a fresh
clone, so that the last step can throw everything away:

```sh
git clone https://github.com/m00qek/tree-sitter-ucode
cd tree-sitter-ucode
npm install
```

Every command below runs from the root of this clone.

## Look at what we are changing

Today a rest parameter is a `rest_element` node with an unnamed `identifier`
child:

```
(rest_element
  (identifier))
```

We want:

```
(rest_element
  name: (identifier))
```

## Write the test first

Corpus tests describe the tree we expect for an input. Add this test to the
end of `ucode/test/corpus/functions.txt`, after a blank line:

```
================================================================================
Rest parameter name is a field
================================================================================

function log(level, ...args) {}

--------------------------------------------------------------------------------

(program
  (function_declaration
    name: (identifier)
    parameters: (formal_parameters
      (identifier)
      (rest_element
        name: (identifier)))
    body: (statement_block)))
```

Run the tests in that file:

```sh
npx tree-sitter test -p ucode --file-name functions.txt
```

The new test is the last one, and it fails. The CLI shows the difference,
with the line it expected (`name: (identifier)`) next to the line the grammar
produced (`(identifier)`):

```
     68. ✗ Rest parameter name is a field

1 failure:

correct / expected / unexpected
  1. Rest parameter name is a field:

    (program
      (function_declaration
        name: (identifier)
        parameters: (formal_parameters
          (identifier)
          (rest_element
            (identifier)))
            name: (identifier)))
        body: (statement_block)))
```

A failing test is what we want at this point: it proves the test checks the
new behavior.

## Change the grammar

Both code grammars are built from `common/define-grammar.js`. Open it and
find the `rest_element` rule:

```js
      rest_element: $ => seq('...', $.identifier),
```

Wrap the identifier in a field:

```js
      rest_element: $ => seq('...', field('name', $.identifier)),
```

## Regenerate the parsers

The parsers in `ucode/src/` and `ucode_markup/src/` are generated from that
file. Regenerate both:

```sh
npx tree-sitter generate ucode/grammar.js --output ucode/src
npx tree-sitter generate ucode_markup/grammar.js --output ucode_markup/src
```

Run `git status --short`. Besides our two edits, the generated
`grammar.json`, `node-types.json` and `parser.c` of both grammars have
changed:

```
 M common/define-grammar.js
 M ucode/src/grammar.json
 M ucode/src/node-types.json
 M ucode/src/parser.c
 M ucode/test/corpus/functions.txt
 M ucode_markup/src/grammar.json
 M ucode_markup/src/node-types.json
 M ucode_markup/src/parser.c
```

## Run the tests again

```sh
npx tree-sitter test -p ucode --file-name functions.txt
```

Our test passes now, but two older tests fail: "Variadic function with rest
parameter" and "Arrow function with rest parameter". Their expected trees
still show the rest parameter without the field. The grammar did what we
asked; the old expectations are out of date.

Fix them by hand. In `ucode/test/corpus/functions.txt`, in the test
"Variadic function with rest parameter", change

```
      (rest_element
        (identifier)))
```

to

```
      (rest_element
        name: (identifier)))
```

and in "Arrow function with rest parameter", change
`(rest_element (identifier))` to `(rest_element name: (identifier))`.

!!! warning
    `tree-sitter test --update` would rewrite the expected trees for us, but
    it rewrites every corpus file of the grammar: it reformats every tree and
    drops the comments in the expected sections. Edit the trees by hand.

Run the file again. The summary line should now read:

```
Total parses: 13; successful parses: 13; failed parses: 0; success percentage: 100.00%; average speed: …
```

## Run the whole suite

```sh
npm test
```

This builds the three parsers into `.build/parsers/` and runs every corpus
test, compiles every query, and runs the structural checks. Each check prints
a line ending in `OK`, for example:

```
ucode: ucode/queries/*.scm and the Helix queries compile OK
ucode: no name-like node starts or ends with whitespace: OK
ucode: every corpus token is highlighted: OK
```

## Use the new field in the queries

Two queries match rest parameters without a field. Now that the field
exists, they can say what they mean. In `ucode/queries/highlights.scm`,
change

```query
(rest_element (identifier) @variable.parameter)
```

to

```query
(rest_element name: (identifier) @variable.parameter)
```

In `ucode/queries/locals.scm`, find the `rest_element` pattern and add the
field the same way:

```query
(rest_element
  name: (identifier) @local.definition
  (#set! local.kind parameter))
```

## Regenerate the derived queries

The files in `ucode/queries/` are the source for two other sets: the
template grammar's queries and the Helix queries. Regenerate both:

```sh
node scripts/generate-markup-queries.js
node scripts/generate-helix-queries.js
```

The first prints one `Wrote ucode_markup/queries/….scm` line per file, the
second `Wrote 14 files under editors/helix/queries/`. Run `git status
--short` again: the highlights and locals queries changed in
`ucode_markup/queries/` and in both `editors/helix/queries/ucode/` and
`editors/helix/queries/ucode-markup/`.

Check the result with the test suite once more:

```sh
npm test
```

and confirm the capture by hand. Write a one-line file and run the
highlights query on it with the parser `npm test` just built:

```sh
echo 'function log(level, ...args) {}' > /tmp/rest.uc
npx tree-sitter query --lib-path .build/parsers/ucode.so --lang-name ucode ucode/queries/highlights.scm /tmp/rest.uc | grep args
```

```
    capture: 19 - variable.parameter, start: (0, 23), end: (0, 27), text: `args`
    capture: 0 - variable, start: (0, 23), end: (0, 27), text: `args`
```

`args` is a parameter, matched through the new field.

## Undo the exercise

This change is not one we want to keep. Restore every tracked file, and
rebuild the parsers so `.build/parsers/` matches the restored grammar again:

```sh
git restore .
node scripts/run-tests.js --force --build-only
git status --short
```

`git status --short` prints nothing.

## What we did

We wrote a failing corpus test, changed a rule in the shared grammar
definition, regenerated both code parsers, brought two older tests up to
date, ran the full suite, used the new field in the highlights and locals
queries, and regenerated the template and Helix copies of those queries. A
real change would also add a [changelog](../changelog.md) entry; renaming or
adding a field is part of the public API (see
[About the public API](../explanation/public-api.md)).

## Next steps

- [Prepare a pull request](../how-to/prepare-pull-request.md)
- [Change the grammar](../how-to/change-grammar.md) and
  [Change a query](../how-to/change-queries.md)
- [About the architecture](../explanation/architecture.md)
