/*
 * Thin shim for the ucode_markup grammar.
 *
 * The markup grammar uses the same external scanner as the main ucode grammar
 * but needs it exported under the `ucode_markup` name.  We include the shared
 * implementation and re-export its symbols under the expected names.
 */

#include "../../src/scanner.c"

void *tree_sitter_ucode_markup_external_scanner_create(void) {
    return tree_sitter_ucode_external_scanner_create();
}

void tree_sitter_ucode_markup_external_scanner_destroy(void *p) {
    tree_sitter_ucode_external_scanner_destroy(p);
}

unsigned tree_sitter_ucode_markup_external_scanner_serialize(void *p, char *b) {
    return tree_sitter_ucode_external_scanner_serialize(p, b);
}

void tree_sitter_ucode_markup_external_scanner_deserialize(void *p, const char *b, unsigned n) {
    tree_sitter_ucode_external_scanner_deserialize(p, b, n);
}

bool tree_sitter_ucode_markup_external_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    return tree_sitter_ucode_external_scanner_scan(payload, lexer, valid_symbols);
}
