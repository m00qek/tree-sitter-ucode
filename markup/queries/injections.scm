; Inject the ucode grammar into statement and expression tag bodies.
;
; The entire statement_tag (excluding open/close markers) and the expression
; inside an expression_tag are highlighted as ucode code.
;
; `injection.combined` merges every ucode region of a template into a single
; parse tree (in document order) rather than one tree per tag.  A template
; can hold hundreds of tags; without this each tag re-parses independently on
; every edit.  Combining them also lets a variable declared in one `{% %}`
; block be resolved by a later `{{ }}` block, matching how the template runs.

(statement_tag
  ((_) @injection.content
    (#not-type? @injection.content
      statement_tag_open statement_tag_trim_open statement_tag_lstrip_open
      statement_tag_close statement_tag_trim_close))
  (#set! injection.language "ucode")
  (#set! injection.combined))

(expression_tag
  ((_) @injection.content
    (#not-type? @injection.content
      expression_tag_open expression_tag_trim_open
      expression_tag_close expression_tag_trim_close))
  (#set! injection.language "ucode")
  (#set! injection.combined))

; Alt-syntax and brace-spanning header expressions.
;
; Conditions, loop headers, and function signatures live directly on the
; spanning node, not inside a statement_tag, so the captures above do not
; reach them. Every spanning statement rule is split in grammar.js into a
; code-only form (reachable from `statement`, already covered by the
; statement_tag capture above when it appears inside one) and a markup-only
; `_tag` form (spanning tag boundaries) — only the `_tag` forms are targeted
; here, alt-syntax (`:`…`endif`) and brace-bodied (`{`…`}`) alike.

(if_alt_statement_tag    condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(elif_clause_tag         condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(while_alt_statement_tag condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(if_statement_tag        condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(elseif_clause_tag       condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(while_statement_tag     condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

[
  (for_alt_statement_tag initializer: (_) @injection.content)
  (for_statement_tag     initializer: (_) @injection.content)
  (for_alt_statement_tag condition: (_) @injection.content)
  (for_statement_tag     condition: (_) @injection.content)
]
  (#not-type? @injection.content empty_statement)
  (#set! injection.language "ucode") (#set! injection.combined)

(for_alt_statement_tag increment: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(for_statement_tag     increment: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

(for_in_alt_statement_tag right: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(for_in_statement_tag     right: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

(function_alt_declaration name: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(function_alt_declaration parameters: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(function_declaration_tag name: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(function_declaration_tag parameters: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

(catch_clause_tag parameter: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

; Trailing statements sharing a tag with a header/end keyword or a `{`/`}`
; brace (e.g. `{% endif; print(9); %}`, `{% if (a) { print(1); %}`) are
; direct children of the spanning node, not wrapped in a statement_tag, so
; the statement_tag capture above does not reach them either. `statement` is
; a declared grammar supertype (grammar.js `supertypes`), so this single
; pattern matches every concrete statement kind without listing them.
[
  (if_alt_statement_tag (statement) @injection.content)
  (elif_clause_tag (statement) @injection.content)
  (else_alt_clause_tag (statement) @injection.content)
  (for_alt_statement_tag (statement) @injection.content)
  (for_in_alt_statement_tag (statement) @injection.content)
  (while_alt_statement_tag (statement) @injection.content)
  (function_alt_declaration (statement) @injection.content)
  (if_statement_tag (statement) @injection.content)
  (elseif_clause_tag (statement) @injection.content)
  (else_clause_tag (statement) @injection.content)
  (for_statement_tag (statement) @injection.content)
  (for_in_statement_tag (statement) @injection.content)
  (while_statement_tag (statement) @injection.content)
  (function_declaration_tag (statement) @injection.content)
  (catch_clause_tag (statement) @injection.content)
]
  (#set! injection.language "ucode")
  (#set! injection.combined)

; Inject ucdocs into JSDoc block comments (/** ... */).
; The [^*/] guard excludes /*** section dividers (≥3 stars) and /**/ (empty, non-JSDoc).
; NOT combined: each doc comment is an independent block, not part of one document.
((comment) @injection.content
  (#match? @injection.content "^/\\*\\*[^*/]")
  (#set! injection.language "ucdocs"))
