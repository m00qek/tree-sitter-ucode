// Smoke test for the Node binding: every grammar the package exports loads
// into the tree-sitter runtime (the peer-dependency range) and parses, and the
// query files the package ships compile with that runtime.
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
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

for (const name of Object.keys(samples)) {
  const dir = path.join(__dirname, "..", "..", name, "queries");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".scm"))) {
    test(`${name}/queries/${file} compiles`, () => {
      let source = fs.readFileSync(path.join(dir, file), "utf8");
      // tree-sitter-tags' own directives, which the runtime rejects.
      source = source.replace(/\(#(strip|select-adjacent)! [^)]*\)/g, "");
      new Parser.Query(ucode[name], source);
    });
  }
}
