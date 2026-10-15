; Tags queries for ucdocs (JSDoc-style doc comments).
;
; A `@typedef` defines a named type; type expressions reference named types
; and modules.

(typedef_tag
  name: (_) @name) @definition.type

(named_type
  name: (type_identifier) @name) @reference.type

(module_type
  path: (module_path) @name) @reference.module
