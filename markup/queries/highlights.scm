; Markup-mode highlights for ucode_markup grammar
; (.utpl / .uc.tmpl files)

; ── Tag delimiters ────────────────────────────────────────────────────────────

(statement_tag_open)  @punctuation.special
(statement_tag_close) @punctuation.special
(expression_tag_open)  @punctuation.special
(expression_tag_close) @punctuation.special

; ── Comment tags ─────────────────────────────────────────────────────────────

(comment_tag) @comment

; ── Alt-syntax structural keywords ────────────────────────────────────────────
;
; These tokens appear between the tag-open external token and the close of the
; alt header (before the : that ends the condition/header).  They are not
; injected — they are literal tokens visible in the ucode_markup parse tree.

"if"       @keyword.control
"elif"     @keyword.control
"else"     @keyword.control
"endif"    @keyword.control
"for"      @keyword.control
"endfor"   @keyword.control
"while"    @keyword.control
"endwhile" @keyword.control
"in"       @keyword.operator

":"        @punctuation.delimiter

; ── Code tokens inside statement/expression tags are highlighted via injection ─
; (see markup/queries/injections.scm)
