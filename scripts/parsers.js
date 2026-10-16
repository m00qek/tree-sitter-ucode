'use strict';
// Built grammar libraries: .build/parsers/<name>.{so,dll} (`tree-sitter build`
// writes .so on macOS too).
const path = require('path');

const LIB_DIR = path.join(path.dirname(__dirname), '.build', 'parsers');
const EXT = process.platform === 'win32' ? 'dll' : 'so';

module.exports = {
  LIB_DIR,
  EXT,
  libPath: (name) => path.join(LIB_DIR, `${name}.${EXT}`),
};
