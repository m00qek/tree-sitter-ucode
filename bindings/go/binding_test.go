package tree_sitter_ucode_test

import (
	"os"
	"path/filepath"
	"testing"

	tree_sitter_ucode "github.com/m00qek/tree-sitter-ucode/bindings/go"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// check parses source and compiles the grammar's queries (<grammar>/queries,
// relative to the repository root).
func check(t *testing.T, language *tree_sitter.Language, source string, root string, grammar string) {
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

	files, _ := filepath.Glob(filepath.Join("..", "..", grammar, "queries", "*.scm"))
	if len(files) == 0 {
		t.Fatalf("no queries found for %s", grammar)
	}
	for _, file := range files {
		text, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		query, qerr := tree_sitter.NewQuery(language, string(text))
		if qerr != nil {
			t.Errorf("%s: %v", file, qerr)
			continue
		}
		query.Close()
	}
}

func TestCanLoadUcodeGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcode()), "let x = 1;\n", "program", "ucode")
}

func TestCanLoadUcodeMarkupGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcodeMarkup()), "{% if (a) { %}hi {{ b }}{% } %}\n", "markup", "ucode_markup")
}

func TestCanLoadUcdocsGrammar(t *testing.T) {
	check(t, tree_sitter.NewLanguage(tree_sitter_ucode.LanguageUcdocs()), "/** @param {int} [n=0] - Count. */", "document", "ucdocs")
}
