; Locals queries for ucode.
; Used by editors for rename, go-to-definition, and scope-aware highlight.

; -------------------------------------------------------------------------
; Scopes
; -------------------------------------------------------------------------

(function_declaration) @local.scope
; function_forward_declaration has no body — it is a definition, not a scope
(function_expression) @local.scope
(arrow_function) @local.scope
; statement_block provides block scoping for let/const
(statement_block) @local.scope
; for loops scope their initialiser variable(s) to the loop body
(for_statement) @local.scope
(for_alt_statement) @local.scope
(for_in_statement) @local.scope
(for_in_alt_statement) @local.scope

; -------------------------------------------------------------------------
; Definitions — functions
; -------------------------------------------------------------------------

(function_declaration
  name: (identifier) @local.definition.function)

(function_forward_declaration
  name: (identifier) @local.definition.function)

(function_expression
  name: (identifier) @local.definition.function)

; -------------------------------------------------------------------------
; Definitions — variables
; -------------------------------------------------------------------------

(variable_declarator
  name: (identifier) @local.definition.var)

; -------------------------------------------------------------------------
; Definitions — parameters
; -------------------------------------------------------------------------

(formal_parameters (identifier) @local.definition.parameter)
(rest_element (identifier) @local.definition.parameter)
(arrow_function parameter: (identifier) @local.definition.parameter)

; catch clause binding
(catch_clause
  parameter: (identifier) @local.definition.var)

; -------------------------------------------------------------------------
; Definitions — for-in loop variables
; -------------------------------------------------------------------------

(for_in_statement
  left: (identifier) @local.definition.var)
(for_in_statement
  value: (identifier) @local.definition.var)
(for_in_alt_statement
  left: (identifier) @local.definition.var)
(for_in_alt_statement
  value: (identifier) @local.definition.var)

; -------------------------------------------------------------------------
; Definitions — imports
; -------------------------------------------------------------------------

; import def from "./mod.uc"
(import_clause (identifier) @local.definition.import)

; import * as ns from "./mod.uc"
(namespace_import (identifier) @local.definition.import)

; import { a } from "./mod.uc"  — name IS the local binding (no alias)
(import_specifier
  name: (identifier) @local.definition.import
  !alias)

; import { a as x } from "./mod.uc"  — only the alias is the local binding
(import_specifier
  alias: (identifier) @local.definition.import)

; -------------------------------------------------------------------------
; References
; -------------------------------------------------------------------------

(identifier) @local.reference
