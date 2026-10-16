# How to choose a query set

The repository ships two sets of query files. Pick by the capture-name
convention and the predicates your host supports.

| Set | Where | Capture names | Use it for |
| --- | --- | --- | --- |
| tree-sitter / nvim-treesitter | `ucode/queries/`, `ucode_markup/queries/`, `ucdocs/queries/` | nvim-treesitter's (`@keyword.conditional`, `@variable.member`, …) | Neovim; tree-sitter-highlight and tree-sitter-tags (the CLI, GitHub); the bindings, which bundle these files; most other hosts |
| Helix | `editors/helix/queries/<language>/` | Helix's scopes (`@keyword.control.conditional`, `@variable.other.member`, …) | Helix only |

Both sets come from the same source and cover the same tokens; the Helix
set is generated from the other.

## Which files to load

| File | Generic host | Neovim | Helix |
| --- | --- | --- | --- |
| `highlights.scm` | yes | yes | Helix set |
| `injections.scm` | yes | yes | Helix set |
| `locals.scm` | yes (plain `@local.definition`; the kind is `#set! local.kind` metadata) | yes | Helix set (`@local.definition.<scope>`) |
| `tags.scm` | with tree-sitter-tags | | Helix set |
| `folds.scm` | if you fold on `@fold` | yes | not used by Helix |
| `indents.scm` | no: written for nvim-treesitter's `indentexpr` | with nvim-treesitter | Helix set, Helix's own model |
| `textobjects.scm` | no: written for nvim-treesitter-textobjects | with that plugin | Helix set, Helix's own objects |

## Predicates and directives to support

| Used in | Predicate or directive | Notes |
| --- | --- | --- |
| `highlights.scm`, `injections.scm` | `#any-of?` | standard; applied by the tree-sitter runtime bindings |
| `injections.scm` | `#set! injection.language` | your code reads it from the match |
| `locals.scm` | `#set! local.kind` | metadata; ignore it if you do not need the kind |
| `tags.scm` | `#not-any-of?` (and `#match?` in `ucode_markup`) | standard |
| `tags.scm` | `#strip!`, `#select-adjacent!` | applied only by tree-sitter-tags; other hosts see plain metadata, so `@doc` keeps its `/**`, `*` and `*/`, and a comment several lines above a definition can still match. The Node.js `tree-sitter` runtime (0.25.1) rejects them as unknown predicates; web-tree-sitter 0.27.1 and py-tree-sitter 0.26.0 accept them |
| `indents.scm` | `#not-kind-eq?`, `#set! indent.immediate`, `#set! indent.start_at_same_line` | nvim-treesitter's; the Node.js `tree-sitter` runtime (0.25.1) rejects `#not-kind-eq?` |
| Helix `indents.scm` | `#not-kind-eq?`, `#set! "scope" "all"` | Helix's |

`npm test` compiles every query file against its grammar with the tree-sitter
CLI. The binding tests compile the queries each binding ships (see
[Test suites](../reference/test-suites.md#binding-tests)).

The capture names in each file are listed in
[Queries and captures](../reference/queries.md).
