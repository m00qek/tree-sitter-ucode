#!/usr/bin/env node
// Builds ucode.<ext>, ucode_markup.<ext>, and ucdocs.<ext> and runs all test suites.
// Uses .dll on Windows, .so everywhere else, matching what CI does.
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ext       = process.platform === 'win32' ? 'dll' : 'so';
const lib       = path.resolve(`ucode.${ext}`);
const markupLib = path.resolve(`ucode_markup.${ext}`);
const ucdocsLib = path.resolve(`ucdocs.${ext}`);

execFileSync('tree-sitter', ['build', '--output', lib, '.'], { stdio: 'inherit' });
execFileSync('tree-sitter', ['test', '--lib-path', lib, '--lang-name', 'ucode'], { stdio: 'inherit' });

execFileSync('tree-sitter', ['build', '--output', markupLib, './markup'], { stdio: 'inherit' });
execFileSync('tree-sitter', ['test', '--lib-path', markupLib, '--lang-name', 'ucode_markup', '-p', 'markup'], { stdio: 'inherit' });

execFileSync('tree-sitter', ['build', '--output', ucdocsLib, './ucdocs'], { stdio: 'inherit' });
execFileSync('tree-sitter', ['test', '--lib-path', ucdocsLib, '--lang-name', 'ucdocs', '-p', 'ucdocs'], { stdio: 'inherit' });
