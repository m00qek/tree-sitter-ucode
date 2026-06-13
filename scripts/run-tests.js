#!/usr/bin/env node
// Builds ucode.<ext> and ucode_markup.<ext> and runs all test suites.
// Uses .dll on Windows, .so everywhere else, matching what CI does.
'use strict';

const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ext       = process.platform === 'win32' ? 'dll' : 'so';
const lib       = `ucode.${ext}`;
const markupLib = path.resolve(`ucode_markup.${ext}`);

execFileSync('tree-sitter', ['build', '--output', lib, '.'], { stdio: 'inherit' });
execSync(`tree-sitter test --lib-path ${lib} --lang-name ucode`, { stdio: 'inherit', shell: true });

execFileSync('tree-sitter', ['build', '--output', markupLib, './markup'], { stdio: 'inherit' });
execSync(`tree-sitter test --lib-path ${markupLib} --lang-name ucode_markup -p markup`, { stdio: 'inherit', shell: true });
