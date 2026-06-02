; Text-object queries for nvim-treesitter-textobjects.
; Provides @function, @parameter, @conditional, @loop, @call, and @block
; text objects for ucode source files.

; -------------------------------------------------------------------------
; Functions
; -------------------------------------------------------------------------

; Brace-body function declaration
(function_declaration
  body: (statement_block) @function.inner) @function.outer

; Colon-body function declaration (function f(): ... endfunction)
(function_declaration
  "endfunction" @_end
  (#make-range! "function.inner" @_end @_end)) @function.outer

(function_expression
  body: (statement_block) @function.inner) @function.outer

(arrow_function
  body: (statement_block) @function.inner) @function.outer

(arrow_function
  body: [(number)(string)(identifier)(call_expression)(binary_expression)
         (unary_expression)(member_expression)(subscript_expression)
         (ternary_expression)(object)(array)(template_string)] @function.inner) @function.outer

; -------------------------------------------------------------------------
; Parameters
; -------------------------------------------------------------------------

(formal_parameters
  (_) @parameter.inner @parameter.outer)

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
; -------------------------------------------------------------------------

(statement_block) @block.outer
