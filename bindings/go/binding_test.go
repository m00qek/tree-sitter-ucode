package tree_sitter_ucode_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_ucode "github.com/m00qek/tree-sitter-ucode/bindings/go"
)

func check(t *testing.T, language *tree_sitter.Language, source string, root string) {
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(language); err != nil {
		t.Fatalf("Error loading the grammar: %v", err)
	}
	tree := parser.Parse([]byte(source), nil)
	defer tree.Close()
	node := tree.RootNode()
	if node.HasError() {
		t.Errorf("parse error: %s", node.ToSexp())
	}
	if node.Kind() != root {
		t.Errorf("root is %q, want %q", node.Kind(), root)
	}
}

func TestCanLoadUcodeGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcode()), "let x = 1;\n", "program")
}

func TestCanLoadUcodeMarkupGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcodeMarkup()), "{% if (a) { %}hi {{ b }}{% } %}\n", "markup")
}

func TestCanLoadUcdocsGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcdocs()), "/** @param {int} [n=0] - Count. */", "document")
}
