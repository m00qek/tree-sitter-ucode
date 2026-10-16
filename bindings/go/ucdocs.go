package tree_sitter_ucode

// One file per grammar: each cgo preamble is its own translation unit, and
// two generated parsers in one would clash. -I: for common/scanner.h.

// #cgo CPPFLAGS: -I../../ucdocs/src
// #cgo CFLAGS: -std=c11 -fPIC
// #include "../../ucdocs/src/parser.c"
// #include "../../ucdocs/src/scanner.c"
import "C"

import "unsafe"

// LanguageUcdocs returns the tree-sitter Language for ucode doc comments (/** ... */).
func LanguageUcdocs() unsafe.Pointer {
	return unsafe.Pointer(C.tree_sitter_ucdocs())
}
