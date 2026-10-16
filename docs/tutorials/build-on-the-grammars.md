# Build on the grammars

In this tutorial we will write a small Node.js program on top of the three
ucode grammars. It will parse a ucode script and a ucode template, read the
script's functions and loop variables through field names, run the bundled
highlights query, and follow a doc comment into the `ucdocs` grammar. These
are the four things every editor integration or ucode tool does.

## Before we start

We need git, Node.js 18 or newer, and a C and C++ compiler. The commands were
checked with Node.js 24 and the `tree-sitter` runtime 0.25.1.

## Get the grammars

We build the grammars from a checkout of the repository:

```sh
git clone https://github.com/m00qek/tree-sitter-ucode
cd tree-sitter-ucode
npm install
cd ..
```

`npm install` compiles the Node.js binding inside the checkout.

Next to the checkout, create the project we will work in, and install the
tree-sitter runtime and the checkout into it:

```sh
mkdir ucode-tool
cd ucode-tool
npm init -y
npm install tree-sitter@^0.25 ../tree-sitter-ucode
```

The rest of the tutorial runs inside `ucode-tool`.

## Parse a script and a template

Create two files to parse. First `greet.uc`, a script:

```js
/**
 * Greets someone.
 * @param {string} name - Who to greet.
 * @returns {string}
 */
function greet(name) {
	return `Hello, ${name}!`;
}

for (let person, age in { alice: 30, bob: 25 })
	print(greet(person), " is ", age, "\n");
```

Then `list.ut`, a template:

```
<ul>
{% for (x in items): %}
  <li>{{ x }}</li>
{% endfor %}
</ul>
```

Now create `parse.js`:

```js
const fs = require('node:fs');
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const parser = new Parser();

parser.setLanguage(ucode.ucode);
const script = parser.parse(fs.readFileSync('greet.uc', 'utf8'));
console.log(script.rootNode.toString());

parser.setLanguage(ucode.ucode_markup);
const template = parser.parse(fs.readFileSync('list.ut', 'utf8'));
console.log(template.rootNode.toString());
```

The package exports one language per grammar: `ucode.ucode` for scripts and
`ucode.ucode_markup` for templates. Run it:

```sh
node parse.js
```

Two trees are printed, one per line:

```
(program (doc_comment) (function_declaration name: (identifier) parameters: (formal_parameters (identifier)) body: (statement_block (return_statement (template_string (string_fragment) (template_substitution (identifier)) (string_fragment))))) (for_in_statement key: (identifier) value: (identifier) object: (object (pair key: (property_identifier) value: (number)) (pair key: (property_identifier) value: (number))) body: (expression_statement (call_expression function: (identifier) arguments: (arguments (call_expression function: (identifier) arguments: (arguments (identifier))) (string (string_fragment)) (identifier) (string (escape_sequence)))))))
(markup (raw_text) (statement_tag_open) (for_in_alt_statement variable: (identifier) object: (identifier) body: (statement_list (text_statement (statement_tag_close) (raw_text) (expression_tag open: (expression_tag_open) (identifier) close: (expression_tag_close)) (raw_text) (statement_tag_open)))) (text_statement (statement_tag_close) (raw_text)))
```

Notice three things:

- The script's root is `program`, the template's is `markup`.
- The doc comment is a single `doc_comment` node; its contents are not
  parsed yet.
- The template's loop is an ordinary `for_in_alt_statement`, and the text
  inside it is a `text_statement` in its body.

## Walk the tree by field names

Field names, like `name:` and `key:` in the output above, are the stable way
to reach a node's parts. Create `walk.js`:

```js
const fs = require('node:fs');
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const parser = new Parser();
parser.setLanguage(ucode.ucode);
const tree = parser.parse(fs.readFileSync('greet.uc', 'utf8'));

for (const node of tree.rootNode.namedChildren) {
  if (node.type === 'function_declaration') {
    const name = node.childForFieldName('name');
    const params = node.childForFieldName('parameters').namedChildren.map((p) => p.text);
    console.log(`function ${name.text}(${params.join(', ')}) at line ${name.startPosition.row + 1}`);
  } else if (node.type === 'for_in_statement') {
    const key = node.childForFieldName('key');
    const value = node.childForFieldName('value');
    const object = node.childForFieldName('object');
    console.log(`loop over ${object.type}: key=${key.text}, value=${value.text}`);
  }
}
```

Run it:

```sh
node walk.js
```

