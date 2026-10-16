/*
 * External scanner for ucdocs: a star-run in description prose. Whether the
 * stars are prose or the comment terminator depends on the character after
 * the run, and regex tokens have no lookahead. Accept the run only if no '/'
 * follows. (No literal star-slash in these comments: it would close them.)
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

    /* Called before extras are skipped: skip whitespace and line frames
       (newline, indentation, one star) as grammar.js does. Declining rewinds. */
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
            if (lexer->lookahead == '/') return false;
        }
    }

    if (lexer->lookahead != '*') return false;
    while (lexer->lookahead == '*')
        lexer->advance(lexer, false);

    if (lexer->lookahead == '/') return false;

    lexer->mark_end(lexer);
    lexer->result_symbol = STARS;
    return true;
}
