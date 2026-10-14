#!/usr/bin/env node
// Builds and tests all three grammars (ucode, ucode_markup, ucdocs).
// Each grammar's shared library goes to .build/parsers/<name>.<ext> and is
// rebuilt only when it is missing or older than its C sources; pass --force to
// rebuild unconditionally, --build-only to build without testing. Uses .dll
// on Windows, .so everywhere else, matching what CI does.
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
const buildOnly = process.argv.includes('--build-only');
const LIB_DIR = path.join(ROOT, '.build', 'parsers');

// A trivial source file for the query compile-check below. A query is compiled
// when it loads (node names and structure are validated then), independent of
// what it matches, so an empty file is enough.
let tagsFailures = 0;
let checkFailures = 0;
const checks = require('./checks');
const TREE_SITTER = require('./tree-sitter-cli');

// Report a check's problems (a list of strings); count a failure if any.
function report(label, problems) {
  if (!problems.length) { console.log(`${label} OK`); return; }
  checkFailures++;
  console.error(`${label} FAILED:\n${problems.slice(0, 20).map((p) => `  ${p}`).join('\n')}` +
    (problems.length > 20 ? `\n  … and ${problems.length - 20} more` : ''));
}

const querySource = path.join(os.tmpdir(), 'ts-ucode-query-check.txt');
fs.writeFileSync(querySource, '');

// The top-level C/H sources in a grammar's `src` directory (parser.c,
// scanner.c) whose mtimes decide whether a rebuild is needed.
function srcFiles(dir) {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => path.join(abs, f));
}

// name:      passed to --lang-name (and names the <name>.<ext> library)
// Every grammar lives in its own <name>/ directory: grammar.js, src/, queries/
// and test/. deps are the C sources whose mtime is compared against the built
// library; both code grammars' scanners are shims that #include
// common/scanner.h, so that shared header is part of their deps too.
const SHARED_SCANNER = path.join(ROOT, 'common', 'scanner.h');
const grammars = ['ucode', 'ucode_markup', 'ucdocs'].map((name) => ({
  name,
  deps: srcFiles(`${name}/src`).concat(name === 'ucdocs' ? [] : [SHARED_SCANNER]),
}));

// Rebuild when forced, when the library is missing, or when any source is
// missing (a renamed/removed dep) or newer than the library.
function needsBuild(lib, deps) {
  if (force || !fs.existsSync(lib)) return true;
  const libMtime = fs.statSync(lib).mtimeMs;
  return deps.some((d) => !fs.existsSync(d) || fs.statSync(d).mtimeMs > libMtime);
}

if (!buildOnly) report('scanner TokenType enums match the grammars\' externals:', checks.checkExternals());

for (const g of grammars) {
  const lib = path.join(LIB_DIR, `${g.name}.${ext}`);

  if (needsBuild(lib, g.deps)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
    execFileSync(TREE_SITTER, ['build', '--output', lib, g.name], { stdio: 'inherit', cwd: ROOT });
  } else {
    console.log(`.build/parsers/${g.name}.${ext} is up to date — skipping build (pass --force to rebuild)`);
  }
  if (buildOnly) continue;

  execFileSync(TREE_SITTER, ['test', '--lib-path', lib, '--lang-name', g.name, '-p', g.name],
    { stdio: 'inherit', cwd: ROOT });

  // Compile-check every query file against the freshly built grammar, so a
  // query that references a renamed/removed node (or has a syntax error) fails
  // here instead of silently in an editor. `tree-sitter query` compiles the
  // query when it loads; a non-zero exit throws and fails the run.
  const queryAbs = path.join(ROOT, g.name, 'queries');
  for (const f of fs.readdirSync(queryAbs).filter((f) => f.endsWith('.scm'))) {
    execFileSync(
      TREE_SITTER,
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(queryAbs, f), querySource],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT },
    );
  }
  const helixDir = path.join(ROOT, 'editors', 'helix', 'queries', g.name.replace('_', '-'));
  for (const f of fs.readdirSync(helixDir).filter((f) => f.endsWith('.scm'))) {
    execFileSync(
      TREE_SITTER,
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(helixDir, f), querySource],
      { stdio: ['ignore', 'ignore', 'inherit'], cwd: ROOT },
    );
  }
  console.log(`${g.name}: ${g.name}/queries/*.scm and the Helix queries compile OK`);

  checkTagsFixtures(g, lib);
  report(`${g.name}: no name-like node starts or ends with whitespace:`, checks.checkPositions(lib, g.name));
  report(`${g.name}: every corpus token is highlighted:`, checks.checkHighlights(lib, g.name));
  const helix = path.join(ROOT, 'editors', 'helix', 'queries', g.name.replace('_', '-'), 'highlights.scm');
  report(`${g.name}: every corpus token is highlighted by the Helix queries:`,
    checks.checkHighlights(lib, g.name, helix));
}

if (tagsFailures > 0) {
  console.error(`${tagsFailures} tags fixture(s) failed (rerun with --update to accept)`);
}
if (checkFailures > 0) {
  console.error(`${checkFailures} structural check(s) failed (see scripts/checks.js)`);
}
if (tagsFailures > 0 || checkFailures > 0) process.exit(1);

// ---------------------------------------------------------------------------
// Tags fixtures: <grammar>/test/tag-docs/<case>.<ext> + <case>.<ext>.expected
//
// The CLI's `tree-sitter tags` cannot load these grammars (tree-sitter.json
// fails to parse; see CONTRIBUTING), so this reproduces the part of
// tree-sitter-tags that decides doc attachment: run tags.scm with
// `tree-sitter query` (which evaluates #match?), keep ONE match per name —
// the lowest pattern index, exactly as tree-sitter-tags does, discarding the
// loser's docs — and print `row:col name <- first line of doc | (no doc)`.
// ---------------------------------------------------------------------------

function checkTagsFixtures(g, lib) {
  const dir = path.join(ROOT, g.name, 'test', 'tag-docs');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((f) => !f.endsWith('.expected'))) {
    const out = execFileSync(
      TREE_SITTER,
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(ROOT, g.name, 'queries', 'tags.scm'), path.join(dir, f)],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const best = new Map();   // name position -> { pattern, line }
    let pattern = -1, doc = null;
    for (const line of out.split(/\r?\n/)) {
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
    // Normalise line endings: on Windows, git checks the .expected file out
    // with CRLF (tree-sitter's own corpus runner normalises its files likewise).
    const expected = fs.existsSync(expFile)
      ? fs.readFileSync(expFile, 'utf8').replace(/\r\n/g, '\n')
      : null;
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
