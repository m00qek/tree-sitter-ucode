/*
 * External scanner for the ucdocs grammar.
 *
 * One token: a run of stars inside description prose. Whether a star-run is
 * prose (markdown bold or italic, a bullet, a trailing star) or the start of
 * the comment terminator (stars then a slash) depends on the character AFTER
 * the run, and tree-sitter's regex tokens have no lookahead: a plain
 * star-run token would eat the stars of the terminator, and a star-run token
 * that requires a following non-slash has to consume that character, which
 * breaks at the end of a line. Here the run is consumed and then accepted
 * only if no slash follows it.
 *
 * (No literal star-slash may appear in this file's comments: it would close
 * them.)
 */

#include "tree_sitter/parser.h"

enum TokenType {
    STARS,
};

void *tree_sitter_ucdocs_external_scanner_create(void) { return NULL; }
void tree_sitter_ucdocs_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_ucdocs_external_scanner_serialize(void *payload, char *buffer) {
    (void)payload; (void)buffer;
    return 0;
}

void tree_sitter_ucdocs_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    (void)payload; (void)buffer; (void)length;
}

bool tree_sitter_ucdocs_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    (void)payload;
    if (!valid_symbols[STARS]) return false;

    /* tree-sitter calls this BEFORE skipping extras, so skip whitespace and
       any line frames (newline, indentation, ONE frame star) here exactly as
       the frame extra in grammar.js does — otherwise a line that starts with
       markdown stars is never seen by this scanner. Skipping is safe even when
       we end up declining: on `return false` the lexer rewinds. */
    for (;;) {
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t')
            lexer->advance(lexer, true);
        if (lexer->lookahead != '\n' && lexer->lookahead != '\r') break;
        while (lexer->lookahead == '\n' || lexer->lookahead == '\r')
            lexer->advance(lexer, true);
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t')
            lexer->advance(lexer, true);
        if (lexer->lookahead == '*') {
            lexer->advance(lexer, true);
            /* The frame star was really the terminator's first star. */
            if (lexer->lookahead == '/') return false;
        }
    }

    if (lexer->lookahead != '*') return false;
    while (lexer->lookahead == '*')
        lexer->advance(lexer, false);

    /* Stars then a slash: every star of the run belongs to the terminator. */
    if (lexer->lookahead == '/') return false;

    lexer->mark_end(lexer);
    lexer->result_symbol = STARS;
    return true;
}
