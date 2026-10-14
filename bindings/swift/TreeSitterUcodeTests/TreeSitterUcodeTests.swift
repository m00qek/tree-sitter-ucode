import XCTest
import SwiftTreeSitter
import TreeSitterUcode
import TreeSitterUcodeMarkup
import TreeSitterUcdocs

final class TreeSitterUcodeTests: XCTestCase {
    private func check(_ language: Language, _ source: String, _ root: String) throws {
        let parser = Parser()
        XCTAssertNoThrow(try parser.setLanguage(language), "Error loading the grammar")
        let tree = try XCTUnwrap(parser.parse(source))
        let node = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(node.hasError)
        XCTAssertEqual(node.nodeType, root)
    }

    func testCanLoadUcodeGrammar() throws {
        try check(Language(language: tree_sitter_ucode()), "let x = 1;\n", "program")
    }

    func testCanLoadUcodeMarkupGrammar() throws {
        try check(Language(language: tree_sitter_ucode_markup()), "{% if (a) { %}hi {{ b }}{% } %}\n", "markup")
    }

    func testCanLoadUcdocsGrammar() throws {
        try check(Language(language: tree_sitter_ucdocs()), "/** @param {int} [n=0] - Count. */", "document")
    }
}
