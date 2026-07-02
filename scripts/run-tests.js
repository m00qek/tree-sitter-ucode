#!/usr/bin/env node
// Builds and tests all three grammars (ucode, ucode_markup, ucdocs).
// A grammar's shared library is rebuilt only when it is missing or older than
// its C sources; pass --force to rebuild unconditionally. Uses .dll on
// Windows, .so everywhere else, matching what CI does.
'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ext   = process.platform === 'win32' ? 'dll' : 'so';
const force = process.argv.includes('--force');

// The C/H sources in a generated `src` directory (parser.c, scanner.c,
// scanner_impl.h, …) whose mtimes decide whether a rebuild is needed.
function srcFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => path.join(dir, f));
}

// name:      passed to --lang-name (and names the <name>.<ext> library)
// buildPath: directory `tree-sitter build` compiles
// project:   -p argument for `tree-sitter test` (null = run in the repo root)
// deps:      source files whose mtime is compared against the built library.
//            ucode_markup's scanner is a shim that #includes ../../src/
//            scanner_impl.h, so that shared header is part of its deps too.
const grammars = [
  { name: 'ucode',        buildPath: '.',        project: null,     deps: srcFiles('src') },
  { name: 'ucode_markup', buildPath: './markup', project: 'markup', deps: srcFiles('markup/src').concat('src/scanner_impl.h') },
  { name: 'ucdocs',       buildPath: './ucdocs', project: 'ucdocs', deps: srcFiles('ucdocs/src') },
];

// Rebuild when forced, when the library is missing, or when any source is
// newer than the library.
function needsBuild(lib, deps) {
  if (force || !fs.existsSync(lib)) return true;
  const libMtime = fs.statSync(lib).mtimeMs;
  return deps.some((d) => fs.existsSync(d) && fs.statSync(d).mtimeMs > libMtime);
}

for (const g of grammars) {
  const lib = path.resolve(`${g.name}.${ext}`);

  if (needsBuild(lib, g.deps)) {
    execFileSync('tree-sitter', ['build', '--output', lib, g.buildPath], { stdio: 'inherit' });
  } else {
    console.log(`${g.name}.${ext} is up to date — skipping build (pass --force to rebuild)`);
  }

  const testArgs = ['test', '--lib-path', lib, '--lang-name', g.name];
  if (g.project) testArgs.push('-p', g.project);
  execFileSync('tree-sitter', testArgs, { stdio: 'inherit' });
}
