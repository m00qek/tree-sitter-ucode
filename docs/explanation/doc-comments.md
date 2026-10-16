# About doc comments and ucdocs

## Why doc comments get a grammar

ucode's standard library is documented in JSDoc-style `/** … */` comments.
Those comments carry information an editor
and a language server can use: parameter names and types, return types,
`@typedef` records, cross-module references. As plain comment text they are
just gray. Parsed, they give highlighting of tags and types, tags for
`@typedef` names, and a structure the language server can read types from.

## Why a separate grammar

Doc comments are their own small language: tags, type expressions with
generics, unions, records and function types, and free prose with markdown.
None of it shares rules with ucode code. Putting it in the code grammar
would grow the code parser for the benefit of comments, and every code
consumer would pay for it.

So `ucdocs` is a standalone grammar, and the code grammars only recognize
the comment: the scanner returns a `doc_comment` node for a block comment
that opens with exactly two stars (`/**`, but not `/***` banners or the
empty `/**/`, following JSDoc). The injection query then hands each
`doc_comment` to `ucdocs`. Consumers that do not care about doc comments
see one node.

## Shaped by real comments

The ucdocs grammar was tuned against the doc comments in ucode's own sources,
which CI parses on every run. The changelog records the effect: of 1,327
real doc comments, 8 fail to parse instead of 160. Many rules exist because the standard library writes things a strict JSDoc
grammar would reject:

- `@typedef` with every part optional, including a bare `@typedef` followed
  by `@name` and `@property` lines, which the standard library uses for
  enumerations;
- `@property` names that are constants (`ST_RDONLY`), dotted, optional, or
  `*`;
- defaults in `[name=default]` that are strings, octal numbers, paths or
  calls, read up to the closing `]`;
- ucode's runtime type names (`integer`, `double`, `object`, `array`,
  `regexp`, `resource`) next to the documentation names (`int`, `float`), and
  `number`, the most used of all;
- the older JSDoc generic form `Array.<T>`, and function types with rest
  parameters, `(...any) => R`.

## Prose is the hard part

Most of the grammar's subtlety is in descriptions, because prose is
anything, and a few characters mean something else in some places:

- **Stars.** A run of `*` may be markdown (`**bold**`, `* bullet`) or the
  start of the closing `*/`. Which one depends on the character after the
  run, which a tree-sitter regex cannot look at, so `ucdocs` has a one-token
  external scanner for star runs. Only the single frame star at the start of
  each line is skipped; the rest stays in the text.
- **Braces.** After a tag, `{…}` is a type; in prose, it may be an inline tag
  (`{@link …}`), an object literal in an example, or a stray `}` from a code
  sample. The lexer decides by the first token after `{`, and the type
  reading wins when both could match.
- **The `@` sign.** A block tag starts only at an `@` at the beginning of a
  word, so `foo@bar.com` stays prose.
- **The ` - ` separator.** JSDoc's `name - description` dash is hidden, so
  descriptions do not start with "- ", but a dash without a following space
  (`-1 to disable`) keeps its sign.
- **Line ends.** No child of a description crosses a line end. A consumer
  can rebuild the text without the comment frame by joining the children
  line by line, and the frame is never inside a node.

## In templates

A doc comment in a template is a `doc_comment` like any other. One case is
template-specific: a comment in its own tag before a declaration in the next
tag,

```
{% /** Renders the header. */ %}
{% function header() { %}…{% } %}
```

is separated from the declaration by a `text_statement` (the `%}`, a line
break, and the `{%`). The template's `tags.scm` has extra patterns that skip
one such `text_statement` when it holds only whitespace, so the comment is
still attached as the function's documentation.
