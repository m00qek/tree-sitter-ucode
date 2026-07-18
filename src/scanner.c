/*
 * External scanner for the ucode grammar.
 *
 * All implementation lives in scanner_impl.h (static functions).  This file
 * only exports the five tree_sitter_ucode_external_scanner_* entry points
 * that the generated parser expects.
 */

#include "scanner_impl.h"

void *tree_sitter_ucode_external_scanner_create(void) { return ucode_scanner_create(); }
void  tree_sitter_ucode_external_scanner_destroy(void *p) { ucode_scanner_destroy(p); }
unsigned tree_sitter_ucode_external_scanner_serialize(void *p, char *b) { return ucode_scanner_serialize(p, b); }
void  tree_sitter_ucode_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    ucode_scanner_deserialize(p, b, n);
}

bool tree_sitter_ucode_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    return ucode_scanner_scan(payload, lexer, valid_symbols);
}
