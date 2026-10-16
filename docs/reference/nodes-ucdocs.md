# ucdocs nodes and tags

The `ucdocs` grammar parses the contents of a `/** … */` doc comment. The
code grammars produce a `doc_comment` node for such a comment, and their
injection queries hand it to `ucdocs`. Node types are derived from
`ucdocs/src/node-types.json`.

## What counts as a doc comment

A block comment that opens with exactly two stars and is not `/**/`. `/***`
and `/**/` are plain `comment` nodes, as in JSDoc.

## Block tags

| Tag | Syntax | Node |
| --- | --- | --- |
| `@param` | `@param {Type} name description`; the name may be dotted (`opts.timeout`) or `[optional=default]`; the type may be a rest type `{...Type}` | `param_tag` |
| `@returns`, `@return` | `@returns {Type} description` | `returns_tag` |
| `@throws`, `@throw` | `@throws {Type} description` | `throws_tag` |
| `@type` | `@type {Type}` | `type_tag` |
| `@typedef` | `@typedef {Type} TypeName description`; type, name and description are each optional; the name may be a namepath (`module:core.TimeSpec`) | `typedef_tag` |
| `@property`, `@prop` | `@property {Type} name description`; the name may be a constant, dotted, `[optional=default]` or `*` | `property_tag` |
| `@template` | `@template T, U` | `template_tag` |
| `@function` | `@function module:path#member` | `function_tag` |
| `@module` | `@module name`; the name is optional | `module_tag` |
| `@deprecated` | `@deprecated description` | `deprecated_tag` |
| `@since` | `@since version` | `since_tag` |
| `@see` | `@see reference` | `see_tag` |
| `@example` | `@example code` | `example_tag` |
| `@default` | `@default value` | `default_tag` |
| any other `@name` | `@name description` | `unknown_tag` |

A bare `@typedef` followed by `@name` and `@property` lines (the style of
ucode's standard library for enumerations) parses as a `typedef_tag`, an
`unknown_tag` and `property_tag`s.

## Prose

- A block tag starts at an `@` at the beginning of a word. An `@` inside a
  word (`foo@bar.com`, `` `@` ``) is prose.
- A ` - ` between a name and its description is JSDoc's separator and is not
  part of the `description`.
- Inline tags such as `{@link module:fs#close}` are `inline_tag` nodes inside
  a `description`.
- Balanced braces in prose, such as an object literal in an `@example`, are
  prose too. A `}` with no `{` before it is prose; an unbalanced `{` is an
  error.
- Only the comment frame at the start of each line (indentation and one `*`)
  is skipped, so markdown such as `**bold**`, `*italic*` and `* bullets` stays
  in the text.
- A `description` holds `text` and `inline_tag` children. None of them
  crosses a line end, so a description's text without the frame is its
  children, line by line.
- An optional parameter's default (`[name=default]`) runs to the closing `]`
  and may be any value: `[mode="r"]`, `[mode=0o666]`,
  `[end=buffer.length()]`.

## Type expressions

| Form | Example | Node |
| --- | --- | --- |
| primitive | `int`, `integer`, `float`, `double`, `number`, `string`, `boolean`, `null`, `void`, `function`, `object`, `array`, `regexp`, `resource` | `primitive_type` |
| any | `*`, `any` | `any_type` |
| list | `list`, `list<T>` | `list_type` |
| dictionary | `dict`, `dict<T>` | `dict_type` |
| record | `{field: T}` | `record_type` with `record_field`s |
| named | `TypeName`, `TypeName<T, U>`, `Array.<T>` | `named_type` |
| cross-module | `module:path.To.Type` | `module_type` |
| named function | `(name: T) => U`, `(...any) => R` | `function_type` |
| anonymous function | `function(T): U`, `function(string, ...any)` | `anon_function_type` |
| union | `T | U | V` (one node, however many members) | `union_type` |
| nullable | `?T` | `nullable_type` |
| array | `T[]` | `array_type` |
| grouped | `(T | U)` | `parenthesized_type` |

The `{…}` around a tag's type is a `type_expression` (`rest_type_expression`
for `{...T}`).

## Type nodes

Where a table below says *type*, the node is one of: `anon_function_type`,
`any_type`, `array_type`, `dict_type`, `function_type`, `list_type`,
`module_type`, `named_type`, `nullable_type`, `parenthesized_type`,
`primitive_type`, `record_type`, `union_type`.

## Leaf nodes

`any_type`, `default_value`, `identifier`, `member_name`, `module_path`, `primitive_type`, `property_name`, `tag_name`, `text`, `type_identifier`, `type_param`

## Nodes with fields or children

