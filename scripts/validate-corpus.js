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
 *   project  -- Find every .uc / .uc.tmpl file under a directory and parse it.
 *               Auto-detects template vs raw mode from file content.
 *
 *                node scripts/validate-corpus.js project <path/to/project>
 *
 * Exits 0 when every file/testcase parses without ERROR nodes, and without a
 * MISSING node anywhere except exactly at end-of-input (ucode tolerates an
 * unclosed template block at EOF, so a MISSING statement_tag_close/etc. there
 * is expected recovery, not a grammar bug — see EXPECTED_INVALID's sibling
 * KNOWN_GRAMMAR_GAPS below for the distinction from a MISSING in the middle
 * of the file, which means the grammar failed to parse a real construct).
 * Exits 2 on a setup error (missing tree-sitter binary or unbuilt grammar
 * library, or zero files/testcases found) so a broken environment or a wrong
 * path cannot masquerade as a clean run.
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const TS_ROOT = path.dirname(__dirname);

// Match what `npm run build` / scripts/run-tests.js actually emit: .dll on
// Windows, .so everywhere else. tree-sitter build does not produce .dylib on
// macOS, so returning 'dylib' there pointed at a file that never exists.
function soExt() {
  return process.platform === 'win32' ? 'dll' : 'so';
}
const LIB_UCODE        = path.join(TS_ROOT, `ucode.${soExt()}`);
const LIB_UCODE_MARKUP = path.join(TS_ROOT, `ucode_markup.${soExt()}`);

// Prefer the devDependency binary so the script works without a global install.
const _tsLocal  = path.join(TS_ROOT, 'node_modules', '.bin', 'tree-sitter');
const TREE_SITTER = fs.existsSync(_tsLocal) ? _tsLocal : 'tree-sitter';

// ---------------------------------------------------------------------------
// Known-invalid testcases in the jow-/ucode corpus.
// These are code that ucode itself rejects at compile time — not grammar bugs.
// Key format: "<relative/path>#<testcase-index>"  (1-based, forward slashes)
// ---------------------------------------------------------------------------

const EXPECTED_INVALID = new Set([
  // --- Modules (invalid syntax) ---
  '04_modules/07_import_default#4',       // `import { default }` without `as` — invalid
  '04_modules/09_import_wildcard#2',      // `import *` without `as ns` — invalid

  // --- Object literals (invalid syntax) ---
  '00_syntax/13_object_literals#4',       // `{ "foo" }` — bare string is not a valid property

  // --- Function declarations (invalid parameter forms that ucode rejects) ---
  '00_syntax/15_function_declarations#4',  // function f(...args, ...args2) — multiple rest params
  '00_syntax/15_function_declarations#5',  // function f(...args, a, b) — rest param not last

  // --- For loops (invalid forms that ucode rejects) ---
  '00_syntax/16_for_loop#3',  // for (let x, y, z in {}) — three-variable for-in
  '00_syntax/16_for_loop#4',  // for (let x = 1, y in {}) — mixed initializer + for-in
  '00_syntax/16_for_loop#5',  // for (let x) — incomplete for
  '00_syntax/16_for_loop#6',  // for (let x, y) — incomplete for

  // --- Arrow functions (invalid parameter form) ---
  '00_syntax/19_arrow_functions#3',  // `(a + 1) => {}` — expression as arrow param

  // --- Regex literals ---
  '00_syntax/21_regex_literals#3',   // /test/x — unsupported x flag

  // --- Bug regression tests (invalid/crashing inputs) ---
  '99_bugs/14_incomplete_expression_at_eof#1',          // `{% 1+` — EOF mid-expression
  '99_bugs/15_segfault_on_prefix_increment#1',          // `{% ++"` — invalid prefix operand
  '99_bugs/18_hang_on_line_comments_at_eof#1',          // `{{ // }}` — comment consumes closing tag
  '99_bugs/18_hang_on_line_comments_at_eof#2',          // `{{ /* }}` — block comment consumes closing tag
  '99_bugs/32_compiler_switch_patchlist_corruption#2',  // `switch (*) {}` — invalid switch expression
  '99_bugs/35_vm_callframe_double_free#1', // "not reached" stub, test uses C API
  '99_bugs/37_compiler_unexpected_unary_op#1', // `1~1` — no binary ~ operator

  // --- Nesting one template block inside another is invalid ucode (compiler:
  //     "Template blocks may not be nested"), not merely a grammar gap. ---
  '00_syntax/05_block_nesting#1',

  // --- Malformed computed object keys (empty `[]:` / sequence `[a, b]:`) —
  //     ucode itself rejects these at parse time. ---
  '00_syntax/13_object_literals#7',

  // --- Unterminated backtick template inside `${ }` — ucode rejects with
  //     "Unterminated string"; this is genuinely invalid, not an EOF-tolerant
  //     unclosed template block. ---
  '00_syntax/27_template_literals#6',
]);

