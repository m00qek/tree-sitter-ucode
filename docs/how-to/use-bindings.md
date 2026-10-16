# How to use a binding

Every binding exposes all three grammars. Only the npm package is published;
for the other languages, depend on the Git repository. Each needs a
tree-sitter runtime that loads ABI 15 parsers (0.25 or newer). The full list
of exported names is in [Bindings](../reference/bindings.md).

## Node.js

```sh
npm install tree-sitter-ucode tree-sitter
```

The named exports below (`.ucode`, `.ucode_markup`, `.ucdocs`) are newer than
the last release, v0.8.0 (see the [changelog](../changelog.md)). Until the
next release, install from a checkout instead: run `npm install` in the
checkout, then `npm install tree-sitter@^0.25 <path-to-checkout>` in your
project, as in [Build on the grammars](../tutorials/build-on-the-grammars.md).

The package itself is the `ucode` grammar; all three are also exported by
name:

```js
const Parser = require('tree-sitter');
const ucode = require('tree-sitter-ucode');

const parser = new Parser();
parser.setLanguage(ucode);               // or ucode.ucode: scripts
parser.setLanguage(ucode.ucode_markup);  // templates
parser.setLanguage(ucode.ucdocs);        // /** */ doc comments

const tree = parser.parse('{% for (x in xs): %}<li>{{ x }}</li>{% endfor %}\n');
console.log(tree.rootNode.toString());
```

## C

Build and install the libraries with make:

```sh
make
make install PREFIX=/usr/local
```

or add the repository to a CMake project with `add_subdirectory()`. Each
grammar is its own library, with its own header and pkg-config name:

```c
#include <tree_sitter/api.h>
#include <tree_sitter/tree-sitter-ucode.h>

TSParser *parser = ts_parser_new();
ts_parser_set_language(parser, tree_sitter_ucode());
```

```sh
cc main.c $(pkg-config --cflags --libs tree-sitter tree-sitter-ucode)
```

Use `tree_sitter_ucode_markup()` / `tree-sitter-ucode-markup` for templates
and `tree_sitter_ucdocs()` / `tree-sitter-ucdocs` for doc comments.
`make install` also installs the query files under
`$PREFIX/share/tree-sitter/queries/<grammar>/`.

## Rust

```toml
[dependencies]
tree-sitter = "0.25"
tree-sitter-ucode = { git = "https://github.com/m00qek/tree-sitter-ucode" }
```

```rust
let mut parser = tree_sitter::Parser::new();
parser
    .set_language(&tree_sitter_ucode::LANGUAGE_UCODE.into())
    .expect("Error loading ucode parser");
let tree = parser.parse("let x = 1;\n", None).unwrap();
assert!(!tree.root_node().has_error());
```

`LANGUAGE_UCODE_MARKUP` and `LANGUAGE_UCDOCS` load the other two grammars.

## Python

```sh
pip install "tree-sitter>=0.25" git+https://github.com/m00qek/tree-sitter-ucode
```

```python
from tree_sitter import Language, Parser
import tree_sitter_ucode

language = Language(tree_sitter_ucode.language_ucode_markup())
tree = Parser(language).parse(b'{% if (a) { %}hi {{ b }}{% } %}\n')
print(tree.root_node.type)  # markup
```

The package also ships the highlights, injections, locals and tags queries as
module attributes, such as `tree_sitter_ucode.UCODE_HIGHLIGHTS_QUERY`.

## Go

```sh
go get github.com/m00qek/tree-sitter-ucode/bindings/go
```

```go
import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_ucode "github.com/m00qek/tree-sitter-ucode/bindings/go"
)

parser := tree_sitter.NewParser()
defer parser.Close()
parser.SetLanguage(tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcode()))
```

`LanguageUcodeMarkup()` and `LanguageUcdocs()` load the other two grammars.

## Swift

```swift
.package(url: "https://github.com/m00qek/tree-sitter-ucode", branch: "main")
```

The `TreeSitterUcode` product contains three modules, one per grammar:

```swift
import SwiftTreeSitter
import TreeSitterUcode

let parser = Parser()
try parser.setLanguage(Language(language: tree_sitter_ucode()))
```

Import `TreeSitterUcodeMarkup` for `tree_sitter_ucode_markup()` and
`TreeSitterUcdocs` for `tree_sitter_ucdocs()`.

Each module ships its grammar's `queries/` directory as a SwiftPM resource
bundle named `TreeSitterUcode_<module>`. Where SwiftPM puts it depends on the
build:

| Build | Queries directory |
| --- | --- |
| Xcode | `TreeSitterUcode_<module>.bundle/Contents/Resources/queries` |
| `swift build` / `swift test` on macOS | `TreeSitterUcode_<module>.bundle/queries` |
| Linux | `TreeSitterUcode_<module>.resources/queries` |

SwiftTreeSitter 0.25.0's `LanguageConfiguration(_:name:bundleName:)` looks
only in the Xcode location on macOS, so outside Xcode pass the directory
yourself:

```swift
let queries = Bundle.main.bundleURL
    .appendingPathComponent("TreeSitterUcode_TreeSitterUcode.bundle/queries")
let config = try LanguageConfiguration(
    Language(language: tree_sitter_ucode()), name: "TreeSitterUcode",
    queriesURL: queries)
```

`bindings/swift/TreeSitterUcodeTests` tries all three locations.
