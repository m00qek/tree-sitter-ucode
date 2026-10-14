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
      ],
      "variables": {
        "has_scanner": "<!(node -p \"fs.existsSync('ucode/src/scanner.c')\")"
      },
      "conditions": [
        ["has_scanner=='true'", {
          "sources+": ["ucode/src/scanner.c"],
        }],
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
