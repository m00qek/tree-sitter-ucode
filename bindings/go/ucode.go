package tree_sitter_ucode

// Each grammar has its own file: cgo compiles every file's preamble as a
// separate C translation unit, and two generated parsers in one would clash.
// The shared common/scanner.h includes "tree_sitter/parser.h", which is
// resolved via the include path, not relative to the includer.

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
