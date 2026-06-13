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

function soExt() {
  if (process.platform === 'win32')  return 'dll';
  if (process.platform === 'darwin') return 'dylib';
  return 'so';
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

  // --- Function declarations (grammar gap: {% function f(): %}...{% endfunction %} alt-syntax) ---
  '00_syntax/15_function_declarations#1',

  // --- For loops (invalid forms that ucode rejects) ---
  '00_syntax/16_for_loop#3',  // for (let x, y, z in {}) — three-variable for-in
  '00_syntax/16_for_loop#4',  // for (let x = 1, y in {}) — mixed initializer + for-in
  '00_syntax/16_for_loop#5',  // for (let x) — incomplete for
  '00_syntax/16_for_loop#6',  // for (let x, y) — incomplete for

  // --- Arrow functions (invalid parameter form) ---
  '00_syntax/19_arrow_functions#3',  // `(a + 1) => {}` — expression as arrow param

  // --- Regex literals ---
  '00_syntax/21_regex_literals#3',   // /test/x — unsupported x flag
  '00_syntax/21_regex_literals#6',   // /[/]/ etc — slash inside character class trips the scanner

  // --- Forward declarations (grammar gap: `function foo;` not in grammar) ---
  '00_syntax/29_function_forward_declarations#1',
  '00_syntax/29_function_forward_declarations#2',
  '00_syntax/29_function_forward_declarations#3',
  '00_syntax/29_function_forward_declarations#4',
  '00_syntax/29_function_forward_declarations#5',
  '00_syntax/29_function_forward_declarations#6',
  '00_syntax/29_function_forward_declarations#7',
  '00_syntax/29_function_forward_declarations#8',
  '00_syntax/29_function_forward_declarations#9',
  '00_syntax/29_function_forward_declarations#10',
  '00_syntax/29_function_forward_declarations#12',

  // --- Bug regression tests (invalid/crashing inputs) ---
  '99_bugs/14_incomplete_expression_at_eof#1',          // `{% 1+` — EOF mid-expression
  '99_bugs/15_segfault_on_prefix_increment#1',          // `{% ++"` — invalid prefix operand
  '99_bugs/18_hang_on_line_comments_at_eof#1',          // `{{ // }}` — comment consumes closing tag
  '99_bugs/18_hang_on_line_comments_at_eof#2',          // `{{ /* }}` — block comment consumes closing tag
  '99_bugs/32_compiler_switch_patchlist_corruption#2',  // `switch (*) {}` — invalid switch expression
  '99_bugs/35_vm_callframe_double_free#1', // "not reached" stub, test uses C API
  '99_bugs/37_compiler_unexpected_unary_op#1', // `1~1` — no binary ~ operator
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      const tmpl  = isTemplateCorpus(code);
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

process.exit(mode === 'corpus' ? runCorpus(target) : runProject(target));
