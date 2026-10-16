# About the external scanner

tree-sitter generates a lexer from the grammar's regular expressions, but
some of ucode's lexical rules cannot be written that way. The code grammars
hand those to a scanner written in C, `common/scanner.h`. This page explains
what it handles and why some of its choices look unusual. The token list is
in [External tokens](../reference/external-tokens.md).

## What cannot be a regular expression

tree-sitter's regular expressions have no lookahead and always take the
longest match. Several ucode tokens need one or the other:

- **Template text** runs up to `{%`, `{{` or `{#`, but a lone `{` is text.
  Deciding means looking at the character after the `{`.
- **`{# … #}` comment bodies** end before `#}` or `-#}`. A regex would take
  the `#` of `#}` in `{# x##}`.
- **String bodies** may contain raw line breaks in ucode, and only the end
  of input leaves a string unterminated. A regex that matched up to the end
  of input would swallow the rest of the file into one string on every
  keystroke that opens a quote. The scanner instead declines at end of
  input, so the parser recovers statement by statement. String bodies are
  also scanned before comments, so the glob `'/*.uc'` stays a string instead
  of opening a block comment.
- **Regex bodies** follow the same rules as strings in ucode's lexer, plus
  character classes, where `/` and line breaks are literal and a leading `]`
  is a member.
- **Octal escapes** must be at most `\377`. A regex cannot compute the value;
  `\777` would match as `\77` followed by a `7`.
- **Comments** run to the end of the line or to `*/`, and `/**` with exactly
  two stars is a doc comment. The scanner must also skip whitespace itself
  before a comment, because tree-sitter does not call it again after lexing
  whitespace.
- **Automatic semicolon insertion** depends on what comes after a line
  break. See [Lenient semicolon insertion](asi.md).

## Zero-width tokens

Several external tokens consume no text. They exist to give the parser a
decision point that the input alone does not provide.

- **`_automatic_semicolon`** is the inserted `;`. It is emitted right after
  the statement's last token, not after the whitespace that follows, so a
  statement ends where its text ends. If it ended after the line break,
  editors would treat the next line as still inside the statement's block,
  and indentation would be wrong.
- **`_asi_gap`** handles a comment on its own line. Comments are extras and
  are scanned before ASI is decided. If the scanner emitted the comment
  first, the comment would end up inside the still-open statement before it:
  a doc comment after `function f() {}` would land in the function instead
  of in front of the next declaration. So the scanner peeks past the comment
  to the next real token, decides ASI there, and emits a zero-width token at
  the comment's start: the `;` if a new statement follows, or `_asi_gap`, a
  no-op extra, if the expression continues (`a⏎// c⏎.b`). The comment itself
  is scanned on the next call.
- **`_tag_semicolon`** is the empty statement before `%}` in an unbraced
  body (`{% if (a) %}`): since `%}` is a `;` in ucode, the body is empty.
- **`_text_end`** and **`_block_end`** mark the end of input. They are the
  basis of end-of-input recovery, below.
- **`_return_marker`** is never emitted. It is valid in exactly one parser
  state, right after `return`, so its presence in the valid-token list tells
  the scanner where it is. After `return`, ucode reads the next line as the
  return value, so a line break there ends the statement only if no
  expression can follow.
- **`_error_sentinel`** is never emitted either. No rule uses it, so
  tree-sitter marks it valid only during error recovery, when it marks every
  external token valid at once. The scanner checks it first and declines,
  leaving recovery to the grammar's own tokens instead of, for example,
  consuming code as template text. This is the pattern tree-sitter's
  documentation recommends.

## Emitting tokens the parser did not ask for

tree-sitter passes the scanner a list of the tokens valid in the current
parser state, and a scanner normally returns only one of those. This scanner
deliberately returns two kinds of token when they are not valid. Both happen
only when the input already has an error, and both make the error smaller.

### Stray tag delimiters

In a template, ucode's lexer reads `{%`, `%}`, `{{` and `}}` as tag
delimiters anywhere in code. When the parser is in the middle of an
expression, no delimiter is valid: typically a tag is half-typed
(`{% if (co` followed by the next tag) or closed mid-expression
(`{{ obj. }}`).

If the scanner declined, tree-sitter would lex the characters as `{`, `%`
and `}` operators, and the error region would stay open until some unrelated
token happened to fit, often far down the file. By emitting the delimiter
anyway, the scanner gives the parser a token it cannot shift, so it reports
the error at the tag boundary and recovers there, usually by inserting the
one missing token. Valid input never takes this path, because a valid
delimiter has already been matched earlier in the scan.

### End of input inside open blocks

When a file ends inside a block that is still open, the parser needs a
missing `}` (or `endif`, …). tree-sitter only inserts a missing token when
the lookahead token can then be shifted, and the real end of input is
accepted, never shifted. So no `}` could be inserted before it, and the whole
open construct became an ERROR.

Every statement list may end with a zero-width `_block_end`, which the
scanner emits at end of input. After it, the list's own closer is due. The
scanner then emits `_block_end` again, although it is no longer valid. The
enclosing list accepts it, so the parser inserts the one missing `}` and
shifts the token there. Repeated, this closes open blocks from the innermost
out, up to the root, which ends with `_text_end`. The scanner stops once the
root's `_text_end` has been emitted.

## State

The scanner keeps two flags and serializes them, because tree-sitter may
fork the parse and each branch needs its own copy. One flag makes the call
after an `_asi_gap` scan the comment itself instead of deciding ASI again,
which would loop. The other records that the root's `_text_end` has been
emitted.

## Locale independence

The scanner lists ucode's whitespace characters explicitly instead of
calling `iswspace()`. The answer of `iswspace()` depends on the host
process's locale: an editor that calls `setlocale()` would see a no-break
space as blank, and the same file would parse differently in two programs.
