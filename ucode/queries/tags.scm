; #strip! and #select-adjacent! are applied only by tree-sitter-tags; other
; consumers get the raw comment and must check adjacency themselves.

; Function declarations

(
  [(comment) (doc_comment)]* @doc
  .
  (function_declaration
    name: (identifier) @name) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; Named function expressions

(
  [(comment) (doc_comment)]* @doc
  .
  (function_expression
    name: (identifier) @name) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; let/const bound to a function

(
  [(comment) (doc_comment)]* @doc
  .
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(function_expression) (arrow_function)])) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; Function assigned to a variable or property

(assignment_expression
  left: [
    (identifier) @name
    (member_expression
      property: (property_identifier) @name)
  ]
  right: [(function_expression) (arrow_function)]) @definition.function

; { key: function() {} }

(pair
  key: (property_identifier) @name
  value: [(function_expression) (arrow_function)]) @definition.function

; Exported non-function constants

(
  [(comment) (doc_comment)]* @doc
  .
  (export_statement
    (lexical_declaration
      (variable_declarator
        name: (identifier) @name
        value: [
          ; every expression but a function
          (assignment_expression) (augmented_assignment_expression)
          (binary_expression) (delete_expression) (ternary_expression)
          (unary_expression) (update_expression)
          (array) (call_expression) (false) (identifier) (member_expression)
          (null) (number) (object) (parenthesized_expression) (regex) (string)
          (subscript_expression) (template_string) (this) (true)
        ])) @definition.constant)
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.constant)
)

; Calls, except to builtins (the list in highlights.scm)
(
  (call_expression
    function: (identifier) @name) @reference.call
  (#not-any-of? @name
    "arrtoip" "assert" "b64dec" "b64enc" "call" "chr" "clock" "die"
    "exists" "exit" "filter" "gc" "getenv" "gmtime" "hex" "hexdec"
    "hexenc" "include" "index" "int" "iptoarr" "join" "json" "keys" "lc"
    "length" "loadfile" "loadstring" "localtime" "ltrim" "map" "match"
    "max" "min" "ord" "pop" "print" "printf" "proto" "push" "regexp"
    "render" "replace" "require" "reverse" "rindex" "rtrim" "shift"
    "signal" "sleep" "slice" "sort" "sourcepath" "splice" "split"
    "sprintf" "substr" "system" "time" "timegm" "timelocal" "trace" "trim"
    "type" "uc" "uchr" "uniq" "unshift" "values" "warn" "wildcard")
)

(call_expression
  function: (member_expression
    property: (property_identifier) @name)) @reference.call
