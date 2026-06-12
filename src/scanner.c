/*
 * External scanner for ucode / ucode-markup.
 *
 * Stateless: no malloc, no serialize state.  All disambiguation is driven by
 * the `valid_symbols` array that tree-sitter passes on every call.
 *
 * Token order MUST match the `externals` array in grammar.js:
 *   0  AUTOMATIC_SEMICOLON   $._automatic_semicolon
 *   1  TEMPLATE_CHARS        $._template_chars
 *   2  TERNARY_QMARK         $._ternary_qmark
 *   3  RAW_TEXT              $.raw_text
 *   4  STATEMENT_TAG_OPEN    $.statement_tag_open   {%  {%-  {%+
 *   5  STATEMENT_TAG_CLOSE   $.statement_tag_close  %}  -%}
 *   6  EXPRESSION_TAG_OPEN   $.expression_tag_open  {{  {{-
 *   7  EXPRESSION_TAG_CLOSE  $.expression_tag_close }}  -}}
 */

#include "tree_sitter/parser.h"
#include <wctype.h>

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
    RAW_TEXT,
    STATEMENT_TAG_OPEN,
    STATEMENT_TAG_CLOSE,
    EXPRESSION_TAG_OPEN,
    EXPRESSION_TAG_CLOSE,
};

void *tree_sitter_ucode_external_scanner_create(void) { return NULL; }
void  tree_sitter_ucode_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_ucode_external_scanner_serialize(void *p, char *b) { (void)p; (void)b; return 0; }
void  tree_sitter_ucode_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    (void)p; (void)b; (void)n;
}

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

/* -------------------------------------------------------------------------
 * Markup-mode tokens
 * ---------------------------------------------------------------------- */

/*
 * Scan raw text: everything outside a tag delimiter.
 * Stops (without consuming) before { followed by %, {, or #.
 */
static bool scan_raw_text(TSLexer *lexer) {
    lexer->result_symbol = RAW_TEXT;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '\0') return has_content;
        if (lexer->lookahead == '{') {
            advance(lexer);
            if (lexer->lookahead == '%' ||
                lexer->lookahead == '{' ||
                lexer->lookahead == '#')
                return has_content;
            /* lone '{' — will be committed on the next iteration's mark_end */
        } else {
            advance(lexer);
        }
    }
}

/*
 * Scan statement tag open: {%  {%-  {%+
 */
static bool scan_statement_tag_open(TSLexer *lexer) {
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    if (lexer->lookahead != '%') return false;
    advance(lexer);
    if (lexer->lookahead == '-' || lexer->lookahead == '+') advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = STATEMENT_TAG_OPEN;
    return true;
}

/*
 * Scan statement tag close: %}  -%}
 */
static bool scan_statement_tag_close(TSLexer *lexer) {
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != '%') return false;
        advance(lexer);
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    } else if (lexer->lookahead == '%') {
        advance(lexer);
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    } else {
        return false;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = STATEMENT_TAG_CLOSE;
    return true;
}

/*
 * Scan expression tag open: {{  {{-
 */
static bool scan_expression_tag_open(TSLexer *lexer) {
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    if (lexer->lookahead == '-') advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = EXPRESSION_TAG_OPEN;
    return true;
}

/*
 * Scan expression tag close: }}  -}}
 */
static bool scan_expression_tag_close(TSLexer *lexer) {
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != '}') return false;
        advance(lexer);
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    } else if (lexer->lookahead == '}') {
        advance(lexer);
        if (lexer->lookahead != '}') return false;
        advance(lexer);
    } else {
        return false;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = EXPRESSION_TAG_CLOSE;
    return true;
}

/* -------------------------------------------------------------------------
 * Code-mode tokens (carried over and extended from the original scanner)
 * ---------------------------------------------------------------------- */

static bool scan_template_chars(TSLexer *lexer) {
    lexer->result_symbol = TEMPLATE_CHARS;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        switch (lexer->lookahead) {
            case '`': return has_content;
            case '\0': return false;
            case '$':
                advance(lexer);
                if (lexer->lookahead == '{') return has_content;
                break;
            case '\\': return has_content;
            default: advance(lexer);
        }
    }
}

