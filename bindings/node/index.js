const root = require("path").join(__dirname, "..", "..");

module.exports =
  typeof process.versions.bun === "string"
    ? require(`../../prebuilds/${process.platform}-${process.arch}/tree-sitter-ucode.node`)
    : require("node-gyp-build")(root);

function nodeTypeInfo(grammar) {
  try {
    return require(`../../${grammar}/src/node-types.json`);
  } catch (_) {
    return undefined;
  }
}

module.exports.nodeTypeInfo = nodeTypeInfo("ucode");
for (const grammar of ["ucode", "ucode_markup", "ucdocs"]) {
  module.exports[grammar].nodeTypeInfo = nodeTypeInfo(grammar);
}
