#!/usr/bin/env node
// Builds and tests all three grammars (ucode, ucode_markup, ucdocs).
// A grammar's shared library is rebuilt only when it is missing or older than
// its C sources; pass --force to rebuild unconditionally. Uses .dll on
// Windows, .so everywhere else, matching what CI does.
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Anchor every path on the repo root (this script lives in scripts/) so the
// runner works regardless of the caller's working directory.
const ROOT  = path.dirname(__dirname);
const ext   = process.platform === 'win32' ? 'dll' : 'so';
const force = process.argv.includes('--force');

// A trivial source file for the query compile-check below. A query is compiled
// when it loads (node names and structure are validated then), independent of
// what it matches, so an empty file is enough.
const querySource = path.join(os.tmpdir(), 'ts-ucode-query-check.txt');
fs.writeFileSync(querySource, '');

// The C/H sources in a generated `src` directory (parser.c, scanner.c,
// scanner_impl.h, …) whose mtimes decide whether a rebuild is needed.
function srcFiles(dir) {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => path.join(abs, f));
}

// name:      passed to --lang-name (and names the <name>.<ext> library)
// buildPath: directory `tree-sitter build` compiles (relative to ROOT)
// project:   -p argument for `tree-sitter test` (null = run in the repo root)
// deps:      source files whose mtime is compared against the built library.
//            ucode_markup's scanner is a shim that #includes ../../src/
//            scanner_impl.h, so that shared header is part of its deps too.
// queryDir:  directory of *.scm query files compile-checked against the grammar
const grammars = [
  { name: 'ucode',        buildPath: '.',        project: null,     deps: srcFiles('src'), queryDir: 'queries' },
  { name: 'ucode_markup', buildPath: './markup', project: 'markup', deps: srcFiles('markup/src').concat(path.join(ROOT, 'src/scanner_impl.h')), queryDir: 'markup/queries' },
  { name: 'ucdocs',       buildPath: './ucdocs', project: 'ucdocs', deps: srcFiles('ucdocs/src'), queryDir: 'ucdocs/queries' },
];

// Rebuild when forced, when the library is missing, or when any source is
// missing (a renamed/removed dep) or newer than the library.
function needsBuild(lib, deps) {
  if (force || !fs.existsSync(lib)) return true;
  const libMtime = fs.statSync(lib).mtimeMs;
  return deps.some((d) => !fs.existsSync(d) || fs.statSync(d).mtimeMs > libMtime);
}

for (const g of grammars) {
  const lib = path.join(ROOT, `${g.name}.${ext}`);

  if (needsBuild(lib, g.deps)) {
    execFileSync('tree-sitter', ['build', '--output', lib, g.buildPath], { stdio: 'inherit', cwd: ROOT });
  } else {
    console.log(`${g.name}.${ext} is up to date — skipping build (pass --force to rebuild)`);
  }

  const testArgs = ['test', '--lib-path', lib, '--lang-name', g.name];
  if (g.project) testArgs.push('-p', g.project);
  execFileSync('tree-sitter', testArgs, { stdio: 'inherit', cwd: ROOT });

  // Compile-check every query file against the freshly built grammar, so a
  // query that references a renamed/removed node (or has a syntax error) fails
  // here instead of silently in an editor. `tree-sitter query` compiles the
  // query when it loads; a non-zero exit throws and fails the run.
  const queryAbs = path.join(ROOT, g.queryDir);
  for (const f of fs.readdirSync(queryAbs).filter((f) => f.endsWith('.scm'))) {
    execFileSync(
      'tree-sitter',
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(queryAbs, f), querySource],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT },
    );
  }
  console.log(`${g.name}: ${g.queryDir}/*.scm compile OK`);
}