```
function greet(name) at line 6
loop over object: key=person, value=age
```

The two-variable loop has `key` and `value` fields. A one-variable loop, like
the one in the template, has a `variable` field instead.

## Run the highlights query

The package ships its queries next to the grammars. Create `highlight.js`,
which runs `ucode/queries/highlights.scm` and prints the captures on line 6:

```js
const fs = require('node:fs');
const path = require('node:path');
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const pkg = path.dirname(require.resolve('tree-sitter-ucode/package.json'));
const highlights = fs.readFileSync(path.join(pkg, 'ucode/queries/highlights.scm'), 'utf8');

const parser = new Parser();
parser.setLanguage(ucode.ucode);
const tree = parser.parse(fs.readFileSync('greet.uc', 'utf8'));

const query = new Parser.Query(ucode.ucode, highlights);
for (const { name, node } of query.captures(tree.rootNode)) {
  if (node.startPosition.row !== 5) continue; // only line 6
  console.log(`${node.startPosition.column + 1}`.padEnd(4), `@${name}`.padEnd(22), node.text);
}
```

Run it:

```sh
node highlight.js
```

```
1    @keyword.function      function
10   @variable              greet
10   @function              greet
15   @punctuation.bracket   (
16   @variable              name
16   @variable.parameter    name
20   @punctuation.bracket   )
22   @punctuation.bracket   {
```

Each line is a column, a capture name and the captured text. Notice that
`greet` and `name` are captured twice: once by a general pattern for every
identifier, and once by a more specific one. The specific pattern comes later
in the query file, and a highlighter that lets the later capture win shows
`greet` as a function and `name` as a parameter.

## Follow the doc comment into ucdocs

The `doc_comment` node is handed to the `ucdocs` grammar by the injections
query. Create `inject.js`, which runs `ucode/queries/injections.scm`, reads
the language each match names, and parses the doc comment with `ucdocs`:

```js
const fs = require('node:fs');
const path = require('node:path');
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const pkg = path.dirname(require.resolve('tree-sitter-ucode/package.json'));
const injections = fs.readFileSync(path.join(pkg, 'ucode/queries/injections.scm'), 'utf8');
const text = fs.readFileSync('greet.uc', 'utf8');

const parser = new Parser();
parser.setLanguage(ucode.ucode);
const tree = parser.parse(text);

const docParser = new Parser();
docParser.setLanguage(ucode.ucdocs);

const query = new Parser.Query(ucode.ucode, injections);
for (const match of query.matches(tree.rootNode)) {
  const language = match.setProperties['injection.language'];
  const content = match.captures.find((c) => c.name === 'injection.content').node;
  console.log(`${content.type} on line ${content.startPosition.row + 1} -> ${language}`);
  if (language !== 'ucdocs') continue;

  // Parse only the comment's range of the file, so positions stay file positions.
  const doc = docParser.parse(text, null, {
    includedRanges: [{
      startIndex: content.startIndex,
      endIndex: content.endIndex,
      startPosition: content.startPosition,
      endPosition: content.endPosition,
    }],
  });
  for (const tag of doc.rootNode.namedChildren) {
    const parts = [tag.type];
    const name = tag.childForFieldName('name');
    const type = tag.childForFieldName('type');
    if (name) parts.push(`name=${name.text}`);
    if (type) parts.push(`type=${type.text}`);
    console.log(`  line ${tag.startPosition.row + 1}: ${parts.join(' ')}`);
  }
}
```

Run it:

```sh
node inject.js
```

```
doc_comment on line 1 -> ucdocs
  line 2: description
  line 3: param_tag name=name type={string}
  line 4: returns_tag type={string}
```

The injections query found one match, the doc comment, and named its
language `ucdocs`. Parsing the whole file with `includedRanges` limited to the
comment gives a `document` tree whose positions are positions in
`greet.uc`: the `@param` tag is reported on line 3, where it is in the file.

## What we did

We loaded all three grammars through the Node.js binding, parsed a script and
a template, read nodes by field name, ran the bundled highlights query, and
used the bundled injections query to parse a doc comment with `ucdocs` at its
real position in the file.

## Next steps

- [Set up injections in a host editor](../how-to/set-up-injections.md)
- [Handle ERROR and MISSING nodes](../how-to/handle-errors.md)
- [ucode nodes](../reference/nodes-ucode.md) and
  [Queries and captures](../reference/queries.md)
- [About the public API](../explanation/public-api.md): what you can rely on
  across versions.
