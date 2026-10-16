# How to add a corpus test

Corpus tests live in `<grammar>/test/corpus/*.txt` for `ucode`,
`ucode_markup` and `ucdocs`. Add a test for every new syntactic feature and
every deliberate removal. For a JavaScript feature that ucode does not have,
add the test to `ucode/test/corpus/js_differences.txt`.

## 1. Build the parsers

```sh
node scripts/run-tests.js --build-only
```

## 2. Get the tree for your input

Write the input to a file and parse it with the grammar you are testing.
Always pass `--lib-path` and `--lang-name` together: `--lang-name` alone is
silently ignored.

```sh
echo '<code>' > /tmp/test.uc
npx tree-sitter parse --lib-path .build/parsers/ucode.so --lang-name ucode /tmp/test.uc
npx tree-sitter parse --lib-path .build/parsers/ucode_markup.so --lang-name ucode_markup /tmp/test.uc

echo '/** @param {int} n */' > /tmp/test.doc
npx tree-sitter parse --lib-path .build/parsers/ucdocs.so --lang-name ucdocs /tmp/test.doc
```

Check the tree by hand before you copy it: the test asserts whatever you
paste.

## 3. Write the test

Add it to the file whose category matches (`expressions.txt`,
`control_flow.txt`, …), or create a new file if none fits:

```
================================================================================
Two-variable for-in
================================================================================

for (k, v in obj)
  print(k, v);

--------------------------------------------------------------------------------

(program
  (for_in_statement
    key: (identifier)
    value: (identifier)
    object: (identifier)
    body: (expression_statement
      (call_expression
        function: (identifier)
        arguments: (arguments
          (identifier)
          (identifier))))))
```

Positions (`[0, 0] - [1, 14]`) are not part of the expected tree; leave them
out.

If the input must fail to parse and the exact error tree does not matter, add
`:error` under the title and leave the expected tree empty:

```
================================================================================
var is not a keyword
:error
================================================================================

var x = 1;

--------------------------------------------------------------------------------

```

## 4. Run it

```sh
npx tree-sitter test -p ucode --file-name control_flow.txt
```

The `.txt` extension is required. Then run the whole suite with `npm test`,
which also runs the structural checks on your new input; see
[Test suites](../reference/test-suites.md).
