; Fold queries for ucode.
; Each captured node becomes a collapsible fold region.

; -------------------------------------------------------------------------
; Brace-delimited blocks
; -------------------------------------------------------------------------

[
  (statement_block)
  (switch_body)
  (object)
  (array)
] @fold

; -------------------------------------------------------------------------
; Alternative (colon/endif) syntax — fold the entire construct
; -------------------------------------------------------------------------

[
  (if_alt_statement)
  (for_alt_statement)
  (for_in_alt_statement)
  (while_alt_statement)
] @fold

; -------------------------------------------------------------------------
; Top-level function and arrow function bodies
; -------------------------------------------------------------------------

(function_declaration) @fold

(function_expression
  body: (statement_block) @fold)

(arrow_function
  body: (statement_block) @fold)
