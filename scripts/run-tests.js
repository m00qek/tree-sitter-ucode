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
const force  = process.argv.includes('--force');
const update = process.argv.includes('--update');

// A trivial source file for the query compile-check below. A query is compiled
// when it loads (node names and structure are validated then), independent of
// what it matches, so an empty file is enough.
let tagsFailures = 0;

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
  { name: 'ucode',        buildPath: '.',        project: null,     deps: srcFiles('src'), queryDir: 'queries', testDir: 'test' },
  { name: 'ucode_markup', buildPath: './markup', project: 'markup', deps: srcFiles('markup/src').concat(path.join(ROOT, 'src/scanner_impl.h')), queryDir: 'markup/queries', testDir: 'markup/test' },
  { name: 'ucdocs',       buildPath: './ucdocs', project: 'ucdocs', deps: srcFiles('ucdocs/src'), queryDir: 'ucdocs/queries', testDir: 'ucdocs/test' },
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

  checkTagsFixtures(g, lib);
}

if (tagsFailures > 0) {
  console.error(`${tagsFailures} tags fixture(s) failed (rerun with --update to accept)`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Tags fixtures: <test dir>/tag-docs/<case>.<ext> + <case>.<ext>.expected
//
// The CLI's `tree-sitter tags` cannot load these grammars (tree-sitter.json
// fails to parse; see CONTRIBUTING), so this reproduces the part of
// tree-sitter-tags that decides doc attachment: run tags.scm with
// `tree-sitter query` (which evaluates #match?), keep ONE match per name —
// the lowest pattern index, exactly as tree-sitter-tags does, discarding the
// loser's docs — and print `row:col name <- first line of doc | (no doc)`.
// ---------------------------------------------------------------------------

function checkTagsFixtures(g, lib) {
  const dir = path.join(ROOT, g.testDir, 'tag-docs');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((f) => !f.endsWith('.expected'))) {
    const out = execFileSync(
      'tree-sitter',
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(ROOT, g.queryDir, 'tags.scm'), path.join(dir, f)],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const best = new Map();   // name position -> { pattern, line }
    let pattern = -1, doc = null;
    for (const line of out.split('\n')) {
      let m;
      if ((m = line.match(/^\s+pattern: (\d+)/))) { pattern = Number(m[1]); doc = null; continue; }
      if ((m = line.match(/capture: (?:\d+ - )?doc, .*text: `(.*)`/))) { doc = doc || m[1]; continue; }
      if ((m = line.match(/capture: (?:\d+ - )?name, start: \((\d+), (\d+)\).*text: `(.*)`/))) {
        const key = `${m[1]}:${m[2]}`;
        const prev = best.get(key);
        if (!prev || pattern < prev.pattern) {
          best.set(key, { pattern, line: `${key} ${m[3]} <- ${doc || '(no doc)'}` });
        }
      }
    }
    const actual = [...best.values()].map((v) => v.line)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join('\n') + '\n';
    const expFile = path.join(dir, f + '.expected');
    const expected = fs.existsSync(expFile) ? fs.readFileSync(expFile, 'utf8') : null;
    if (update) {
      fs.writeFileSync(expFile, actual);
    } else if (actual !== expected) {
      tagsFailures++;
      console.error(`${g.name}: tags fixture ${f} differs\n--- expected\n${expected}--- actual\n${actual}`);
      continue;
    }
    console.log(`${g.name}: tags fixture ${f} OK`);
  }
}
