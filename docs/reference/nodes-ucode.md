# ucode nodes

The named node types of the `ucode` grammar, with their fields and children.
Derived from `ucode/src/node-types.json`. The `ucode_markup` grammar has the
same nodes, except that its root is `markup` instead of `program`, plus a few
template-only ones: see [ucode_markup nodes](nodes-ucode-markup.md).

In the tables, a field's node types are the ones that may appear in it.
*(children)* lists the node types of the unnamed children. `"…"` marks an
anonymous token.

## Supertypes

A supertype is a hidden rule that groups other nodes. A query can name it,
for example `(statement)` or `(expression)`.

| Supertype | Node types |
| --- | --- |
| `declaration` | `function_declaration`, `lexical_declaration` |
| `expression` | `assignment_expression`, `augmented_assignment_expression`, `binary_expression`, `delete_expression`, `primary_expression`, `ternary_expression`, `unary_expression`, `update_expression` |
| `primary_expression` | `array`, `arrow_function`, `call_expression`, `false`, `function_expression`, `identifier`, `member_expression`, `null`, `number`, `object`, `parenthesized_expression`, `regex`, `string`, `subscript_expression`, `template_string`, `this`, `true` |
| `statement` | `break_statement`, `continue_statement`, `declaration`, `empty_statement`, `export_statement`, `expression_statement`, `for_alt_statement`, `for_in_alt_statement`, `for_in_statement`, `for_statement`, `if_alt_statement`, `if_statement`, `import_statement`, `return_statement`, `statement_block`, `switch_statement`, `try_statement`, `while_alt_statement`, `while_statement` |

## Unbraced statements

The body of `if`, `else`, `for`, `for … in` and `while` without braces (and
without the `:` alt syntax) is a single statement of one of these types:
`break_statement`, `continue_statement`, `empty_statement`,
`expression_statement`, `for_alt_statement`, `for_in_alt_statement`,
`for_in_statement`, `for_statement`, `function_declaration`,
`if_alt_statement`, `if_statement`, `return_statement`, `statement_block`,
`switch_statement`, `try_statement`, `while_alt_statement`,
`while_statement`.

That is every `statement` except `export_statement`, `import_statement` and
`lexical_declaration`, as in ucode.

## Leaf nodes

These named nodes have no named children:

`break_statement`, `comment` (extra), `continue_statement`, `default`, `doc_comment` (extra), `empty_statement`, `escape_sequence`, `false`, `hash_bang_line`, `identifier`, `null`, `number`, `optional_chain`, `property_identifier`, `regex_flags`, `regex_pattern`, `shorthand_property_identifier`, `string_fragment`, `this`, `true`

`comment` and `doc_comment` are extras: they can appear between any two
tokens. `doc_comment` is a block comment that opens with exactly two stars
(`/**`, but not `/***` or `/**/`).

## Nodes with fields or children

### `arguments`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `expression`, `spread_element` |

### `array`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `expression`, `spread_element` |

### `arrow_function`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | `expression`, `statement_block` |
| `parameter` | no | no | `identifier` |
| `parameters` | no | no | `formal_parameters` |

### `assignment_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `left` | yes | no | `identifier`, `member_expression`, `subscript_expression` |
| `right` | yes | no | `expression` |

### `augmented_assignment_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `left` | yes | no | `identifier`, `member_expression`, `subscript_expression` |
| `operator` | yes | no | `"%="`, `"&&="`, `"&="`, `"**="`, `"*="`, `"+="`, `"-="`, `"/="`, `"<<="`, `">>="`, `"??="`, `"^="`, `"|="`, `"||="` |
| `right` | yes | no | `expression` |

### `binary_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `left` | yes | no | `expression` |
| `operator` | yes | no | `"!="`, `"!=="`, `"%"`, `"&"`, `"&&"`, `"*"`, `"**"`, `"+"`, `"-"`, `"/"`, `"<"`, `"<<"`, `"<="`, `"=="`, `"==="`, `">"`, `">="`, `">>"`, `"??"`, `"^"`, `"in"`, `"|"`, `"||"` |
| `right` | yes | no | `expression` |

### `call_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `arguments` | yes | no | `arguments` |
| `function` | yes | no | `expression` |
| `optional_chain` | no | no | `optional_chain` |

### `catch_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | `statement_block` |
| `parameter` | no | no | `identifier` |

### `computed_property_name`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `expression` |

### `delete_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `argument` | yes | no | `member_expression`, `parenthesized_expression`, `subscript_expression` |
| `operator` | yes | no | `"delete"` |

### `elif_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `condition` | yes | no | `parenthesized_expression` |
| `consequence` | no | no | `statement_list` |

### `else_alt_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | no | `statement_list` |

### `else_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [unbraced statement](#unbraced-statements) |

### `export_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `export_specifier` |

### `export_specifier`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `alias` | no | no | `default`, `identifier`, `string` |
| `name` | yes | no | `default`, `identifier`, `string` |

### `export_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `clause` | no | no | `export_clause` |
| `declaration` | no | no | `function_declaration`, `lexical_declaration` |
| `value` | no | no | `expression` |

### `expression_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `expression`, `sequence_expression` |

### `for_alt_statement`

`for (…; …; …): … endfor`. The body is a `statement_list`, absent when empty.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | no | `statement_list` |
| `condition` | yes | no | `empty_statement`, `expression`, `sequence_expression` |
| `increment` | no | no | `expression`, `sequence_expression` |
| `initializer` | yes | no | `empty_statement`, `expression`, `lexical_declaration`, `sequence_expression` |

