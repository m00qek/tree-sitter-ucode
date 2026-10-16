'use strict';
// The pinned devDependency CLI, else `tree-sitter` on PATH (CI's test job has
// no node_modules). Not node_modules/.bin/: on Windows that is a shell shim
// execFileSync can't run.
const fs = require('fs');
const path = require('path');

const local = path.join(
  path.dirname(__dirname), 'node_modules', 'tree-sitter-cli',
  process.platform === 'win32' ? 'tree-sitter.exe' : 'tree-sitter',
);

module.exports = fs.existsSync(local) ? local : 'tree-sitter';