/*
 * Return true if the lookahead is the start of %} or -%} (statement tag
 * close).  Used during ASI scanning to allow a zero-length semicolon to be
 * inserted immediately before the tag close without consuming any characters.
 */
static bool lookahead_is_stmt_close(TSLexer *lexer) {
    if (lexer->lookahead == '%') {
        advance(lexer);
        return lexer->lookahead == '}';
    }
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead == '%') {
            advance(lexer);
            return lexer->lookahead == '}';
        }
    }
    return false;
}

/*
 * Automatic Semicolon Insertion (ECMA-262 §12.10).
 *
 * Extended to allow ASI immediately before %} and -%} so that the last
 * statement in a statement tag does not need an explicit trailing semicolon:
 *   {% let x = 1 %}      — works without a semicolon
 *   {% return val %}     — works without a semicolon
 *
 * The tag-close characters are never consumed; mark_end stays at position 0,
 * so the zero-length semicolon token is emitted and the scanner is called
 * again immediately at the same position for STATEMENT_TAG_CLOSE.
 */
static bool scan_automatic_semicolon(TSLexer *lexer) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    /* ECMAScript rule 1: '}' → insert */
    if (lexer->lookahead == '}') return true;
    /* ECMAScript rule 3: EOF → insert */
    if (lexer->lookahead == 0) return true;

    /* Ucode extension: %} or -%} at end of statement tag → insert */
    if (lexer->lookahead == '%' || lexer->lookahead == '-') {
        if (lookahead_is_stmt_close(lexer)) return true;
        /* lookahead_is_stmt_close advanced but mark_end is still at 0,
           so the peek is harmless — return false to suppress ASI for
           regular '-' or '%' continuations. */
        return false;
    }

    /*
     * ECMAScript rule 2: scan for a line terminator before the next token.
     * Skip inline whitespace and comments; bail on anything else on the
     * same line.
     */
    for (;;) {
        if (lexer->lookahead == 0) return true;
        if (lexer->lookahead == '}') return true;

        if (lexer->lookahead == '\r' || lexer->lookahead == '\n' ||
            lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
            skip(lexer);
            break; /* found line terminator */
        }

        if (iswspace(lexer->lookahead)) { skip(lexer); continue; }

        /* Line comment — skip to end of line */
        if (lexer->lookahead == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 &&
                       lexer->lookahead != '\r' && lexer->lookahead != '\n' &&
                       lexer->lookahead != 0x2028 && lexer->lookahead != 0x2029)
                    skip(lexer);
                continue;
            }
            /* Block comment — check for embedded newline */
            if (lexer->lookahead == '*') {
                skip(lexer);
                bool has_newline = false;
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '\r' || lexer->lookahead == '\n' ||
                        lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029)
                        has_newline = true;
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') { skip(lexer); break; }
                    } else {
                        skip(lexer);
                    }
                }
                if (has_newline) break;
                continue;
            }
            /* Division slash — not a comment, no ASI */
            return false;
        }

        /* %} / -%} on the same line as the expression: still allow ASI */
        if (lexer->lookahead == '%' || lexer->lookahead == '-') {
            if (lookahead_is_stmt_close(lexer)) return true;
            return false;
        }

        /* Any other non-whitespace on the same line → no ASI */
        return false;
    }

    /*
     * Found a line terminator.  Skip trailing whitespace/comments after it,
     * then check whether the next real token would suppress ASI.
     */
    for (;;) {
        if (lexer->lookahead == 0) return true;

        if (iswspace(lexer->lookahead)) { skip(lexer); continue; }

        if (lexer->lookahead == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 &&
                       lexer->lookahead != '\r' && lexer->lookahead != '\n' &&
                       lexer->lookahead != 0x2028 && lexer->lookahead != 0x2029)
                    skip(lexer);
                continue;
            }
            if (lexer->lookahead == '*') {
                skip(lexer);
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') { skip(lexer); break; }
                    } else {
                        skip(lexer);
                    }
                }
                continue;
            }
            return false; /* division slash after newline → no ASI */
        }
        break;
    }

    /*
     * Tokens that can continue the prior expression suppress ASI.
     * %} and -%} are tag closers and always allow ASI even though they
     * start with '%' or '-'.
     */
    switch (lexer->lookahead) {
        case '(': case '[': case '`':
        case '.': case ',': case ';':
        case '+': case '*':
        case '=': case '<': case '>': case '!': case '~':
        case '&': case '|': case '^': case '?':
            return false;
        case '-':
        case '%':
            if (lookahead_is_stmt_close(lexer)) return true;
            return false;
        default:
            return true;
    }
}

