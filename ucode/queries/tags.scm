; Tags queries for ucode.
; Used by GitHub code navigation and tools that index symbol definitions.
;
; NOTE on #strip! and #select-adjacent!: tree-sitter-tags (`tree-sitter tags`,
; GitHub code navigation) applies both. To other query consumers they are
; plain metadata: one that reads @doc verbatim gets the raw `/** ... */` text
; with its `*` characters, and may attach a comment from several lines above
; to the wrong definition. Semantics:
;   #strip! @capture <regex>        — strip text matching <regex> from the
;                                      start/end of @capture's text.
;   #select-adjacent! @a @b         — only keep this match if @a is on a line
;                                      immediately preceding @b (no blank
;                                      lines or other statements between).

; -------------------------------------------------------------------------
; Function definitions — named declarations (brace body or endfunction body)
; -------------------------------------------------------------------------

(
  (comment)* @doc
  .
  (function_declaration
    name: (identifier) @name) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; -------------------------------------------------------------------------
; Function definitions — named function expressions
; -------------------------------------------------------------------------

(
  (comment)* @doc
  .
  (function_expression
    name: (identifier) @name) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; -------------------------------------------------------------------------
; Function definitions — let/const assigned a function or arrow
; -------------------------------------------------------------------------

(
  (comment)* @doc
  .
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [(function_expression) (arrow_function)])) @definition.function
  (#strip! @doc "^[\\s\\*/]+|[\\s\\*/]+$")
  (#select-adjacent! @doc @definition.function)
)

; -------------------------------------------------------------------------
; Function definitions — assignment of function to variable or property
; -------------------------------------------------------------------------

(assignment_expression
  left: [
    (identifier) @name
    (member_expression
      property: (property_identifier) @name)
  ]
  right: [(function_expression) (arrow_function)]) @definition.function

; -------------------------------------------------------------------------
; Function definitions — object method pairs  { key: function() {} }
; -------------------------------------------------------------------------

(pair
  key: (property_identifier) @name
  value: [(function_expression) (arrow_function)]) @definition.function

; -------------------------------------------------------------------------
; Constants — exported scalar / expression values
; -------------------------------------------------------------------------

(
  (comment)* @doc
  .
  (export_statement
    (lexical_declaration
      (variable_declarator
        name: (identifier) @name
        value: [
          ; every expression except a function (tagged as a function above)
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

; -------------------------------------------------------------------------
; References — function calls
; -------------------------------------------------------------------------

; Calls to ucode's builtins (the same list as highlights.scm) are not
; references to anything in the code base.
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
