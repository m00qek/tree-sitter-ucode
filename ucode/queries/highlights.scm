; Capture names follow nvim-treesitter. Later patterns win (Neovim, Helix,
; tree-sitter-highlight), so generic patterns come first.

; Identifiers

(identifier) @variable
(property_identifier) @variable.member
(shorthand_property_identifier) @variable.member

; Built-in / special values

(this) @variable.builtin
[(true) (false)] @boolean
(null) @constant.builtin

; Comments

; @spell first: tree-sitter-highlight keeps a node's last capture.
(comment) @spell
(comment) @comment

(doc_comment) @spell
(doc_comment) @comment
(doc_comment) @comment.documentation

; Shebang

(hash_bang_line) @keyword.directive

; Literals

(number) @number

(string) @string
(string (escape_sequence) @string.escape)

(template_string) @string
(template_string (escape_sequence) @string.escape)
(template_substitution "${" @punctuation.special)

(regex) @string.regexp

; Functions — definitions

(function_declaration
  name: (identifier) @function)

(function_expression
  name: (identifier) @function)

; { key: function() {} } and { key: () => {} }
(pair
  key: (property_identifier) @function.method
  value: [(function_expression) (arrow_function)])

; Functions — calls

(call_expression
  function: (identifier) @function.call)

(call_expression
  function: (member_expression
    property: (property_identifier) @function.method.call))

; uc_stdlib_functions (lib.c) and interpreter globals. `modules` is left out:
; it is a common variable name.
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

; Parameters

(formal_parameters (identifier) @variable.parameter)
(rest_element (identifier) @variable.parameter)
(arrow_function parameter: (identifier) @variable.parameter)

; Keywords — conditional

["if" "elif" "else" "endif"] @keyword.conditional
["switch" "case"] @keyword.conditional
; Each `default` is matched by exactly one pattern (here or under Modules).
(switch_default "default" @keyword.conditional)

; Keywords — loops

["for" "endfor" "while" "endwhile"] @keyword.repeat

; Keywords — functions

["function" "endfunction"] @keyword.function

; Keywords — control

"return" @keyword.return
["break" "continue"] @keyword

; Keywords — exceptions

["try" "catch"] @keyword.exception

; Keywords — modules

["import" "export"] @keyword.import
["as" "from"] @keyword.import

(export_statement "default" @keyword.import)
(default) @keyword.import

; Keywords — storage / operators

["const" "let"] @keyword.storage
["delete" "in"] @keyword.operator

; Operators

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

; Punctuation

["," ";" "."] @punctuation.delimiter
["(" ")" "[" "]" "{" "}"] @punctuation.bracket

; Overrides of the lists above, so they must come after them.
(template_substitution "}" @punctuation.special)
(regex "/" @string.regexp)

; Non-ternary `:`, listed by parent.
(pair ":" @punctuation.delimiter)
(switch_case ":" @punctuation.delimiter)
(switch_default ":" @punctuation.delimiter)
(if_alt_statement ":" @punctuation.delimiter)
(elif_clause ":" @punctuation.delimiter)
(for_alt_statement ":" @punctuation.delimiter)
(for_in_alt_statement ":" @punctuation.delimiter)
(while_alt_statement ":" @punctuation.delimiter)
(function_declaration ":" @punctuation.delimiter)
