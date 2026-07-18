; Markup-mode highlights for ucode_markup grammar
; (.uc.tmpl files)

; ── Tag delimiters ────────────────────────────────────────────────────────────

(statement_tag_open)        @punctuation.special
(statement_tag_trim_open)   @punctuation.special
(statement_tag_lstrip_open) @punctuation.special
(statement_tag_close)       @punctuation.special
(statement_tag_trim_close)  @punctuation.special
(expression_tag_open)       @punctuation.special
(expression_tag_trim_open)  @punctuation.special
(expression_tag_close)      @punctuation.special
(expression_tag_trim_close) @punctuation.special

; ── Comment tags ─────────────────────────────────────────────────────────────

(comment_tag) @comment

; ── Alt-syntax and brace-spanning structural keywords ─────────────────────────
;
; These tokens appear between the tag-open external token and the close of the
; header (before the `:` or `{` that ends the condition/header).  They are not
; injected — they are literal tokens visible in the ucode_markup parse tree.
; "function"/"endfunction"/"try"/"catch" only ever appeared inside an already-
; injected statement_tag until function_alt_declaration and the brace-spanning
; _tag rules existed as bare markup-level tokens, so they were never listed
; here before.

["if" "elif" "else" "endif"]        @keyword.conditional
["for" "endfor" "while" "endwhile"] @keyword.repeat
["function" "endfunction"]          @keyword.function
["try" "catch"]                     @keyword.exception
"in"                                @keyword.operator

; Each alt-statement rule is split in grammar.js into a code-only form (used
; when the alt-syntax appears inside a single statement_tag's code) and a
; markup-only `_tag` form (spanning tag boundaries) — both need their own
; pattern here since they are now distinct node types.
(if_alt_statement         ":" @punctuation.delimiter)
(if_alt_statement_tag     ":" @punctuation.delimiter)
(elif_clause_tag          ":" @punctuation.delimiter)
(for_alt_statement        ":" @punctuation.delimiter)
(for_alt_statement_tag    ":" @punctuation.delimiter)
(for_in_alt_statement     ":" @punctuation.delimiter)
(for_in_alt_statement_tag ":" @punctuation.delimiter)
(while_alt_statement      ":" @punctuation.delimiter)
(while_alt_statement_tag  ":" @punctuation.delimiter)
(function_declaration     ":" @punctuation.delimiter)
(function_alt_declaration ":" @punctuation.delimiter)

; Brace-spanning forms (see if_statement_tag in grammar.js): the `{`/`}` pair
; is a structural delimiter here exactly like `:`/`endif` are for the
; alt-syntax forms above, so it gets the same bracket treatment the code
; grammar gives every other brace (queries/highlights.scm's
; ["(" ")" "[" "]" "{" "}"] @punctuation.bracket) — these braces are never
; reached by that pattern since they are not part of any injected region.
(if_statement_tag         ["{" "}"] @punctuation.bracket)
(elseif_clause_tag        ["{" "}"] @punctuation.bracket)
(else_clause_tag          ["{" "}"] @punctuation.bracket)
(for_statement_tag        ["{" "}"] @punctuation.bracket)
(for_in_statement_tag     ["{" "}"] @punctuation.bracket)
(while_statement_tag      ["{" "}"] @punctuation.bracket)
(function_declaration_tag ["{" "}"] @punctuation.bracket)
(try_statement_tag        ["{" "}"] @punctuation.bracket)
(catch_clause_tag         ["{" "}"] @punctuation.bracket)

; ── Code tokens inside statement/expression tags are highlighted via injection ─
; (see markup/queries/injections.scm)
