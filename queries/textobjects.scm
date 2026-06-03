; Text-object queries for nvim-treesitter-textobjects.
; Provides @function, @parameter, @conditional, @loop, @call, and @block
; text objects for ucode source files.

; -------------------------------------------------------------------------
; Functions
; -------------------------------------------------------------------------

; Brace-body function declaration
(function_declaration
  body: (statement_block) @function.inner) @function.outer

; Colon-body function declaration — outer only; no block node to target for inner
(function_declaration "endfunction") @function.outer

(function_expression
  body: (statement_block) @function.inner) @function.outer

(arrow_function
  body: (statement_block) @function.inner) @function.outer

; Arrow function with expression body (no braces).
; Uses the 'expression' supertype so all expression forms are matched
; without an explicit enumeration — including update_expression (x => x++),
; assignment_expression (x => y = 1), and any type added to the grammar later.
(arrow_function
  body: (expression) @function.inner) @function.outer

; -------------------------------------------------------------------------
; Parameters
;
; @parameter.inner — the parameter node itself
; @parameter.outer — same node; nvim-treesitter-textobjects extends the
;   selection to absorb adjacent ',' delimiters automatically when the
;   capture name ends in .outer
; -------------------------------------------------------------------------

(formal_parameters (_) @parameter.inner)
(formal_parameters (_) @parameter.outer)

; -------------------------------------------------------------------------
; Conditionals
; -------------------------------------------------------------------------

(if_statement
  consequence: (statement_block) @conditional.inner) @conditional.outer

(if_alt_statement) @conditional.outer

; -------------------------------------------------------------------------
; Loops
; -------------------------------------------------------------------------

(for_statement
  body: (statement_block) @loop.inner) @loop.outer

(for_in_statement
  body: (statement_block) @loop.inner) @loop.outer

(while_statement
  body: (statement_block) @loop.inner) @loop.outer

(for_alt_statement) @loop.outer
(for_in_alt_statement) @loop.outer
(while_alt_statement) @loop.outer

; -------------------------------------------------------------------------
; Calls
; -------------------------------------------------------------------------

(call_expression
  arguments: (arguments) @call.inner) @call.outer

; -------------------------------------------------------------------------
; Blocks
;
; @block.outer — the full statement_block including braces
; @block.inner — named children only; nvim-treesitter-textobjects selects
;   from the first to the last captured child, covering the block interior
;   without needing the deprecated #make-range! predicate
; -------------------------------------------------------------------------

(statement_block) @block.outer
(statement_block (_) @block.inner)
