#!/usr/bin/env node
'use strict';

/**
 * Parse real ucode code with the grammars.
 *
 *   corpus  <tests/custom>  every testcase of the jow-/ucode test suite
 *   project <dir>           every .uc / .uc.tmpl / .ut file
 *
 * Exits 0 when nothing has an ERROR or MISSING node (ucode never accepts a
 * file that would need one) and every EXPECTED_INVALID / KNOWN_GRAMMAR_GAPS
 * entry exists and still fails; 1 on failures; 2 on a setup error or when
 * nothing was found, so a broken environment can't pass.
 */

const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TS_ROOT = path.dirname(__dirname);

const { libPath } = require('./parsers');
const LIB_UCODE        = libPath('ucode');
const LIB_UCODE_MARKUP = libPath('ucode_markup');

const TREE_SITTER = require('./tree-sitter-cli');

// Testcases ucode itself rejects, as "<path>#<1-based index>". Each must still
// fail to parse, so an index that drifts can't silently skip a valid case.

const EXPECTED_INVALID = new Set([
  '04_modules/07_import_default#4',       // `import { default }` without `as` — invalid
  '04_modules/09_import_wildcard#2',      // `import *` without `as ns` — invalid

  '00_syntax/13_object_literals#4',       // `{ "foo" }` — bare string is not a valid property

  '00_syntax/15_function_declarations#4',  // function f(...args, ...args2) — multiple rest params
  '00_syntax/15_function_declarations#5',  // function f(...args, a, b) — rest param not last

  '00_syntax/16_for_loop#3',  // for (let x, y, z in {}) — three-variable for-in
  '00_syntax/16_for_loop#4',  // for (let x = 1, y in {}) — mixed initializer + for-in
  '00_syntax/16_for_loop#5',  // for (let x) — incomplete for
  '00_syntax/16_for_loop#6',  // for (let x, y) — incomplete for

  '00_syntax/19_arrow_functions#3',  // `(a + 1) => {}` — expression as arrow param

  '00_syntax/21_regex_literals#3',   // /test/x — unsupported x flag
  '00_syntax/21_regex_literals#4',   // `/foo \/` — unterminated regex

  '99_bugs/14_incomplete_expression_at_eof#1',          // `{% 1+` — EOF mid-expression
  '99_bugs/15_segfault_on_prefix_increment#1',          // `{% ++"` — invalid prefix operand
  '99_bugs/18_hang_on_line_comments_at_eof#1',          // `{{ // }}` — comment consumes closing tag
  '99_bugs/18_hang_on_line_comments_at_eof#2',          // `{{ /* }}` — block comment consumes closing tag
  '99_bugs/32_compiler_switch_patchlist_corruption#2',  // `switch (*) {}` — invalid switch expression
  '99_bugs/35_vm_callframe_double_free#1', // "not reached" stub, test uses C API
  '99_bugs/37_compiler_unexpected_unary_op#1', // `1~1` — no binary ~ operator

  '00_syntax/05_block_nesting#1',       // nested template blocks
  '00_syntax/01_unterminated_comment#1',             // `{{` / `{#` open at EOF
  '99_bugs/17_hang_on_unclosed_expression_block#1',  // (an open `{%` is valid)
  '00_syntax/13_object_literals#7',     // empty `[]:` / sequence `[a, b]:` key
  '00_syntax/27_template_literals#6',   // unterminated backtick inside `${ }`
]);

// Valid ucode the grammar doesn't support yet. Each must still fail to parse,
// so a fixed gap fails the run until its entry is removed. Empty for the
// pinned ucode commit; a bump may repopulate it.
const KNOWN_GRAMMAR_GAPS = new Set([]);

// Setup problems exit 2: otherwise every file would "pass" unparsed.
function fatal(msg) {
  process.stderr.write(`\nvalidate-corpus: ${msg}\n`);
  process.exit(2);
}

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

// Corpus testcases embed tags mid-line ("result = {{ expr }}").
function isTemplateCorpus(code) {
  return /\{[%{#]/.test(code);
}

// Same as tree-sitter.json's content-regex: an opener at line start, so a
// format string like "{%s}" doesn't make a .uc file a template.
function isTemplateProject(code) {
  return /^[ \t]*\{[%{#]/m.test(code);
}

// A fragment's first tag closes a block opened by its includer (`{% } …`);
// it can't parse standalone.
function isCodeFragment(code) {
  const line = code.split('\n')[0].trimEnd();
  return /^\{%/.test(line) && /[^%]\s*\}$/.test(line);
}

// One tree-sitter run per grammar; returns { hasError, output } per item.
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
      // A crash names no file: re-run one file at a time to find it.
      const each = batch ?? idx.map((i) => runParser([files[i]], tmpl, dir)?.[0] ??
        { hasError: true, output: 'tree-sitter crashed on this input' });
      idx.forEach((i, k) => { results[i] = each[k]; });
    }
    return results;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// null when tree-sitter crashed.
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
  if (result.error) {
    fatal(`could not run tree-sitter (${TREE_SITTER}): ${result.error.message}`);
  }
  const stdout = result.stdout ?? '';
  const output = stdout + (result.stderr ?? '');
  if (/Failed to load language|dlopen/i.test(output)) {
    fatal(`could not load ${langName} grammar from ${libPath}:\n${output.trim()}`);
  }
  // stdout: one "<padded path>\tParse: … (ERROR …)" line per failed file,
  // then the JSON summary (absent after a crash).
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
  // "0/0 passed" means a wrong path or a broken extraction regex.
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

// Files first, then subdirectories, sorted.
function* walkFiles(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) if (!e.isDirectory()) yield path.join(dir, e.name);
  for (const e of entries) if (e.isDirectory())  yield* walkFiles(path.join(dir, e.name));
}

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
