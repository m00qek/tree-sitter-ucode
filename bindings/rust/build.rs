fn main() {
    let mut c_config = cc::Build::new();
    c_config.std("c11");

    #[cfg(target_env = "msvc")]
    c_config.flag("-utf-8");

    if std::env::var("TARGET").unwrap() == "wasm32-unknown-unknown" {
        let Ok(wasm_headers) = std::env::var("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS") else {
            panic!("Environment variable DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS must be set by the language crate");
        };

        c_config.include(&wasm_headers);
    }

    // The shared common/scanner.h includes "tree_sitter/parser.h", which
    // GCC/Clang resolve via the include path, not relative to the includer.
    // The three grammars' tree_sitter/ headers are identical, so one will do.
    c_config.include("ucode/src");

    for grammar in ["ucode", "ucode_markup", "ucdocs"] {
        for file in ["parser.c", "scanner.c"] {
            let path = format!("{grammar}/src/{file}");
            c_config.file(&path);
            println!("cargo:rerun-if-changed={path}");
        }
    }
    println!("cargo:rerun-if-changed=common/scanner.h");

    c_config.compile("tree-sitter-ucode");
}
