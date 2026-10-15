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
 *   project  -- Find every .uc / .uc.tmpl / .ut file under a directory and
 *               parse it. `.ut` files are templates; the others are detected
 *               from their content.
 *
 *                node scripts/validate-corpus.js project <path/to/project>
 *
 * Exits 0 when every file/testcase parses without ERROR or MISSING nodes, and
 * every EXPECTED_INVALID / KNOWN_GRAMMAR_GAPS testcase exists and still fails
 * to parse. A file ucode accepts never needs a MISSING node: a template that
 * ends inside an open `{%` tag parses clean, and the other unclosed constructs
 * (`{{`, `{#`, `{`, `/*`, …) are errors in ucode too.
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
const LIB_UCODE        = path.join(TS_ROOT, '.build', 'parsers', `ucode.${soExt()}`);
const LIB_UCODE_MARKUP = path.join(TS_ROOT, '.build', 'parsers', `ucode_markup.${soExt()}`);

const TREE_SITTER = require('./tree-sitter-cli');

// ---------------------------------------------------------------------------
// Known-invalid testcases in the jow-/ucode corpus.
// These are code that ucode itself rejects at compile time — not grammar bugs.
// Key format: "<relative/path>#<testcase-index>"  (1-based, forward slashes)
//
// These testcases are parsed too, and must fail to: one that parses clean (or
// a key that names no testcase) fails the run, so an index that drifts after
// a corpus change cannot silently skip a valid testcase.
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
  '00_syntax/21_regex_literals#4',   // `/foo \/` — unterminated regex; ucode
                                     //   rejects "Unterminated string" (the
                                     //   testcase is named "regex compilation
                                     //   errors" and expects a syntax error)

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

  // --- `{{ … ` / `{# …` left open at EOF — "Unterminated template block".
  //     (An open `{% …` at EOF is valid, and parses clean.) ---
  '00_syntax/01_unterminated_comment#1',
  '99_bugs/17_hang_on_unclosed_expression_block#1',

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
// syntax errors. Keeping them here (rather than mislabeling them as
// EXPECTED_INVALID) keeps the corpus run green without hiding that the
// feature is unimplemented. Like EXPECTED_INVALID, each must still fail to
// parse, so a fixed gap shows up as a failure until its entry is removed.
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
      '\nBuild the parsers first: `node scripts/run-tests.js --build-only` (or `npm test`).',
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

