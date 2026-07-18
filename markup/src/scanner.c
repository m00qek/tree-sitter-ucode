/*
 * External scanner for the ucode_markup grammar.
 *
 * All implementation lives in src/scanner_impl.h (static functions).  This
 * file only exports the five tree_sitter_ucode_markup_external_scanner_*
 * entry points — no ucode_* symbols leak into this shared library.
 */

#include "../../src/scanner_impl.h"

void *tree_sitter_ucode_markup_external_scanner_create(void) { return ucode_scanner_create(); }
void  tree_sitter_ucode_markup_external_scanner_destroy(void *p) { ucode_scanner_destroy(p); }
unsigned tree_sitter_ucode_markup_external_scanner_serialize(void *p, char *b) { return ucode_scanner_serialize(p, b); }
void  tree_sitter_ucode_markup_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    ucode_scanner_deserialize(p, b, n);
}

bool tree_sitter_ucode_markup_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    return ucode_scanner_scan(payload, lexer, valid_symbols);
}
