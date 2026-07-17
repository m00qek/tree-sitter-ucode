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

; Alt-syntax header expressions.
;
; Conditions and loop headers live directly on the alt-syntax node, not
; inside a statement_tag, so the captures above do not reach them.  Each
; alt-statement rule is split in grammar.js into a code-only form (reachable
; from `statement`, already covered by the statement_tag capture above when
; it appears inside one) and a markup-only `_tag` form (the one with tag
; delimiters, spanning tag boundaries) — only the `_tag` forms are targeted
; here.

(if_alt_statement_tag    condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(elif_clause_tag         condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))
(while_alt_statement_tag condition: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

(for_alt_statement_tag initializer: (_) @injection.content
  (#not-type? @injection.content empty_statement)
  (#set! injection.language "ucode") (#set! injection.combined))
(for_alt_statement_tag condition: (_) @injection.content
  (#not-type? @injection.content empty_statement)
  (#set! injection.language "ucode") (#set! injection.combined))
(for_alt_statement_tag increment: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

(for_in_alt_statement_tag right: (_) @injection.content (#set! injection.language "ucode") (#set! injection.combined))

; Inject ucdocs into JSDoc block comments (/** ... */).
; The [^*/] guard excludes /*** section dividers (≥3 stars) and /**/ (empty, non-JSDoc).
; NOT combined: each doc comment is an independent block, not part of one document.
((comment) @injection.content
  (#match? @injection.content "^/\\*\\*[^*/]")
  (#set! injection.language "ucdocs"))
