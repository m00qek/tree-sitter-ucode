# How to set up injections in a host editor

The code grammars inject three languages, and template text can be injected
on request. This page lists what a host editor or tool has to provide for
each.

## What the bundled injections ask for

`ucode/queries/injections.scm` (and its `ucode_markup` copy) has three
patterns, each with a fixed `injection.language`:

| Content node | `injection.language` | Grammar to provide |
| --- | --- | --- |
| `doc_comment` | `ucdocs` | `ucdocs` from this repository |
| `regex_pattern` | `regex` | a `regex` grammar (the one editors ship for JavaScript works: ucode regexes are POSIX extended) |
| `string_fragment`, first argument of `printf()` / `sprintf()` | `printf` | a `printf` grammar |

The patterns set no `injection.combined` and no `injection.include-children`:
each matched node is parsed on its own.

A host that cannot provide `regex` or `printf` can skip those matches; the
rest of the highlighting does not depend on them.

## Doc comments

Register `ucdocs` under exactly that name, or map the name `ucdocs` to it:

- **tree-sitter-highlight and other `tree-sitter.json` consumers:** the
  `ucdocs` entry has `injection-regex` `^ucdocs$`.
- **Neovim:** a parser named `ucdocs` and its queries under
  `queries/ucdocs/` (see [Register in Neovim](register-neovim.md)).
- **Helix:** a `ucdocs` language with `injection-regex = "^ucdocs$"` (see
  [Register in Helix](register-helix.md)).
- **Your own code:** run the injections query, read `injection.language` from
  each match, and parse the captured `@injection.content` node with
  `ucdocs`. Parsing the host text with an included range set to the node
  keeps positions in host coordinates; the tutorial
  [Build on the grammars](../tutorials/build-on-the-grammars.md#follow-the-doc-comment-into-ucdocs)
  does this with the Node.js binding.

The whole `doc_comment` node, from `/**` to `*/`, is the content: `ucdocs`
parses the delimiters itself.

## Template text (opt-in)

The bundled queries do not inject anything into a template's `raw_text`,
because what a template produces varies: HTML in LuCI, nftables rules in
firewall4. An integration that knows its templates produce HTML can add:

```query
((raw_text) @injection.content
  (#set! injection.language "html")
  (#set! injection.combined))
```

`injection.combined` parses all the raw text of a file as one HTML document,
so an element opened in one stretch of text and closed in another stays
balanced.

In Neovim, a user or plugin adds this to the bundled patterns with a file
`after/queries/ucode_markup/injections.scm` that starts with `;; extends`.
Checked with an `html` parser and queries from nvim-treesitter: `:Inspect`
on `<li>` then lists `@tag.html`.

## Code in templates

No injection is needed for the code in `{% %}` and `{{ }}` tags: the
`ucode_markup` tree contains it as ordinary ucode nodes, and the
`ucode_markup` queries cover it. Do not set up `ucode` as an injection into
templates.
