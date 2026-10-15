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

; @spell first: tree-sitter-highlight keeps the LAST capture of a node, so
; `(comment) @comment @spell` would leave comments with no highlight there.
(comment) @spell
(comment) @comment

; Doc comments (the ones ucdocs is injected into; see injections.scm).
((comment) @comment.documentation
  (#match? @comment.documentation "^/\\*\\*[^*/]"))

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

; Builtins: ucode's stdlib functions (uc_stdlib_functions in lib.c, at the
; release this grammar targets) when called, and the globals the interpreter
; defines. After the generic patterns above, so these win. `modules` is left
; out: it is also a common variable name.
(call_expression
  function: (identifier) @function.builtin
  (#any-of? @function.builtin
    "arrtoip" "assert" "b64dec" "b64enc" "call" "chr" "clock" "die"
    "exists" "exit" "filter" "gc" "getenv" "gmtime" "hex" "hexdec"
    "hexenc" "include" "index" "int" "iptoarr" "join" "json" "keys" "lc"
    "length" "loadfile" "loadstring" "localtime" "ltrim" "map" "match"
    "max" "min" "ord" "pop" "print" "printf" "proto" "push" "regexp"
    "render" "replace" "require" "reverse" "rindex" "rtrim" "shift"
    "signal" "sleep" "slice" "sort" "sourcepath" "splice" "split"
    "sprintf" "substr" "system" "time" "timegm" "timelocal" "trace" "trim"
    "type" "uc" "uchr" "uniq" "unshift" "values" "warn" "wildcard"))

((identifier) @variable.builtin
  (#any-of? @variable.builtin "ARGV" "SCRIPT_NAME" "REQUIRE_SEARCH_PATH" "global"))

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
; the export patterns below: every `default` token is matched by exactly one
; pattern, so the result does not depend on an engine's pattern-precedence rule.
; (Elsewhere this file relies on later patterns winning, as in Neovim, Helix
; since 24.03, and tree-sitter-highlight — e.g. `(identifier) @variable` first,
; refined by the function/parameter patterns after it.)
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

["," ";" "."] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket

; Overrides of the generic lists above, so they must come after them (the
; later pattern wins): the `}` closing `${…}` pairs with its `${`, and a
; regex's delimiting slashes are part of the regex, not division.
(template_substitution "}" @punctuation.special)
(regex "/" @string.regexp)

; `:` after an object key, a case label, or an alt-syntax header (`if (c):`,
; `function f():`). Listed by parent so these never touch the ternary `:`,
; which is an operator (see above).
(pair ":" @punctuation.delimiter)
(switch_case ":" @punctuation.delimiter)
(switch_default ":" @punctuation.delimiter)
(if_alt_statement ":" @punctuation.delimiter)
(elif_clause ":" @punctuation.delimiter)
(for_alt_statement ":" @punctuation.delimiter)
(for_in_alt_statement ":" @punctuation.delimiter)
(while_alt_statement ":" @punctuation.delimiter)
(function_declaration ":" @punctuation.delimiter)
