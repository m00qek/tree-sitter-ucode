# ucode_markup nodes

The `ucode_markup` grammar has every node of the [ucode grammar](nodes-ucode.md)
except `program`. This page lists what it adds. Derived from
`ucode_markup/src/node-types.json`.

## Differences from `ucode`

- The root node is `markup` instead of `program`.
- The `statement` supertype also includes `text_statement`.
- An unbraced body that runs straight into `%}` (`{% if (a) %}`) is an
  `empty_statement` of zero width.

## Tag delimiters

Each delimiter is a named leaf node.

| Text | Node |
| --- | --- |
| `{%` | `statement_tag_open` |
| `{%-` | `statement_tag_trim_open` |
| `{%+` | `statement_tag_lstrip_open` |
| `%}` | `statement_tag_close` |
| `-%}` | `statement_tag_trim_close` |
| `{{` | `expression_tag_open` |
| `{{-` | `expression_tag_trim_open` |
| `}}` | `expression_tag_close` |
| `-}}` | `expression_tag_trim_close` |
| `{#` | `comment_tag_open` |
| `{#-` | `comment_tag_trim_open` |
| `#}` | `comment_tag_close` |
| `-#}` | `comment_tag_trim_close` |

Other template-only leaf nodes:

| Node | Content |
| --- | --- |
| `raw_text` | literal text outside tags |
| `comment_content` | the body of a `{# … #}` comment |

## Nodes with fields or children

### `comment_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `close` | yes | no | `comment_tag_close`, `comment_tag_trim_close` |
| `content` | no | no | `comment_content` |
| `open` | yes | no | `comment_tag_open`, `comment_tag_trim_open` |

### `expression_tag`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| `close` | yes | no | `expression_tag_close`, `expression_tag_trim_close` |
| `open` | yes | no | `expression_tag_open`, `expression_tag_trim_open` |
| *(children)* | yes | no | `expression`, `sequence_expression` |

### `markup`

Root node.

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | no | yes | `comment_tag`, `expression_tag`, `hash_bang_line`, `raw_text`, `statement`, `statement_tag_lstrip_open`, `statement_tag_open`, `statement_tag_trim_open` |

### `text_statement`

| Field | Required | Multiple | Node types |
| --- | --- | --- | --- |
| *(children)* | yes | yes | `comment_tag`, `expression_tag`, `raw_text`, `statement_tag_close`, `statement_tag_lstrip_open`, `statement_tag_open`, `statement_tag_trim_close`, `statement_tag_trim_open` |


## Where nodes appear

- The text before the first `{%` is a run of `raw_text`, `expression_tag`
  and `comment_tag` children of `markup`, followed by the first
  statement-tag opener.
- Every stretch from a `%}` to the next `{%` is one `text_statement`: the
  close delimiter, the text and tags in between, and the next open
  delimiter. With nothing in between (`{% a %}{% b %}`) it holds only the
  two delimiters. The text after the last `%}` is a `text_statement` with no
  open delimiter.
- A `text_statement` can appear wherever a statement can, and nowhere else.

For example, this template:

```
{% if (user) { %}
  Hello, {{ user }}!
{% } else { %}
  Please log in.
{% } %}
```

parses as:

```
(markup [0, 0] - [5, 0]
  (statement_tag_open [0, 0] - [0, 2])
  (if_statement [0, 3] - [4, 4]
    condition: (parenthesized_expression [0, 6] - [0, 12]
      (identifier [0, 7] - [0, 11]))
    consequence: (statement_block [0, 13] - [2, 4]
      (text_statement [0, 15] - [2, 2]
        (statement_tag_close [0, 15] - [0, 17])
        (raw_text [0, 17] - [1, 9])
        (expression_tag [1, 9] - [1, 19]
          open: (expression_tag_open [1, 9] - [1, 11])
          (identifier [1, 12] - [1, 16])
          close: (expression_tag_close [1, 17] - [1, 19]))
        (raw_text [1, 19] - [2, 0])
        (statement_tag_open [2, 0] - [2, 2])))
    alternative: (else_clause [2, 5] - [4, 4]
      (statement_block [2, 10] - [4, 4]
        (text_statement [2, 12] - [4, 2]
          (statement_tag_close [2, 12] - [2, 14])
          (raw_text [2, 14] - [4, 0])
          (statement_tag_open [4, 0] - [4, 2])))))
  (text_statement [4, 5] - [5, 0]
    (statement_tag_close [4, 5] - [4, 7])
    (raw_text [4, 7] - [5, 0])))
```

Why templates are parsed this way is discussed in
[Templates as a statement stream](../explanation/templates.md).
