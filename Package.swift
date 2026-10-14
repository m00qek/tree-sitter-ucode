// swift-tools-version:5.6

import PackageDescription

// One target per grammar: TreeSitterUcode (scripts), TreeSitterUcodeMarkup
// (templates) and TreeSitterUcdocs (doc comments).
let package = Package(
    name: "TreeSitterUcode",
    products: [
        .library(name: "TreeSitterUcode", targets: ["TreeSitterUcode", "TreeSitterUcodeMarkup", "TreeSitterUcdocs"]),
    ],
    dependencies: [
        .package(url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.10.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterUcode",
            dependencies: [],
            path: ".",
            sources: ["ucode/src/parser.c", "ucode/src/scanner.c"],
            resources: [
                .copy("ucode/queries")
            ],
            publicHeadersPath: "bindings/swift/ucode",
            // The shared common/scanner.h includes "tree_sitter/parser.h",
            // which is resolved via the include path, not relative to the includer.
            cSettings: [.headerSearchPath("ucode/src")]
        ),
        .target(
            name: "TreeSitterUcodeMarkup",
            dependencies: [],
            path: ".",
            sources: ["ucode_markup/src/parser.c", "ucode_markup/src/scanner.c"],
            resources: [
                .copy("ucode_markup/queries")
            ],
            publicHeadersPath: "bindings/swift/ucode_markup",
            // The shared common/scanner.h includes "tree_sitter/parser.h",
            // which is resolved via the include path, not relative to the includer.
            cSettings: [.headerSearchPath("ucode_markup/src")]
        ),
        .target(
            name: "TreeSitterUcdocs",
            dependencies: [],
            path: ".",
            sources: ["ucdocs/src/parser.c", "ucdocs/src/scanner.c"],
            resources: [
                .copy("ucdocs/queries")
            ],
            publicHeadersPath: "bindings/swift/ucdocs",
            // The shared common/scanner.h includes "tree_sitter/parser.h",
            // which is resolved via the include path, not relative to the includer.
            cSettings: [.headerSearchPath("ucdocs/src")]
        ),
        .testTarget(
            name: "TreeSitterUcodeTests",
            dependencies: [
                .product(name: "SwiftTreeSitter", package: "swift-tree-sitter"),
                "TreeSitterUcode",
                "TreeSitterUcodeMarkup",
                "TreeSitterUcdocs",
            ],
            path: "bindings/swift/TreeSitterUcodeTests"
        )
    ],
    cLanguageStandard: .c11
)