### `anon_function_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `params` | no | yes | `","`, `anon_function_type`, `any_type`, `array_type`, `dict_type`, `function_type`, `list_type`, `module_type`, `named_type`, `nullable_type`, `parenthesized_type`, `primitive_type`, `record_type`, `rest_param`, `union_type` |
| `return` | no | no | [type](#type-nodes) |

### `array_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [type](#type-nodes) except `union_type` |

### `default_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |

### `deprecated_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |

### `description`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `inline_tag`, `text` |

### `dict_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `value` | no | no | [type](#type-nodes) |

### `document`

Root node.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `default_tag`, `deprecated_tag`, `description`, `example_tag`, `function_tag`, `module_tag`, `param_tag`, `property_tag`, `returns_tag`, `see_tag`, `since_tag`, `template_tag`, `throws_tag`, `type_tag`, `typedef_tag`, `unknown_tag` |

### `example_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |

### `function_param`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | yes | no | `identifier` |
| `type` | yes | no | [type](#type-nodes) |

### `function_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `namepath` | no | no | `namepath` |

### `function_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `params` | no | yes | `","`, `function_param`, `rest_param` |
| `return` | yes | no | [type](#type-nodes) |

### `inline_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `description`, `tag_name` |

### `list_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `element` | no | no | [type](#type-nodes) |

### `module_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | no | no | `member_name` |

### `module_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `path` | yes | no | `module_path` |

### `named_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | yes | no | `identifier`, `type_identifier` |
| `params` | no | yes | `","`, `anon_function_type`, `any_type`, `array_type`, `dict_type`, `function_type`, `list_type`, `module_type`, `named_type`, `nullable_type`, `parenthesized_type`, `primitive_type`, `record_type`, `union_type` |

### `namepath`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `member` | no | no | `member_name` |
| `path` | yes | no | `module_path` |

### `nullable_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [type](#type-nodes) except `union_type` |

### `optional_param`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `default` | no | no | `default_value` |
| `name` | yes | no | `identifier`, `param_path` |

### `param_path`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | `identifier` |

### `param_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| `name` | no | no | `identifier`, `optional_param`, `param_path` |
| `type` | no | no | `rest_type_expression`, `type_expression` |

### `parenthesized_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [type](#type-nodes) |

### `property_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| `name` | no | no | `optional_param`, `property_name` |
| `type` | no | no | `type_expression` |

### `record_field`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | yes | no | `identifier` |
| `type` | yes | no | [type](#type-nodes) |

### `record_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `record_field` |

### `rest_param`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `name` | no | no | `identifier` |
| `type` | yes | no | [type](#type-nodes) |

### `rest_type_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [type](#type-nodes) |

### `returns_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| `type` | no | no | `type_expression` |

### `see_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |

### `since_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |

### `template_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `type_param` |

### `throws_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| `type` | no | no | `type_expression` |

### `type_expression`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | no | [type](#type-nodes) |

### `type_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `type` | yes | no | `type_expression` |

### `typedef_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| `name` | no | no | `identifier`, `namepath`, `type_identifier` |
| `type` | no | no | `type_expression` |

### `union_type`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | [type](#type-nodes) except `union_type` |

### `unknown_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `description` | no | no | `description` |
| *(children)* | yes | no | `tag_name` |


## Example

```
/**
 * Opens a file. See {@link module:fs#close}.
 *
 * @param {string} path - The file.
 * @param {string} [mode="r"] - Open mode.
 * @returns {?module:fs.file}
 */
```

parses as:

```
(document [0, 0] - [6, 3]
  (description [1, 3] - [1, 45]
    (text [1, 3] - [1, 20])
    (inline_tag [1, 21] - [1, 44]
      (tag_name [1, 22] - [1, 27])
      (description [1, 28] - [1, 43]
        (text [1, 28] - [1, 43])))
    (text [1, 44] - [1, 45]))
  (param_tag [3, 3] - [3, 35]
    type: (type_expression [3, 10] - [3, 18]
      (primitive_type [3, 11] - [3, 17]))
    name: (identifier [3, 19] - [3, 23])
    description: (description [3, 26] - [3, 35]
      (text [3, 26] - [3, 35])))
  (param_tag [4, 3] - [4, 42]
    type: (type_expression [4, 10] - [4, 18]
      (primitive_type [4, 11] - [4, 17]))
    name: (optional_param [4, 19] - [4, 29]
      name: (identifier [4, 20] - [4, 24])
      default: (default_value [4, 25] - [4, 28]))
    description: (description [4, 32] - [4, 42]
      (text [4, 32] - [4, 42])))
  (returns_tag [5, 3] - [5, 29]
    type: (type_expression [5, 12] - [5, 29]
      (nullable_type [5, 13] - [5, 28]
        (module_type [5, 14] - [5, 28]
          path: (module_path [5, 21] - [5, 28]))))))
```
