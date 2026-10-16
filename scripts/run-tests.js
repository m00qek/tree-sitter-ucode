#!/usr/bin/env node
// Builds (when stale) and tests the three grammars.
// --force rebuilds, --build-only skips tests, --update rewrites tags fixtures.
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT  = path.dirname(__dirname);
const force  = process.argv.includes('--force');
const update = process.argv.includes('--update');
const buildOnly = process.argv.includes('--build-only');
const { LIB_DIR, libPath } = require('./parsers');

let tagsFailures = 0;
let checkFailures = 0;
const checks = require('./checks');
const TREE_SITTER = require('./tree-sitter-cli');

function report(label, problems) {
  if (!problems.length) { console.log(`${label} OK`); return; }
  checkFailures++;
  console.error(`${label} FAILED:\n${problems.slice(0, 20).map((p) => `  ${p}`).join('\n')}` +
    (problems.length > 20 ? `\n  … and ${problems.length - 20} more` : ''));
}

// Queries compile on load, so an empty input is enough to check them.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucode-run-tests-'));
process.on('exit', () => fs.rmSync(tmpDir, { recursive: true, force: true }));
const querySource = path.join(tmpDir, 'empty.txt');
fs.writeFileSync(querySource, '');

function srcFiles(dir) {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.c') || f.endsWith('.h'))
    .map((f) => path.join(abs, f));
}

// The code grammars' scanner.c files #include common/scanner.h.
const SHARED_SCANNER = path.join(ROOT, 'common', 'scanner.h');
const grammars = ['ucode', 'ucode_markup', 'ucdocs'].map((name) => ({
  name,
  deps: srcFiles(`${name}/src`).concat(name === 'ucdocs' ? [] : [SHARED_SCANNER]),
}));

function needsBuild(lib, deps) {
  if (force || !fs.existsSync(lib)) return true;
  const libMtime = fs.statSync(lib).mtimeMs;
  return deps.some((d) => !fs.existsSync(d) || fs.statSync(d).mtimeMs > libMtime);
}

if (!buildOnly) report('scanner TokenType enums match the grammars\' externals:', checks.checkExternals());

for (const g of grammars) {
  const lib = libPath(g.name);

  if (needsBuild(lib, g.deps)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
    execFileSync(TREE_SITTER, ['build', '--output', lib, g.name], { stdio: 'inherit', cwd: ROOT });
  } else {
    console.log(`${path.relative(ROOT, lib)} is up to date — skipping build (pass --force to rebuild)`);
  }
  if (buildOnly) continue;

  execFileSync(TREE_SITTER, ['test', '--lib-path', lib, '--lang-name', g.name, '-p', g.name],
    { stdio: 'inherit', cwd: ROOT });

  // A query naming a removed node fails here, not silently in an editor.
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
  const corpus = checks.loadCorpus(lib, g.name);
  try {
    report(`${g.name}: no name-like node starts or ends with whitespace:`, checks.checkPositions(corpus));
    report(`${g.name}: every corpus token is highlighted:`, checks.checkHighlights(corpus));
    const helix = path.join(ROOT, 'editors', 'helix', 'queries', g.name.replace('_', '-'), 'highlights.scm');
    report(`${g.name}: every corpus token is highlighted by the Helix queries:`,
      checks.checkHighlights(corpus, helix));
  } finally {
    corpus.cleanup();
  }
}

// Highlight and tags assertion tests (test/highlight/, test/tags/) need
// tree-sitter.json, which only the root has. The "no test/corpus" warning is
// expected.
if (!buildOnly) {
  execFileSync(TREE_SITTER, ['test'], { stdio: 'inherit', cwd: ROOT });
}

if (tagsFailures > 0) {
  console.error(`${tagsFailures} tags fixture(s) failed (rerun with --update to accept)`);
}
if (checkFailures > 0) {
  console.error(`${checkFailures} structural check(s) failed (see scripts/checks.js)`);
}
if (tagsFailures > 0 || checkFailures > 0) process.exit(1);

// Tags fixtures: <grammar>/test/tag-docs/<case> + <case>.expected.
// `tree-sitter tags` can't load the libraries built here, so this mimics how
// tree-sitter-tags attaches docs: one match per name, the lowest pattern
// index wins (the loser's docs are dropped).

function checkTagsFixtures(g, lib) {
  const dir = path.join(ROOT, g.name, 'test', 'tag-docs');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((f) => !f.endsWith('.expected'))) {
    const out = execFileSync(
      TREE_SITTER,
      ['query', '--lib-path', lib, '--lang-name', g.name, path.join(ROOT, g.name, 'queries', 'tags.scm'), path.join(dir, f)],
      { cwd: ROOT, encoding: 'utf8' },
    );
    const best = new Map();   // "row:col" -> { pattern, line }
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
    // git may check it out with CRLF on Windows.
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
