#!/usr/bin/env node
'use strict';

/**
 * Validate the ucode tree-sitter grammar against real ucode code.
 *
 * Two modes:
 *
 *   corpus   -- Extract testcase blocks from the jow-/ucode test suite format
 *               and parse each one.  Pass the path to the tests/custom/ directory.
 *
 *                node scripts/validate-corpus.js corpus <path/to/tests/custom>
 *
 *   project  -- Find every .uc / .utpl file under a directory and parse it.
 *               Auto-detects template vs raw mode from file content.
 *
 *                node scripts/validate-corpus.js project <path/to/project>
 *
 * Exits 0 when every file/testcase parses without ERROR nodes.
 * MISSING nodes (unclosed template blocks, which ucode supports at EOF) are tolerated.
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const TS_ROOT = path.dirname(__dirname);
const TS_TMPL = path.join(TS_ROOT, 'tmpl');

// Prefer the devDependency binary so the script works without a global install.
const _tsLocal  = path.join(TS_ROOT, 'node_modules', '.bin', 'tree-sitter');
const TREE_SITTER = fs.existsSync(_tsLocal) ? _tsLocal : 'tree-sitter';

// ---------------------------------------------------------------------------
// Known-invalid testcases in the jow-/ucode corpus.
// These are code that ucode itself rejects at compile time — not grammar bugs.
// Key format: "<relative/path>#<testcase-index>"  (1-based, forward slashes)
// ---------------------------------------------------------------------------

const EXPECTED_INVALID = new Set([
  '04_modules/07_import_default#4',       // `import { default }` without `as` — invalid
  '04_modules/09_import_wildcard#2',      // `import *` without `as ns` — invalid
  '99_bugs/35_vm_callframe_double_free#1', // "not reached" stub, test uses C API
  '99_bugs/37_compiler_unexpected_unary_op#1', // `1~1` — no binary ~ operator
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTemplate(code) {
  return /\{[%{#]/.test(code);
}

function parse(code, tmpl) {
  const suffix     = tmpl ? '.utpl' : '.uc';
  const grammarDir = tmpl ? TS_TMPL : TS_ROOT;
  const tmpFile    = path.join(os.tmpdir(), `ucode-validate-${process.pid}-${Date.now()}${suffix}`);
  fs.writeFileSync(tmpFile, code, 'utf8');
  try {
    const result = spawnSync(TREE_SITTER, ['parse', '--quiet', '-p', grammarDir, tmpFile], {
      cwd: TS_ROOT, encoding: 'utf8',
    });
    const output   = (result.stdout ?? '') + (result.stderr ?? '');
    const hasError = /\bERROR\b/.test(output);
    return { hasError, output: output.trim() };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function printReport(ok, fail, skip, mode) {
  const total = ok + fail.length + skip;
  let line = `\n${ok}/${total} passed`;
  if (skip)        line += `, ${skip} skipped (expected-invalid)`;
  if (fail.length) line += `, ${fail.length} FAILED`;
  console.log(line + `  [${mode}]`);

  if (fail.length) {
    console.log('\n--- Failures ---');
    for (const { label, code, output } of fail) {
      console.log(`\n=== ${label} ===`);
      console.log(code.slice(0, 400).trimEnd());
      console.log('---');
      console.log(output.slice(0, 300));
    }
  }
  return fail.length > 0 ? 1 : 0;
}

// Walk a directory, yielding files before recursing into subdirectories.
function* walkFiles(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) if (!e.isDirectory()) yield path.join(dir, e.name);
  for (const e of entries) if (e.isDirectory())  yield* walkFiles(path.join(dir, e.name));
}

// ---------------------------------------------------------------------------
// Mode: corpus  (jow-/ucode test suite)
// ---------------------------------------------------------------------------

function runCorpus(testsDir) {
  let okCount = 0, skipCount = 0;
  const fail = [];

  for (const file of walkFiles(testsDir)) {
    const name = path.basename(file);
    if (name === 'CMakeLists.txt' || name === 'run_tests.uc') continue;

    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    const rel   = path.relative(testsDir, file).replace(/\\/g, '/');
    const cases = [...text.matchAll(/-- Testcase --\n([\s\S]*?)-- End --/g)];

    cases.forEach(([, code], i) => {
      const key   = `${rel}#${i + 1}`;
      const tmpl  = isTemplate(code);
      const label = `${rel} #${i + 1} [${tmpl ? 'tmpl' : 'raw'}]`;

      if (EXPECTED_INVALID.has(key)) {
        skipCount++;
        console.log(`  skip  ${label}`);
        return;
      }

      const { hasError, output } = parse(code, tmpl);
      if (hasError) {
        fail.push({ label, code: code.trim(), output });
        console.log(`  FAIL  ${label}`);
      } else {
        okCount++;
        console.log(`  ok    ${label}`);
      }
    });
  }

  return printReport(okCount, fail, skipCount, 'corpus');
}

// ---------------------------------------------------------------------------
// Mode: project  (real ucode project — parse .uc / .utpl files directly)
// ---------------------------------------------------------------------------

function runProject(projectDir) {
  let okCount = 0;
  const fail = [];

  for (const file of walkFiles(projectDir)) {
    if (!file.endsWith('.uc') && !file.endsWith('.utpl')) continue;

    let code;
    try { code = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    const rel   = path.relative(projectDir, file).replace(/\\/g, '/');
    const tmpl  = isTemplate(code);
    const label = `${rel} [${tmpl ? 'tmpl' : 'raw'}]`;

    const { hasError, output } = parse(code, tmpl);
    if (hasError) {
      fail.push({ label, code: code.slice(0, 400), output });
      console.log(`  FAIL  ${label}`);
    } else {
      okCount++;
      console.log(`  ok    ${label}`);
    }
  }

  return printReport(okCount, fail, 0, 'project');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const [,, mode, target] = process.argv;

if (!target || !['corpus', 'project'].includes(mode)) {
  process.stderr.write(
    'Usage:\n' +
    '  node scripts/validate-corpus.js corpus  <path/to/tests/custom>\n' +
    '  node scripts/validate-corpus.js project <path/to/project>\n'
  );
  process.exit(2);
}

process.exit(mode === 'corpus' ? runCorpus(target) : runProject(target));