static bool scan_ternary_qmark(TSLexer *lexer) {
    while (lexer->lookahead != '\r' && lexer->lookahead != '\n' &&
           lexer->lookahead != 0x2028 && lexer->lookahead != 0x2029 &&
           iswspace(lexer->lookahead))
        skip(lexer);

    if (lexer->lookahead != '?') return false;
    advance(lexer);

    if (lexer->lookahead == '?') return false; /* nullish coalescing */

    lexer->mark_end(lexer);
    lexer->result_symbol = TERNARY_QMARK;

    if (lexer->lookahead == '.') {
        advance(lexer);
        return iswdigit(lexer->lookahead); /* ?. followed by digit is ternary */
    }

    return true;
}

/* -------------------------------------------------------------------------
 * Main dispatch
 * ---------------------------------------------------------------------- */

bool tree_sitter_ucode_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    (void)payload;

    /*
     * Error-recovery guard.
     *
     * During error recovery tree-sitter sets every external token valid at
     * once.  AUTOMATIC_SEMICOLON (code context) and RAW_TEXT (markup context)
     * are never simultaneously valid in a normal parse, so their co-presence
     * signals error recovery.  Return false so the parser uses its own grammar
     * tokens for recovery instead of the scanner consuming raw_text.
     */
    if (valid_symbols[AUTOMATIC_SEMICOLON] && valid_symbols[RAW_TEXT])
        return false;

    /*
     * Template chars: only when we are unambiguously inside a template
     * literal body (not competing with ASI).
     */
    if (valid_symbols[TEMPLATE_CHARS] && !valid_symbols[AUTOMATIC_SEMICOLON])
        return scan_template_chars(lexer);

    /*
     * Markup-mode tokens.
     *
     * scan_raw_text stops before {%, {{, and {# and returns false when
     * positioned right at a tag opener (no content before it).
     * Tree-sitter restores the lexer position when a scanner returns false,
     * so the tag-open scanners see the '{' as their first character.
     */
    if (valid_symbols[RAW_TEXT]) {
        if (scan_raw_text(lexer)) return true;
    }
    if (valid_symbols[STATEMENT_TAG_OPEN]) {
        if (scan_statement_tag_open(lexer)) return true;
    }
    if (valid_symbols[EXPRESSION_TAG_OPEN]) {
        if (scan_expression_tag_open(lexer)) return true;
    }

    /*
     * Tag close tokens.  Checked before ASI so that %} / -%} / }} / -}}
     * are preferred over a zero-length semicolon when both are valid.
     * When neither matches, fall through to ASI.
     */
    if (valid_symbols[STATEMENT_TAG_CLOSE]) {
        if (scan_statement_tag_close(lexer)) return true;
    }
    if (valid_symbols[EXPRESSION_TAG_CLOSE]) {
        if (scan_expression_tag_close(lexer)) return true;
    }

    /* ASI and ternary */
    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        if (scan_automatic_semicolon(lexer)) return true;
        if (valid_symbols[TERNARY_QMARK]) return scan_ternary_qmark(lexer);
        return false;
    }

    if (valid_symbols[TERNARY_QMARK])
        return scan_ternary_qmark(lexer);

    return false;
}
