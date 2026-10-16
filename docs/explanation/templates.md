# About templates as a statement stream

## The usual approach, and why it does not fit

Most tree-sitter setups for template languages use two grammars: one that
splits the file into text and tags (like tree-sitter-embedded-template), and
the code grammar injected into each tag. Each tag is then parsed on its own,
or all tags are joined into one combined injection.

ucode templates break both versions of that model. A ucode block may open in
one tag and close in another:

```
{% if (user) { %}
  Hello, {{ user }}!
{% } else { %}
  Please log in.
{% } %}
```

Parsed tag by tag, `{% if (user) { %}` is an `if` with an unclosed brace and
`{% } %}` is a stray brace; neither tree means anything. A combined injection
does better for highlighting, but the text between the tags vanishes from the
code's tree, so the code tree cannot say that `Hello, …` is the body of the
`if`. And the ucode language server needs exactly that: one tree, in which
the text is where it belongs.

## What ucode itself does

ucode's compiler does not treat a template as text with islands of code. Its
lexer reads the template as **one statement stream**: `{%` is dropped, every
`%}` acts as a `;`, and the text between a `%}` and the next `{%` (raw text,
`{{ … }}` and `{# … #}` tags) becomes a statement that prints it.

The grammar models exactly that. A template is a script wrapped in an
implicit leading `%}` and trailing `{%`, and the one template-specific rule is
`text_statement`, allowed wherever a statement is. The example above parses
to an `if_statement` whose `statement_block` holds a `text_statement`, and
whose `else_clause` holds another (the full tree is in
[ucode_markup nodes](../reference/nodes-ucode-markup.md#where-nodes-appear)).

## What follows from it

Text can appear anywhere ucode accepts a statement, and nowhere else. So
every construct that holds statements spans tags with no special cases:

- brace blocks and the `:` … `endif` alt syntax;
- function and arrow-function bodies;
- `switch` cases;
- bare `{ }` blocks;
- several statements or openers in one tag (`{% log(n); if (c) { %}`,
  `{% for (x in xs): for (y in ys): %}`);
- a file that ends inside an open `{%` tag.

The same model also gives, for free, the cases where ucode rejects a
template:

- Text inside an expression (`{% x = [ %}a{% ] %}`) is an error, because
  text is a statement, not an expression.
- Because `%}` is a `;`, an unbraced body that runs into a tag close is
  empty. `{% if (a) %}text{% %}` is `if (a) ;` followed by the text as the
  next statement, and a later `{% else %}` is an error, as in ucode. The
  grammar produces a zero-width `empty_statement` there.

These are not grammar quirks to explain away; they are what ucode does, so a
tree that disagreed with them would mislead the language server.

## Delimiters in code

In ucode's lexer, `{{` and `}}` are tag delimiters anywhere in template code
except inside strings, comments, regexes and template-string text. So
`{% x = {a:{b:1}}; %}` is an error (the `}}` closes an expression tag that
was never opened), and so is a `{{` inside a `{% … %}` tag. The grammar
follows ucode here instead of reading nested braces, which would accept code
that ucode refuses.

A `//` comment runs to the end of its line, so it swallows a `%}` on the same
line, again as in ucode.

## The cost

The approach is more work in the grammar and the scanner than a two-layer
split. The scanner has to recognize tag delimiters inside code and decide
where text ends, and the template parser is larger than the script one. In return, the tree is the one ucode's
compiler would build, with no reassembly in the consumer, and queries need
no injection to see the code.

The rewrite to this model replaced a set of `*_tag` rules that special-cased
each construct that could span tags; it shrank the generated markup parser
from 10.3 MB to 1.5 MB (see the [changelog](../changelog.md)).
