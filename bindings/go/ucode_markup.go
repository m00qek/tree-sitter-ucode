package tree_sitter_ucode

// One file per grammar: each cgo preamble is its own translation unit, and
// two generated parsers in one would clash. -I: for common/scanner.h.

// #cgo CPPFLAGS: -I../../ucode_markup/src
// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../ucode_markup/src/parser.c"
// #include "../../ucode_markup/src/scanner.c"
import "C"

import "unsafe"

// LanguageUcodeMarkup returns the tree-sitter Language for ucode templates (text with {% %}, {{ }} and {# #} tags).
func LanguageUcodeMarkup() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_ucode_markup())
}
