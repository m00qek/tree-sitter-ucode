#include "tree_sitter/parser.h"

/* Must match the order of externals in grammar.js */
enum TokenType {
    RAW_TEXT,
    STMT_CODE,
    EXPR_CODE,
    COMMENT_BODY,
};

void *tree_sitter_ucode_tmpl_external_scanner_create(void)  { return NULL; }
void  tree_sitter_ucode_tmpl_external_scanner_destroy(void *p) { (void)p; }
unsigned tree_sitter_ucode_tmpl_external_scanner_serialize(void *p, char *buf) {
    (void)p; (void)buf; return 0;
}
void tree_sitter_ucode_tmpl_external_scanner_deserialize(void *p, const char *buf, unsigned n) {
    (void)p; (void)buf; (void)n;
}

static inline void advance(TSLexer *lexer) {
    lexer->advance(lexer, false);
}

/*
 * Scan raw text: everything outside a tag delimiter.
 *
 * Stops (without consuming) when it sees '{' followed by '%', '{', or '#'.
 * Characters advanced past without a subsequent mark_end call are treated as
 * lookahead and reset by tree-sitter after the token is returned.
 */
static bool scan_raw_text(TSLexer *lexer) {
    lexer->result_symbol = RAW_TEXT;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '\0') return has_content;

        if (lexer->lookahead == '{') {
            advance(lexer); /* peek at the char after '{' */
            if (lexer->lookahead == '%' ||
                lexer->lookahead == '{' ||
                lexer->lookahead == '#') {
                /* '{' starts a tag — stop before it */
                return has_content;
            }
            /* '{' is not a tag opener; it will be committed on the next
               iteration when mark_end is called at the top of the loop */
        } else {
            advance(lexer);
        }
    }
}

/*
 * Scan statement code: content between {%/-% and %}/-%}.
 *
 * Stops (without consuming) before '%}' or '-%}'.
 */
static bool scan_stmt_code(TSLexer *lexer) {
    lexer->result_symbol = STMT_CODE;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '\0') return has_content;

        if (lexer->lookahead == '-') {
            advance(lexer);
            if (lexer->lookahead == '%') {
                advance(lexer);
                if (lexer->lookahead == '}') {
                    /* found '-%}' — stop before '-' */
                    return has_content;
                }
                /* was '-%' + something else; commit on next iteration */
            }
            /* was '-' + non-'%'; commit on next iteration */
        } else if (lexer->lookahead == '%') {
            advance(lexer);
            if (lexer->lookahead == '}') {
                /* found '%}' — stop before '%' */
                return has_content;
            }
            /* was '%' + non-'}'; commit on next iteration */
        } else {
            advance(lexer);
        }
    }
}

/*
 * Scan expression code: content between {{/{{- and }}/- }}.
 *
 * Stops (without consuming) before '}}' or '-}}'.
 */
static bool scan_expr_code(TSLexer *lexer) {
    lexer->result_symbol = EXPR_CODE;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '\0') return has_content;

        if (lexer->lookahead == '-') {
            advance(lexer);
            if (lexer->lookahead == '}') {
                advance(lexer);
                if (lexer->lookahead == '}') {
                    /* found '-}}' — stop before '-' */
                    return has_content;
                }
                /* was '-}' + something else; commit on next iteration */
            }
            /* was '-' + non-'}'; commit on next iteration */
        } else if (lexer->lookahead == '}') {
            advance(lexer);
            if (lexer->lookahead == '}') {
                /* found '}}' — stop before first '}' */
                return has_content;
            }
            /* was '}' + non-'}'; commit on next iteration */
        } else {
            advance(lexer);
        }
    }
}

/*
 * Scan comment body: content between {# and #}.
 *
 * Stops (without consuming) before '#}'.
 */
static bool scan_comment_body(TSLexer *lexer) {
    lexer->result_symbol = COMMENT_BODY;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        if (lexer->lookahead == '\0') return has_content;

        if (lexer->lookahead == '#') {
            advance(lexer);
            if (lexer->lookahead == '}') {
                /* found '#}' — stop before '#' */
                return has_content;
            }
            /* was '#' + non-'}'; commit on next iteration */
        } else {
            advance(lexer);
        }
    }
}

bool tree_sitter_ucode_tmpl_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    (void)payload;

    if (valid_symbols[RAW_TEXT])    return scan_raw_text(lexer);
    if (valid_symbols[STMT_CODE])   return scan_stmt_code(lexer);
    if (valid_symbols[EXPR_CODE])   return scan_expr_code(lexer);
    if (valid_symbols[COMMENT_BODY]) return scan_comment_body(lexer);

    return false;
}
