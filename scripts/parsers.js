'use strict';
// Where scripts/run-tests.js builds each grammar's shared library:
// .build/parsers/<name>.dll on Windows, .so everywhere else (tree-sitter build
// never produces .dylib), matching what CI does.
const path = require('path');

const LIB_DIR = path.join(path.dirname(__dirname), '.build', 'parsers');
const EXT = process.platform === 'win32' ? 'dll' : 'so';

module.exports = {
  LIB_DIR,
  EXT,
  libPath: (name) => path.join(LIB_DIR, `${name}.${EXT}`),
};
