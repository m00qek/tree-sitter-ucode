{
  "targets": [
    {
      "target_name": "tree_sitter_ucode_binding",
      "dependencies": [
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except",
      ],
      "include_dirs": [
        "ucode/src",
      ],
      "sources": [
        "bindings/node/binding.cc",
        "ucode/src/parser.c",
        "ucode/src/scanner.c",
        "ucode_markup/src/parser.c",
        "ucode_markup/src/scanner.c",
        "ucdocs/src/parser.c",
        "ucdocs/src/scanner.c",
      ],
      "conditions": [
        ["OS!='win'", {
          "cflags_c": [
            "-std=c11",
          ],
        }, {
          "cflags_c": [
            "/std:c11",
            "/utf-8",
          ],
        }],
      ],
    }
  ]
}
