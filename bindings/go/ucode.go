package tree_sitter_ucode

// One file per grammar: each cgo preamble is its own translation unit, and
// two generated parsers in one would clash. -I: for common/scanner.h.

// #cgo CPPFLAGS: -I../../ucode/src
// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../ucode/src/parser.c"
// #include "../../ucode/src/scanner.c"
import "C"

import "unsafe"

// LanguageUcode returns the tree-sitter Language for ucode scripts.
func LanguageUcode() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_ucode())
}
