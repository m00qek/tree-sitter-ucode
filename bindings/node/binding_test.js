// Smoke test for the Node binding: every grammar the package exports loads
// into the tree-sitter runtime (the peer-dependency range) and parses.
const assert = require("node:assert");
const { test } = require("node:test");
const Parser = require("tree-sitter");
const ucode = require("./index.js");

const samples = {
  ucode: "let x = 1;\n",
  ucode_markup: "{% if (a) { %}hi {{ b }}{% } %}\n",
  ucdocs: "/** @param {int} [n=0] - Count. */",
};

test("the package itself is the ucode grammar", () => {
  const parser = new Parser();
  parser.setLanguage(ucode);
  assert.strictEqual(parser.parse(samples.ucode).rootNode.type, "program");
});

for (const [name, source] of Object.entries(samples)) {
  test(`${name} loads and parses`, () => {
    const parser = new Parser();
    parser.setLanguage(ucode[name]);
    const tree = parser.parse(source);
    assert.strictEqual(tree.rootNode.hasError, false, tree.rootNode.toString());
    assert.ok(ucode[name].nodeTypeInfo.length > 0, "nodeTypeInfo is present");
  });
}