// Parse every item ({ code, tmpl }) with one tree-sitter run per grammar,
// and return a { hasError, output } result for each, in order. hasError is
// true for any ERROR or MISSING node.
function parseAll(items) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ucode-validate-'));
  try {
    const files = items.map(({ code, tmpl }, i) => {
      const file = path.join(dir, `${i}.${tmpl ? 'ut' : 'uc'}`);
      fs.writeFileSync(file, code, 'utf8');
      return file;
    });
    const results = new Array(items.length);
    for (const tmpl of [false, true]) {
      const idx = items.flatMap((item, i) => (item.tmpl === tmpl ? [i] : []));
      if (!idx.length) continue;
      const batch = runParser(idx.map((i) => files[i]), tmpl, dir);
      // A crash names no file. Re-run the batch one file at a time, so the
      // report points at the input that crashed and the rest still count.
      const each = batch ?? idx.map((i) => runParser([files[i]], tmpl, dir)?.[0] ??
        { hasError: true, output: 'tree-sitter crashed on this input' });
      idx.forEach((i, k) => { results[i] = each[k]; });
    }
    return results;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Run `tree-sitter parse` over files; return one result per file, or null if
// tree-sitter crashed.
function runParser(files, tmpl, dir) {
  const libPath  = tmpl ? LIB_UCODE_MARKUP : LIB_UCODE;
  const langName = tmpl ? 'ucode_markup'   : 'ucode';
  const pathsFile = path.join(dir, 'paths.txt');
  fs.writeFileSync(pathsFile, files.join('\n') + '\n', 'utf8');
  const result = spawnSync(
    TREE_SITTER,
    ['parse', '--quiet', '--json-summary', '--lib-path', libPath, '--lang-name', langName,
     '--paths', pathsFile],
    { cwd: TS_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // The tree-sitter binary itself could not be spawned (e.g. not installed).
  if (result.error) {
    fatal(`could not run tree-sitter (${TREE_SITTER}): ${result.error.message}`);
  }
  const stdout = result.stdout ?? '';
  const output = stdout + (result.stderr ?? '');
  // The grammar library could not be loaded (missing/incompatible .so). This
  // is not a parse result, and without this guard nothing would fail.
  if (/Failed to load language|dlopen/i.test(output)) {
    fatal(`could not load ${langName} grammar from ${libPath}:\n${output.trim()}`);
  }
  // stdout is one line per failed file ("<path>\tParse: … (ERROR …)", the
  // path padded with spaces to a common width), then the JSON summary. A
  // crash (e.g. a scanner segfault) leaves no summary.
  const json = stdout.startsWith('{') ? 0 : stdout.indexOf('\n{') + 1;
  let summaries;
  try {
    summaries = JSON.parse(stdout.slice(json)).parse_summaries;
  } catch {
    return null;
  }
  const successful = new Map(summaries.map((s) => [s.file, s.successful]));
  if (result.signal || !files.every((file) => successful.has(file))) return null;
  const errors = new Map(stdout.slice(0, json).trimEnd().split('\n')
    .map((line) => line.split('\t'))
    .map(([file, ...rest]) => [file.trimEnd(), rest.join('\t').replace(/^Parse:.*?\(/, '(')]));
  return files.map((file) => ({
    hasError: !successful.get(file),
    output: successful.get(file) ? '' : errors.get(file) ?? 'parse failed',
  }));
}

function printReport(ok, fail, skips, mode) {
  const skipped = Object.values(skips).reduce((a, b) => a + b, 0);
  const total = ok + fail.length + skipped;
  // A wrong path, an empty checkout, or an extraction regex that stopped
  // matching would otherwise report "0/0 passed" and exit 0 — indistinguishable
  // from a genuinely clean, and much larger, run.
  if (total === 0) fatal(`no files/testcases found to validate [${mode}]`);

  let line = `\n${ok}/${total} passed`;
  for (const [why, n] of Object.entries(skips)) if (n) line += `, ${n} ${why}`;
  if (fail.length) line += `, ${fail.length} FAILED`;
  console.log(line + `  [${mode}]`);

  if (fail.length) {
    console.log('\n--- Failures ---');
    for (const { label, code, output } of fail) {
      console.log(`\n=== ${label} ===`);
      if (code) {
        console.log(code.slice(0, 400).trimEnd());
        console.log('---');
      }
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
  const cases = [];
  for (const file of walkFiles(testsDir)) {
    const name = path.basename(file);
    if (name === 'CMakeLists.txt' || name === 'run_tests.uc') continue;

    let text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    const rel = path.relative(testsDir, file).replace(/\\/g, '/');
    [...text.matchAll(/-- Testcase --\n([\s\S]*?)-- End --/g)].forEach(([, code], i) => {
      const tmpl = isTemplateCorpus(code);
      cases.push({
        key: `${rel}#${i + 1}`,
        label: `${rel} #${i + 1} [${tmpl ? 'tmpl' : 'raw'}]`,
        code,
        tmpl,
      });
    });
  }

  let okCount = 0;
  const skips = { 'expected-invalid': 0, 'known grammar gaps': 0 };
  const fail = [];
  const results = parseAll(cases);

  cases.forEach(({ key, label, code }, i) => {
    const { hasError, output } = results[i];
    const expected = EXPECTED_INVALID.has(key) ? 'expected-invalid'
      : KNOWN_GRAMMAR_GAPS.has(key) ? 'known grammar gaps' : null;
    if (expected && hasError) {
      skips[expected]++;
      console.log(`  ${expected === 'expected-invalid' ? 'inv ' : 'gap '}  ${label}`);
    } else if (expected) {
      fail.push({ label, code: code.trim(), output: `listed in ${expected} but parses clean` });
      console.log(`  FAIL  ${label}`);
    } else if (hasError) {
      fail.push({ label, code: code.trim(), output });
      console.log(`  FAIL  ${label}`);
    } else {
      okCount++;
      console.log(`  ok    ${label}`);
    }
  });

  const keys = new Set(cases.map(({ key }) => key));
  for (const key of [...EXPECTED_INVALID, ...KNOWN_GRAMMAR_GAPS]) {
    if (!keys.has(key)) fail.push({ label: key, output: 'listed, but no such testcase' });
  }

  return printReport(okCount, fail, skips, 'corpus');
}

// ---------------------------------------------------------------------------
// Mode: project  (real ucode project — parse .uc / .uc.tmpl / .ut files)
// ---------------------------------------------------------------------------

function runProject(projectDir) {
  const files = [];
  const skips = { 'template fragments': 0 };
  for (const file of walkFiles(projectDir)) {
    if (!/\.(uc|uc\.tmpl|ut)$/.test(file)) continue;

    let code;
    try { code = fs.readFileSync(file, 'utf8'); }
    catch { continue; }

    const rel   = path.relative(projectDir, file).replace(/\\/g, '/');
    const tmpl  = file.endsWith('.ut') || isTemplateProject(code);
    const label = `${rel} [${tmpl ? 'tmpl' : 'raw'}]`;

    if (tmpl && isCodeFragment(code)) {
      skips['template fragments']++;
      console.log(`  skip  ${label} (template fragment)`);
      continue;
    }
    files.push({ label, code, tmpl });
  }

  let okCount = 0;
  const fail = [];
  const results = parseAll(files);
  files.forEach(({ label, code }, i) => {
    const { hasError, output } = results[i];
    if (hasError) {
      fail.push({ label, code: code.slice(0, 400), output });
      console.log(`  FAIL  ${label}`);
    } else {
      okCount++;
      console.log(`  ok    ${label}`);
    }
  });

  return printReport(okCount, fail, skips, 'project');
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
