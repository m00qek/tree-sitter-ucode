#!/usr/bin/env node
// Builds ucode.<ext> and runs both grammar test suites.
// Uses .dll on Windows, .so everywhere else, matching what CI does.
'use strict';

const { execFileSync, execSync } = require('child_process');

const ext = process.platform === 'win32' ? 'dll' : 'so';
const lib = `ucode.${ext}`;

execFileSync('tree-sitter', ['build', '--output', lib, '.'], { stdio: 'inherit' });
execSync(`tree-sitter test --lib-path ${lib} --lang-name ucode`, { stdio: 'inherit', shell: true });
execSync('tree-sitter test -p tmpl', { stdio: 'inherit', shell: true });
