; Text-object queries for ucode_markup.
; Code nodes inside {% %} tags are real AST nodes in the unified tree,
; so the same patterns as the code grammar apply here.

; ── Functions ─────────────────────────────────────────────────────────────────

(function_declaration
  body: (statement_block) @function.inner) @function.outer

(function_declaration "endfunction") @function.outer

(function_expression
  body: (statement_block) @function.inner) @function.outer

(arrow_function
  body: (statement_block) @function.inner) @function.outer

(arrow_function
  body: (expression) @function.inner) @function.outer

; ── Parameters ────────────────────────────────────────────────────────────────

(formal_parameters (_) @parameter.inner)
(formal_parameters (_) @parameter.outer)

; ── Conditionals ──────────────────────────────────────────────────────────────

(if_statement
  consequence: (statement_block) @conditional.inner) @conditional.outer

(if_alt_statement) @conditional.outer

; ── Loops ─────────────────────────────────────────────────────────────────────

(for_statement
  body: (statement_block) @loop.inner) @loop.outer

(for_in_statement
  body: (statement_block) @loop.inner) @loop.outer

(while_statement
  body: (statement_block) @loop.inner) @loop.outer

(for_alt_statement)    @loop.outer
(for_in_alt_statement) @loop.outer
(while_alt_statement)  @loop.outer

; ── Calls ─────────────────────────────────────────────────────────────────────

(call_expression
  arguments: (arguments) @call.inner) @call.outer

; ── Blocks ────────────────────────────────────────────────────────────────────

(statement_block) @block.outer
(statement_block (_) @block.inner)
