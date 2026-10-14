from unittest import TestCase

from tree_sitter import Language, Parser, Query
import tree_sitter_ucode


class TestLanguage(TestCase):
    def check(self, language, source, root, queries):
        language = Language(language)
        tree = Parser(language).parse(source)
        self.assertFalse(tree.root_node.has_error, str(tree.root_node))
        self.assertEqual(tree.root_node.type, root)
        for name in queries:
            query = getattr(tree_sitter_ucode, name)
            self.assertIsNotNone(query, f"{name} is packaged")
            Query(language, query)

    def test_can_load_ucode_grammar(self):
        self.check(
            tree_sitter_ucode.language_ucode(),
            b'let x = 1;\n',
            "program",
            ["UCODE_HIGHLIGHTS_QUERY", "UCODE_INJECTIONS_QUERY", "UCODE_LOCALS_QUERY", "UCODE_TAGS_QUERY"],
        )

    def test_can_load_ucode_markup_grammar(self):
        self.check(
            tree_sitter_ucode.language_ucode_markup(),
            b'{% if (a) { %}hi {{ b }}{% } %}\n',
            "markup",
            ["UCODE_MARKUP_HIGHLIGHTS_QUERY", "UCODE_MARKUP_INJECTIONS_QUERY", "UCODE_MARKUP_LOCALS_QUERY", "UCODE_MARKUP_TAGS_QUERY"],
        )

    def test_can_load_ucdocs_grammar(self):
        self.check(
            tree_sitter_ucode.language_ucdocs(),
            b'/** @param {int} [n=0] - Count. */',
            "document",
            ["UCDOCS_HIGHLIGHTS_QUERY", "UCDOCS_TAGS_QUERY"],
        )
