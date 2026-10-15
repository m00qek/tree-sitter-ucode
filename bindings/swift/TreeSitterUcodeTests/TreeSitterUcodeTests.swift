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

    // Loads the queries the package bundles for a grammar target, as a
    // consumer would; LanguageConfiguration compiles the highlights,
    // injections and locals queries it finds. The bundle is named
    // <package>_<target>.
    private func checkQueries(_ language: OpaquePointer, _ target: String, _ expected: [String]) throws {
        let bundle = "TreeSitterUcode_\(target)"
#if os(Linux)
        // SwiftTreeSitter looks only for the Apple layout (<bundle>.bundle/
        // Contents/Resources); SwiftPM on Linux puts the resources in
        // <bundle>.resources next to the test binary.
        let config = try LanguageConfiguration(
            Language(language: language), name: target,
            queriesURL: Bundle.main.bundleURL.appendingPathComponent("\(bundle).resources/queries"))
#else
        let config = try LanguageConfiguration(Language(language: language), name: target, bundleName: bundle)
#endif
        let found = config.queries.keys.map { $0.name }
        for query in expected {
            XCTAssertTrue(found.contains(query), "\(target): \(query) query not loaded (found \(found))")
        }
    }

    func testUcodeQueries() throws {
        try checkQueries(tree_sitter_ucode(), "TreeSitterUcode", ["highlights", "injections", "locals"])
    }

    func testUcodeMarkupQueries() throws {
        try checkQueries(tree_sitter_ucode_markup(), "TreeSitterUcodeMarkup", ["highlights", "injections", "locals"])
    }

    func testUcdocsQueries() throws {
        try checkQueries(tree_sitter_ucdocs(), "TreeSitterUcdocs", ["highlights"])
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
