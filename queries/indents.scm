; Indentation queries for ucode.
; Capture names follow the nvim-treesitter standard.

; -------------------------------------------------------------------------
; Brace-delimited constructs — increase indent inside
; -------------------------------------------------------------------------

[
  (statement_block)
  (switch_body)
  (object)
  (array)
  (arguments)
  (formal_parameters)
] @indent.begin

; Closing delimiters — decrease indent
[
  "}"
  "]"
  ")"
] @indent.end

; -------------------------------------------------------------------------
; Alternative (colon/endif) syntax
; -------------------------------------------------------------------------

; The ':' after the condition opens the body
(if_alt_statement ":" @indent.begin)
(elif_clause ":" @indent.begin)
(for_alt_statement ":" @indent.begin)
(for_in_alt_statement ":" @indent.begin)
(while_alt_statement ":" @indent.begin)
(function_declaration ":" @indent.begin)

; Closing keywords close the body
[
  "endif"
  "endfor"
  "endwhile"
  "endfunction"
] @indent.end

; -------------------------------------------------------------------------
; Branch keywords (else/elif) — dedent keyword, indent following body
; -------------------------------------------------------------------------

(else_clause "else") @indent.branch
(else_alt_clause "else") @indent.branch
(elif_clause "elif") @indent.branch

; -------------------------------------------------------------------------
; Switch
; -------------------------------------------------------------------------

(switch_case "case") @indent.branch
(switch_default "default") @indent.branch
