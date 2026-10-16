import XCTest
import SwiftTreeSitter
import TreeSitterUcode
import TreeSitterUcodeMarkup
import TreeSitterUcdocs

struct QueriesNotFound: Error, CustomStringConvertible {
    let description: String
}

final class TreeSitterUcodeTests: XCTestCase {
    private func check(_ language: Language, _ source: String, _ root: String) throws {
        let parser = Parser()
        XCTAssertNoThrow(try parser.setLanguage(language), "Error loading the grammar")
        let tree = try XCTUnwrap(parser.parse(source))
        let node = try XCTUnwrap(tree.rootNode)
        XCTAssertFalse(node.hasError)
        XCTAssertEqual(node.nodeType, root)
    }

    // Where SwiftPM put a target's queries: `<bundle>.bundle/queries` (command
    // line, macOS), `<bundle>.bundle/Contents/Resources/queries` (Xcode) or
    // `<bundle>.resources/queries` (Linux). SwiftTreeSitter 0.25.0's
    // `bundleName:` initializer only knows the Xcode layout on macOS.
    private func queriesURL(_ bundle: String) throws -> URL {
        let dirs = [Bundle(for: Self.self).bundleURL.deletingLastPathComponent(), Bundle.main.bundleURL]
        let layouts = ["\(bundle).bundle/queries", "\(bundle).bundle/Contents/Resources/queries", "\(bundle).resources/queries"]
        for dir in dirs {
            for layout in layouts {
                let url = dir.appendingPathComponent(layout, isDirectory: true)
                if FileManager.default.fileExists(atPath: url.path) { return url }
            }
        }
        throw QueriesNotFound(description: "no queries directory for \(bundle) under \(dirs.map(\.path))")
    }

    // LanguageConfiguration compiles the bundled highlights, injections and
    // locals queries, as a consumer would load them.
    private func checkQueries(_ language: OpaquePointer, _ target: String, _ expected: [String]) throws {
        let config = try LanguageConfiguration(
            Language(language: language), name: target,
            queriesURL: try queriesURL("TreeSitterUcode_\(target)"))
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