### `for_in_alt_statement`

`for (x in o)` sets `variable`; `for (k, v in o)` sets `key` and `value`. `kind` is the optional `let`.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | no | `statement_list` |
| `key` | no | no | `identifier` |
| `kind` | no | no | `"let"` |
| `object` | yes | no | `expression`, `sequence_expression` |
| `value` | no | no | `identifier` |
| `variable` | no | no | `identifier` |

### `for_in_statement`

`for (x in o)` sets `variable`; `for (k, v in o)` sets `key` and `value`. `kind` is the optional `let`.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | [unbraced statement](#unbraced-statements) |
| `key` | no | no | `identifier` |
| `kind` | no | no | `"let"` |
| `object` | yes | no | `expression`, `sequence_expression` |
| `value` | no | no | `identifier` |
| `variable` | no | no | `identifier` |

### `for_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | [unbraced statement](#unbraced-statements) |
| `condition` | yes | no | `empty_statement`, `expression`, `sequence_expression` |
| `increment` | no | no | `expression`, `sequence_expression` |
| `initializer` | yes | no | `empty_statement`, `expression`, `lexical_declaration`, `sequence_expression` |

### `formal_parameters`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `identifier`, `rest_element` |

### `function_declaration`

`body` is a `statement_block` for `function f() { … }` and a `statement_list` for `function f(): … endfunction`; it is absent when the colon form's body is empty.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | no | `statement_block`, `statement_list` |
| `name` | yes | no | `identifier` |
| `parameters` | yes | no | `formal_parameters` |

### `function_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | `statement_block` |
| `name` | no | no | `identifier` |
| `parameters` | yes | no | `formal_parameters` |

### `if_alt_statement`

`if (c): … elif (c): … else: … endif`. The body is a `statement_list`, absent when empty.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `alternative` | no | no | `else_alt_clause` |
| `condition` | yes | no | `parenthesized_expression` |
| `consequence` | no | no | `statement_list` |
| `elif_clause` | no | yes | `elif_clause` |

### `if_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `alternative` | no | no | `else_clause` |
| `condition` | yes | no | `parenthesized_expression` |
| `consequence` | yes | no | [unbraced statement](#unbraced-statements) |

### `import_clause`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `default` | no | no | `identifier` |
| `named` | no | no | `named_imports` |
| `namespace` | no | no | `namespace_import` |

### `import_specifier`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `alias` | no | no | `identifier` |
| `name` | yes | no | `default`, `identifier`, `string` |

### `import_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `clause` | no | no | `import_clause` |
| `source` | yes | no | `string` |

### `lexical_declaration`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `kind` | no | no | `"const"`, `"let"` |
| *(children)* | yes | yes | `variable_declarator` |

### `member_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `object` | yes | no | `expression` |
| `optional_chain` | no | no | `optional_chain` |
| `property` | yes | no | `property_identifier` |

### `named_imports`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `import_specifier` |

### `namespace_import`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `identifier` |

### `object`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `pair`, `shorthand_property_identifier`, `spread_element` |

### `pair`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `key` | yes | no | `computed_property_name`, `property_identifier`, `string` |
| `value` | yes | no | `expression` |

### `parenthesized_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `expression`, `sequence_expression` |

### `program`

Root node.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `hash_bang_line`, `statement` |

### `regex`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `flags` | no | no | `regex_flags` |
| `pattern` | yes | no | `regex_pattern` |

### `rest_element`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `identifier` |

### `return_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | no | `expression`, `sequence_expression` |

### `sequence_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `expression` |

### `spread_element`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `expression` |

### `statement_block`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `statement` |

### `statement_list`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `statement` |

### `string`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `escape_sequence`, `string_fragment` |

### `subscript_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `index` | yes | no | `expression`, `sequence_expression` |
| `object` | yes | no | `expression` |
| `optional_chain` | no | no | `optional_chain` |

### `switch_body`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `switch_case`, `switch_default` |

### `switch_case`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | yes | `statement` |
| `value` | yes | no | `expression`, `sequence_expression` |

### `switch_default`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | yes | `statement` |

### `switch_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | `switch_body` |
| `value` | yes | no | `parenthesized_expression` |

### `template_string`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `escape_sequence`, `string_fragment`, `template_substitution` |

### `template_substitution`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `expression`, `sequence_expression` |

### `ternary_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `alternative` | yes | no | `expression` |
| `condition` | yes | no | `expression` |
| `consequence` | yes | no | `expression` |

### `try_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | `statement_block` |
| `handler` | yes | no | `catch_clause` |

### `unary_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `argument` | yes | no | `expression` |
| `operator` | yes | no | `"!"`, `"+"`, `"-"`, `"~"` |

### `update_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `argument` | yes | no | `identifier`, `member_expression`, `subscript_expression` |
| `operator` | yes | no | `"++"`, `"--"` |

### `variable_declarator`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | yes | no | `identifier` |
| `value` | no | no | `expression` |

### `while_alt_statement`

`while (c): … endwhile`. The body is a `statement_list`, absent when empty.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | no | no | `statement_list` |
| `condition` | yes | no | `parenthesized_expression` |

### `while_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `body` | yes | no | [unbraced statement](#unbraced-statements) |
| `condition` | yes | no | `parenthesized_expression` |


