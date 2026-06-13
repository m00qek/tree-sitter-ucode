; Inject the ucode grammar into statement and expression tag bodies.
;
; The entire statement_tag (excluding open/close markers) and the expression
; inside an expression_tag are highlighted as ucode code.

(statement_tag
  ((_) @injection.content
    (#not-type? @injection.content
      statement_tag_open statement_tag_trim_open statement_tag_lstrip_open
      statement_tag_close statement_tag_trim_close))
  (#set! injection.language "ucode"))

(expression_tag
  ((_) @injection.content
    (#not-type? @injection.content
      expression_tag_open expression_tag_trim_open
      expression_tag_close expression_tag_trim_close))
  (#set! injection.language "ucode"))
