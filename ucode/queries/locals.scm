; Plain @local.definition (all tree-sitter-highlight and -tags accept); the
; kind is `#set! local.kind`, which the Helix generator turns into
; @local.definition.<scope>.

; Scopes

(program) @local.scope
(function_declaration) @local.scope
(function_expression) @local.scope
(arrow_function) @local.scope
(statement_block) @local.scope
(for_statement) @local.scope
(for_alt_statement) @local.scope
(for_in_statement) @local.scope
(for_in_alt_statement) @local.scope
(catch_clause) @local.scope
; Alt-syntax bodies and switches are scopes too.
(statement_list) @local.scope
(switch_body) @local.scope

; Definitions — functions

; A declaration's name belongs to the enclosing scope. tree-sitter does not
; act on `definition.function.scope parent`: consumers must apply it.
(function_declaration
  name: (identifier) @local.definition
  (#set! local.kind function)
  (#set! definition.function.scope parent))

; A function expression's name is visible only inside it.
(function_expression
  name: (identifier) @local.definition
  (#set! local.kind function))

; Definitions — variables

(variable_declarator
  name: (identifier) @local.definition
  (#set! local.kind var))

; Definitions — parameters

(formal_parameters
  (identifier) @local.definition
  (#set! local.kind parameter))
(rest_element
  (identifier) @local.definition
  (#set! local.kind parameter))
(arrow_function
  parameter: (identifier) @local.definition
  (#set! local.kind parameter))

(catch_clause
  parameter: (identifier) @local.definition
  (#set! local.kind var))

; Definitions — for-in variables, only with let/const: a bare
; `for (k in obj)` assigns an existing variable.

(for_in_statement
  kind: _
  variable: (identifier) @local.definition
  (#set! local.kind var))
(for_in_statement
  kind: _
  key: (identifier) @local.definition
  (#set! local.kind var))
(for_in_statement
  kind: _
  value: (identifier) @local.definition
  (#set! local.kind var))
(for_in_alt_statement
  kind: _
  variable: (identifier) @local.definition
  (#set! local.kind var))
(for_in_alt_statement
  kind: _
  key: (identifier) @local.definition
  (#set! local.kind var))
(for_in_alt_statement
  kind: _
  value: (identifier) @local.definition
  (#set! local.kind var))

; Definitions — imports

; import def from "./mod.uc"
(import_clause
  (identifier) @local.definition
  (#set! local.kind import))

; import * as ns from "./mod.uc"
(namespace_import
  (identifier) @local.definition
  (#set! local.kind import))

; import { a } from "./mod.uc"
(import_specifier
  name: (identifier) @local.definition
  !alias
  (#set! local.kind import))

; import { a as x } from "./mod.uc"
(import_specifier
  alias: (identifier) @local.definition
  (#set! local.kind import))

; References

(identifier) @local.reference
