; Highlight queries for ucode.
; Capture names follow the tree-sitter / nvim-treesitter standard.

; -------------------------------------------------------------------------
; Identifiers
; -------------------------------------------------------------------------

(identifier) @variable
(property_identifier) @variable.member
(shorthand_property_identifier) @variable.member

; -------------------------------------------------------------------------
; Built-in / special values
; -------------------------------------------------------------------------

(this) @variable.builtin
[(true) (false)] @boolean
(null) @constant.builtin

; -------------------------------------------------------------------------
; Comments
; -------------------------------------------------------------------------

(comment) @comment @spell

; -------------------------------------------------------------------------
; Shebang
; -------------------------------------------------------------------------

(hash_bang_line) @keyword.directive

; -------------------------------------------------------------------------
; Literals
; -------------------------------------------------------------------------

(number) @number

(string) @string
(string (escape_sequence) @string.escape)

(template_string) @string
(template_string (escape_sequence) @string.escape)
(template_substitution "${" @punctuation.special)
(template_substitution "}" @punctuation.special)

(regex) @string.regexp

; -------------------------------------------------------------------------
; Functions — definitions
; -------------------------------------------------------------------------

(function_declaration
  name: (identifier) @function)

(function_expression
  name: (identifier) @function)

; Method-style object entries: { key: function() {} }  or  { key: () => {} }
(pair
  key: (property_identifier) @function.method
  value: [(function_expression) (arrow_function)])

; -------------------------------------------------------------------------
; Functions — calls
; -------------------------------------------------------------------------

(call_expression
  function: (identifier) @function.call)

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method.call))

; -------------------------------------------------------------------------
; Parameters
; -------------------------------------------------------------------------

(formal_parameters (identifier) @variable.parameter)
(rest_element (identifier) @variable.parameter)
(arrow_function parameter: (identifier) @variable.parameter)

; -------------------------------------------------------------------------
; Keywords — conditional
; -------------------------------------------------------------------------

["if" "elif" "else" "endif"] @keyword.conditional
["switch" "case"] @keyword.conditional
; `default` is context-scoped (not in the list above) so it never overlaps with
; the export patterns below. That keeps highlighting correct under both
; first-match-wins engines (Helix / tree-sitter-highlight) and last-match-wins
; engines (nvim-treesitter): every `default` token is matched by exactly one
; pattern, so match order is irrelevant.
(switch_default "default" @keyword.conditional)

; -------------------------------------------------------------------------
; Keywords — loops
; -------------------------------------------------------------------------

["for" "endfor" "while" "endwhile"] @keyword.repeat

; -------------------------------------------------------------------------
; Keywords — functions
; -------------------------------------------------------------------------

["function" "endfunction"] @keyword.function

; -------------------------------------------------------------------------
; Keywords — control
; -------------------------------------------------------------------------

"return" @keyword.return
["break" "continue"] @keyword

; -------------------------------------------------------------------------
; Keywords — exceptions
; -------------------------------------------------------------------------

["try" "catch"] @keyword.exception

; -------------------------------------------------------------------------
; Keywords — modules
; -------------------------------------------------------------------------

["import" "export"] @keyword.import
["as" "from"] @keyword.import

; 'default' in a module context (export or import) is a module keyword, not a
; conditional. The switch `default` is captured separately above, so together
; with these the every-`default`-matched-exactly-once invariant holds:
; `export default`, `export { x as default }`, and `import { default as x }`
; (whose name goes through _module_export_name) each match one pattern here —
; no priority/order reliance.
(export_statement "default" @keyword.import)
(export_specifier "default" @keyword.import)
(import_specifier "default" @keyword.import)

; -------------------------------------------------------------------------
; Keywords — storage / operators
; -------------------------------------------------------------------------

["const" "let"] @keyword.storage
["delete" "in"] @keyword.operator

; -------------------------------------------------------------------------
; Operators
; -------------------------------------------------------------------------

[
  "=" "+=" "-=" "*=" "/=" "%=" "**="
  "^=" "&=" "|=" ">>=" "<<=" "&&=" "||=" "??="
] @operator

[
  "+" "-" "*" "/" "%" "**"
  "&" "|" "^" "~" "<<" ">>"
  "!" "&&" "||" "??"
  "==" "!=" "===" "!=="
  "<" ">" "<=" ">="
  "++" "--"
  "=>"
  "..."
] @operator

(optional_chain) @operator
(ternary_expression "?" @operator)
(ternary_expression ":" @operator)

; -------------------------------------------------------------------------
; Punctuation
; -------------------------------------------------------------------------

["," ";"] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
