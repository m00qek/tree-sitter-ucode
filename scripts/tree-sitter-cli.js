'use strict';
// The tree-sitter CLI every script runs: the pinned devDependency binary when
// it is installed (`npm ci`), otherwise whatever `tree-sitter` is on PATH (CI's
// test job installs a pinned CLI that way and has no node_modules). Uses the
// binary inside tree-sitter-cli/ rather than node_modules/.bin/, whose shim is
// a shell script on Windows that execFileSync cannot run.
const fs = require('fs');
const path = require('path');

const local = path.join(
  path.dirname(__dirname), 'node_modules', 'tree-sitter-cli',
  process.platform === 'win32' ? 'tree-sitter.exe' : 'tree-sitter',
);

module.exports = fs.existsSync(local) ? local : 'tree-sitter';
