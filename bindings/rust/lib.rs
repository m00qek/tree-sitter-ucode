//! This crate provides ucode language support for the [tree-sitter] parsing
//! library, as three grammars:
//!
//! - [`LANGUAGE_UCODE`]: ucode scripts.
//! - [`LANGUAGE_UCODE_MARKUP`]: ucode templates — text with `{% %}`, `{{ }}` and
//!   `{# #}` tags. The code inside the tags parses to the same nodes as in
//!   scripts.
//! - [`LANGUAGE_UCDOCS`]: doc comments (`/** … */`), which the other two
//!   grammars' injection queries hand to it.
//!
//! Typically, you will use one of these constants to add a language to a
//! tree-sitter [`Parser`], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! function greet(name) {
//!     return `Hello, ${name}!`;
//! }
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! let language = tree_sitter_ucode::LANGUAGE_UCODE;
//! parser
//!     .set_language(&language.into())
//!     .expect("Error loading ucode parser");
//! let tree = parser.parse(code, None).unwrap();
//! assert!(!tree.root_node().has_error());
//! ```
//!
//! [`Parser`]: https://docs.rs/tree-sitter/0.27.1/tree_sitter/struct.Parser.html
//! [tree-sitter]: https://tree-sitter.github.io/

use tree_sitter_language::LanguageFn;

unsafe extern "C" {
    fn tree_sitter_ucode() -> *const ();
    fn tree_sitter_ucode_markup() -> *const ();
    fn tree_sitter_ucdocs() -> *const ();
}

/// The tree-sitter [`LanguageFn`] for Ucode scripts.
pub const LANGUAGE_UCODE: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_ucode) };

/// The content of the [`node-types.json`] file for the `ucode` grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const UCODE_NODE_TYPES: &str = include_str!("../../ucode/src/node-types.json");

/// The syntax highlighting query for the `ucode` grammar.
pub const UCODE_HIGHLIGHTS_QUERY: &str = include_str!("../../ucode/queries/highlights.scm");

/// The language injection query for the `ucode` grammar.
pub const UCODE_INJECTIONS_QUERY: &str = include_str!("../../ucode/queries/injections.scm");

/// The local variable query for the `ucode` grammar.
pub const UCODE_LOCALS_QUERY: &str = include_str!("../../ucode/queries/locals.scm");

/// The symbol tagging query for the `ucode` grammar.
pub const UCODE_TAGS_QUERY: &str = include_str!("../../ucode/queries/tags.scm");

/// The tree-sitter [`LanguageFn`] for ucode templates (text with `{% %}`, `{{ }}` and `{# #}` tags).
pub const LANGUAGE_UCODE_MARKUP: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_ucode_markup) };

/// The content of the [`node-types.json`] file for the `ucode_markup` grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const UCODE_MARKUP_NODE_TYPES: &str = include_str!("../../ucode_markup/src/node-types.json");

/// The syntax highlighting query for the `ucode_markup` grammar.
pub const UCODE_MARKUP_HIGHLIGHTS_QUERY: &str = include_str!("../../ucode_markup/queries/highlights.scm");

/// The language injection query for the `ucode_markup` grammar.
pub const UCODE_MARKUP_INJECTIONS_QUERY: &str = include_str!("../../ucode_markup/queries/injections.scm");

/// The local variable query for the `ucode_markup` grammar.
pub const UCODE_MARKUP_LOCALS_QUERY: &str = include_str!("../../ucode_markup/queries/locals.scm");

/// The symbol tagging query for the `ucode_markup` grammar.
pub const UCODE_MARKUP_TAGS_QUERY: &str = include_str!("../../ucode_markup/queries/tags.scm");

/// The tree-sitter [`LanguageFn`] for ucode doc comments (`/** … */`, JSDoc-style).
pub const LANGUAGE_UCDOCS: LanguageFn = unsafe { LanguageFn::from_raw(tree_sitter_ucdocs) };

/// The content of the [`node-types.json`] file for the `ucdocs` grammar.
///
/// [`node-types.json`]: https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types
pub const UCDOCS_NODE_TYPES: &str = include_str!("../../ucdocs/src/node-types.json");

/// The syntax highlighting query for the `ucdocs` grammar.
pub const UCDOCS_HIGHLIGHTS_QUERY: &str = include_str!("../../ucdocs/queries/highlights.scm");

/// The symbol tagging query for the `ucdocs` grammar.
pub const UCDOCS_TAGS_QUERY: &str = include_str!("../../ucdocs/queries/tags.scm");

#[cfg(test)]
mod tests {
    use tree_sitter::{Language, Parser, Query};

    fn check(language: Language, source: &str, root: &str, queries: &[&str]) {
        let mut parser = Parser::new();
        parser
            .set_language(&language)
            .expect("Error loading the grammar");
        let tree = parser.parse(source, None).unwrap();
        assert!(!tree.root_node().has_error(), "{}", tree.root_node().to_sexp());
        assert_eq!(tree.root_node().kind(), root);
        for query in queries {
            Query::new(&language, query).expect("the query compiles");
        }
    }

    #[test]
    fn test_can_load_ucode_grammar() {
        check(
            super::LANGUAGE_UCODE.into(),
            "let x = 1;\n",
            "program",
            &[super::UCODE_HIGHLIGHTS_QUERY, super::UCODE_INJECTIONS_QUERY, super::UCODE_LOCALS_QUERY, super::UCODE_TAGS_QUERY],
        );
    }

    #[test]
    fn test_can_load_ucode_markup_grammar() {
        check(
            super::LANGUAGE_UCODE_MARKUP.into(),
            "{% if (a) { %}hi {{ b }}{% } %}\n",
            "markup",
            &[super::UCODE_MARKUP_HIGHLIGHTS_QUERY, super::UCODE_MARKUP_INJECTIONS_QUERY, super::UCODE_MARKUP_LOCALS_QUERY, super::UCODE_MARKUP_TAGS_QUERY],
        );
    }

    #[test]
    fn test_can_load_ucdocs_grammar() {
        check(
            super::LANGUAGE_UCDOCS.into(),
            "/** @param {int} [n=0] - Count. */",
            "document",
            &[super::UCDOCS_HIGHLIGHTS_QUERY, super::UCDOCS_TAGS_QUERY],
        );
    }
}
