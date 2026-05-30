#include "tree_sitter/parser.h"
#include <wctype.h>

// Must match the order of externals in grammar.js
enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
};

void *tree_sitter_ucode_external_scanner_create(void) { return NULL; }
void tree_sitter_ucode_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_ucode_external_scanner_serialize(void *p, char *buf) { (void)p; (void)buf; return 0; }
void tree_sitter_ucode_external_scanner_deserialize(void *p, const char *buf, unsigned n) { (void)p; (void)buf; (void)n; }

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

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

// Implements the three ASI rules from ECMA-262 §12.10 (Automatic Semicolon
// Insertion): insert before a token that the grammar doesn't allow if (1) a
// line terminator precedes it, (2) it is `}`, or (3) the input is exhausted.
static bool scan_automatic_semicolon(TSLexer *lexer) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    // EOF is always a valid semicolon position
    if (lexer->lookahead == 0) return true;

    // `}` closes the current block — valid semicolon
    if (lexer->lookahead == '}') return true;

    // Skip whitespace and comments looking for a line terminator.
    // Per the ECMAScript spec, a line terminator inside a block comment
    // counts as a line terminator for ASI purposes.
    for (;;) {
        if (lexer->lookahead == 0) return true;
        if (lexer->lookahead == '}') return true;

        if (lexer->lookahead == '\r' || lexer->lookahead == '\n' ||
            lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
            skip(lexer);
            break;
        }

        // Skip inline whitespace (any Unicode space that is not a line terminator)
        if (iswspace(lexer->lookahead)) {
            skip(lexer);
            continue;
        }

        // Skip line comment or block comment
        if (lexer->lookahead == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && lexer->lookahead != '\r' &&
                       lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
                       lexer->lookahead != 0x2029) {
                    skip(lexer);
                }
                continue;
            }
            if (lexer->lookahead == '*') {
                skip(lexer);
                bool has_newline = false;
                while (lexer->lookahead != 0) {
                    if (lexer->lookahead == '\r' || lexer->lookahead == '\n' ||
                        lexer->lookahead == 0x2028 || lexer->lookahead == 0x2029) {
                        has_newline = true;
                        skip(lexer);
                    } else if (lexer->lookahead == '*') {
                        skip(lexer);
                        if (lexer->lookahead == '/') { skip(lexer); break; }
                    } else {
                        skip(lexer);
                    }
                }
                if (has_newline) break;
                continue;
            }
            // Not a comment — division or start of something else, no ASI
            return false;
        }

        // Any other non-whitespace on same line: no ASI
        return false;
    }

    // We found a line terminator. Skip whitespace and comments before
    // checking whether the next token could continue the expression.
    for (;;) {
        if (lexer->lookahead == 0) return true;

        if (iswspace(lexer->lookahead)) {
            skip(lexer);
            continue;
        }

        if (lexer->lookahead == '/') {
            skip(lexer);
            if (lexer->lookahead == '/') {
                skip(lexer);
                while (lexer->lookahead != 0 && lexer->lookahead != '\r' &&
                       lexer->lookahead != '\n' && lexer->lookahead != 0x2028 &&
                       lexer->lookahead != 0x2029) {
                    skip(lexer);
                }
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
            // Not a comment — treat like any other '/'
            return false;
        }

        break;
    }

    // Tokens that can continue the prior expression suppress ASI;
    // anything else (identifier, keyword, number, …) gets one inserted.
    switch (lexer->lookahead) {
        case '(': case '[': case '`':
        case '.': case ',': case ';':
        case '+': case '-': case '*': case '%':
        case '=': case '<': case '>': case '!': case '~':
        case '&': case '|': case '^': case '?':
            return false;
        default:
            return true;
    }
}

static bool scan_ternary_qmark(TSLexer *lexer) {
    while (lexer->lookahead != '\r' && lexer->lookahead != '\n' &&
           lexer->lookahead != 0x2028 && lexer->lookahead != 0x2029 &&
           iswspace(lexer->lookahead)) skip(lexer);

    if (lexer->lookahead != '?') return false;
    advance(lexer);

    // `??` is nullish coalescing, not ternary
    if (lexer->lookahead == '?') return false;

    lexer->mark_end(lexer);
    lexer->result_symbol = TERNARY_QMARK;

    // `?.` followed by digit is ternary (not optional chain)
    if (lexer->lookahead == '.') {
        advance(lexer);
        return iswdigit(lexer->lookahead);
    }

    return true;
}

bool tree_sitter_ucode_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[TEMPLATE_CHARS] && !valid_symbols[AUTOMATIC_SEMICOLON]) {
        return scan_template_chars(lexer);
    }

    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        if (scan_automatic_semicolon(lexer)) return true;
        if (valid_symbols[TERNARY_QMARK]) return scan_ternary_qmark(lexer);
        return false;
    }

    if (valid_symbols[TERNARY_QMARK]) {
        return scan_ternary_qmark(lexer);
    }

    return false;
}