// ---------------------------------------------------------------------------
// Known grammar gaps in the jow-/ucode corpus.
//
// Unlike EXPECTED_INVALID (code ucode itself rejects), these are VALID ucode
// that this grammar does not yet support — real, tracked gaps, not corrected
// syntax errors. Keeping them here (rather than silently tolerating their
// MISSING nodes, or mislabeling them as EXPECTED_INVALID) keeps the corpus
// run green without hiding that the feature is unimplemented.
//
// Empty for the currently pinned ucode version (see README.md's "Targeted
// ucode version" section) — every construct in that corpus is either valid
// and supported, or invalid and in EXPECTED_INVALID above. This stays empty,
// not deleted: bumping the pinned commit is expected to repopulate it until
// the grammar catches up, exactly as it did (and was emptied again) here.
// ---------------------------------------------------------------------------

const KNOWN_GRAMMAR_GAPS = new Set([]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Abort the whole run with a clear message. Used for setup problems (missing
// binary / grammar library) that are not per-file parse results — without
// this the run would "pass" every file having actually parsed nothing.
function fatal(msg) {
  process.stderr.write(`\nvalidate-corpus: ${msg}\n`);
  process.exit(2);
}

// Both grammars are built together (npm run build), and corpus mode needs
// both; fail early with an actionable message rather than reporting every
// file as a spurious pass or failure.
function assertLibsExist() {
  const missing = [LIB_UCODE, LIB_UCODE_MARKUP].filter((p) => !fs.existsSync(p));
  if (missing.length) {
    fatal(
      'grammar library not found:\n' +
      missing.map((p) => `  ${p}`).join('\n') +
      '\nBuild the parsers first: `npm run build` (or `npm test`).',
    );
  }
}

// corpus mode: match {%/{{/{# anywhere — jow-/ucode test cases embed
// template output inline (e.g. "result = {{ expr }}") so the marker is
// rarely at the start of a line.
function isTemplateCorpus(code) {
  return /\{[%{#]/.test(code);
}

// project mode: require opener at start of line, matching tree-sitter.json
// content-regex so that format strings ("{%s}") in .uc code files don't
// falsely route them to the markup parser.
function isTemplateProject(code) {
  return /^[ \t]*\{[%{#]/m.test(code);
}

// Detect template fragments: files whose first statement tag ends with a bare `}`
// (closing a block opened in the caller's include context) rather than `%}`.
// These are partial templates that cannot be parsed as standalone files.
function isCodeFragment(code) {
  const line = code.split('\n')[0].trimEnd();
  return /^\{%/.test(line) && /[^%]\s*\}$/.test(line);
}

// The row (0-indexed, counting newlines) where an "at EOF" MISSING node may
// legitimately land. Whether trailing whitespace before EOF is consumed as
// part of an unclosed construct's own content varies by construct: a `{# #}`
// or `/* */` comment (or a string) spans raw newlines as content, so tree-sitter
// reports the missing closer AFTER them; an unclosed `{{ }}`/`{% %}` code tag
// treats trailing whitespace as skippable "extra" and reports the missing
// closer right after the last real token, BEFORE it. So both the trimmed and
// untrimmed last row count as "at EOF" — anywhere in between covers either
// construct without having to replicate the scanner's own whitespace rules.
function eofRows(code) {
  const untrimmedRow = code.split('\n').length - 1;
  const trimmedRow = code.replace(/\s+$/, '').split('\n').length - 1;
  return { min: trimmedRow, max: untrimmedRow };
}

// Every `(MISSING ... [row, col] - ...)` node's row.
function missingRows(output) {
  return [...output.matchAll(/\(MISSING\b[^[]*\[(\d+),/g)].map(([, row]) => Number(row));
}

function parse(code, tmpl) {
  const libPath  = tmpl ? LIB_UCODE_MARKUP : LIB_UCODE;
  const langName = tmpl ? 'ucode_markup'   : 'ucode';
  const suffix   = tmpl ? '.ucode'         : '.uc';
  const tmpFile  = path.join(os.tmpdir(), `ucode-validate-${process.pid}-${Date.now()}${suffix}`);
  fs.writeFileSync(tmpFile, code, 'utf8');
  try {
    const result = spawnSync(
      TREE_SITTER,
      ['parse', '--quiet', '--lib-path', libPath, '--lang-name', langName, tmpFile],
      { cwd: TS_ROOT, encoding: 'utf8' },
    );
    // The tree-sitter binary itself could not be spawned (e.g. not installed).
    if (result.error) {
      fatal(`could not run tree-sitter (${TREE_SITTER}): ${result.error.message}`);
    }
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    // The grammar library could not be loaded (missing/incompatible .so). This
    // is not a parse result: without this guard the ERROR grep below sees no
    // "ERROR" token and every file counts as a pass, so the run exits 0 having
    // parsed nothing.
    if (/Failed to load language|dlopen/i.test(output)) {
      fatal(`could not load ${langName} grammar from ${libPath}:\n${output.trim()}`);
    }
    // A real parse either succeeds (exit 0, empty output under --quiet) or
    // reports an ERROR/MISSING tree (exit 1, output naming the node). A crash
    // signal, or a non-zero exit that produced no output at all, is neither —
    // without this a scanner segfault (SIGSEGV → empty output) would be
    // silently counted as a clean parse. Surface it as a per-file failure so
    // the run names the offending input and keeps looking for others.
    if (result.signal || (result.status !== 0 && output.trim() === '')) {
      const how = result.signal
        ? `killed by signal ${result.signal}`
        : `exited with status ${result.status} and no output`;
      return { hasError: true, output: `tree-sitter ${how}` };
    }
    let hasError = /\bERROR\b/.test(output);
    if (!hasError) {
      // A MISSING node anywhere but at end-of-input means the grammar failed
      // to parse something mid-file — not the EOF-tolerant "unclosed
      // template block" recovery this script is meant to allow.
      const { min, max } = eofRows(code);
      hasError = missingRows(output).some((row) => row < min || row > max);
    }
    return { hasError, output: output.trim() };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

function printReport(ok, fail, skip, mode, gapSkip = 0) {
  const total = ok + fail.length + skip + gapSkip;
  // A wrong path, an empty checkout, or an extraction regex that stopped
  // matching would otherwise report "0/0 passed" and exit 0 — indistinguishable
  // from a genuinely clean, and much larger, run.
  if (total === 0) fatal(`no files/testcases found to validate [${mode}]`);

  let line = `\n${ok}/${total} passed`;
  if (skip)        line += `, ${skip} skipped (expected-invalid)`;
  if (gapSkip)     line += `, ${gapSkip} skipped (known grammar gap)`;
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
  let okCount = 0, skipCount = 0, gapCount = 0;
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
      const tmpl  = isTemplateCorpus(code);
      const label = `${rel} #${i + 1} [${tmpl ? 'tmpl' : 'raw'}]`;

      if (EXPECTED_INVALID.has(key)) {
        skipCount++;
        console.log(`  skip  ${label}`);
        return;
      }
      if (KNOWN_GRAMMAR_GAPS.has(key)) {
        gapCount++;
        console.log(`  gap   ${label}`);
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

  return printReport(okCount, fail, skipCount, 'corpus', gapCount);
}

// ---------------------------------------------------------------------------
// Mode: project  (real ucode project — parse .uc / .uc.tmpl files directly)
// ---------------------------------------------------------------------------

function runProject(projectDir) {
  let okCount = 0, skipCount = 0;
  const fail = [];

  for (const file of walkFiles(projectDir)) {
    if (!file.endsWith('.uc') && !file.endsWith('.uc.tmpl')) continue;

    let code;
    try { code = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    const rel   = path.relative(projectDir, file).replace(/\\/g, '/');
    const tmpl  = isTemplateProject(code);
    const label = `${rel} [${tmpl ? 'tmpl' : 'raw'}]`;

    if (tmpl && isCodeFragment(code)) {
      skipCount++;
      console.log(`  skip  ${label} (template fragment)`);
      continue;
    }

    const { hasError, output } = parse(code, tmpl);
    if (hasError) {
      fail.push({ label, code: code.slice(0, 400), output });
      console.log(`  FAIL  ${label}`);
    } else {
      okCount++;
      console.log(`  ok    ${label}`);
    }
  }

  return printReport(okCount, fail, skipCount, 'project');
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

assertLibsExist();

process.exit(mode === 'corpus' ? runCorpus(target) : runProject(target));
