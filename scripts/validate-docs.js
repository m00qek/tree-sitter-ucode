#!/usr/bin/env node
'use strict';
/**
 * Parse every doc comment in the .c / .h / .uc files directly in each <dir>
 * with the ucdocs grammar (CI: ucode's own sources, the canonical corpus).
 *
 *   node scripts/validate-docs.js <dir>...
 *
 * Exits 1 on a failure outside KNOWN_INVALID, 2 on a setup error or when no
 * doc comment is found.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TREE_SITTER = require('./tree-sitter-cli');

const ROOT = path.dirname(__dirname);
const LIB = require('./parsers').libPath('ucdocs');

// Malformed upstream. Matched by snippet, so line shifts don't break them.
const KNOWN_INVALID = [
  { file: 'uloop.c', snippet: '{@link module:uloop#process|process().', why: 'unclosed {@link' },
  { file: 'uloop.c', snippet: '{@link module:uloop#task|task().', why: 'unclosed {@link' },
];

function fatal(msg) {
  process.stderr.write(`\nvalidate-docs: ${msg}\n`);
  process.exit(2);
}

function* docComments(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (!/\.(c|h|uc)$/.test(name)) continue;
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    // Not a `/***` banner nor the empty `/**/`.
    const re = /\/\*\*(?![*/])[\s\S]*?\*\//g;
    let m;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      yield { file, name, line, doc: m[0] };
    }
  }
}

const dirs = process.argv.slice(2);
if (!dirs.length) fatal('usage: node scripts/validate-docs.js <dir>...');
if (!fs.existsSync(LIB)) {
  fatal(`ucdocs parser not found: ${LIB}\nBuild it first: \`node scripts/run-tests.js --build-only\`.`);
}

const docs = dirs.flatMap((d) => [...docComments(d)]);
if (!docs.length) fatal(`no doc comments found in: ${dirs.join(', ')}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ucdocs-validate-'));
docs.forEach((d, i) => {
  d.tmp = path.join(tmp, `${String(i).padStart(5, '0')}.doc`);
  fs.writeFileSync(d.tmp, d.doc);
});
const list = path.join(tmp, 'docs.list');
fs.writeFileSync(list, docs.map((d) => d.tmp).join('\n'));

// `--quiet` prints only the failing files, and exits 1 if there are any.
let out;
try {
  out = execFileSync(TREE_SITTER,
    ['parse', '--lib-path', LIB, '--lang-name', 'ucdocs', '--quiet', '--paths', list],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  if (e.status !== 1 || !e.stdout) fatal(`tree-sitter parse failed:\n${e.stderr || e.message}`);
  out = e.stdout;
}

let failed = 0;
let known = 0;
for (const d of docs) {
  if (!out.includes(d.tmp)) continue;
  const k = KNOWN_INVALID.find((k) => k.file === d.name && d.doc.includes(k.snippet));
  if (k) { known++; continue; }
  failed++;
  console.log(`  FAIL  ${path.relative(process.cwd(), d.file)}:${d.line}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

let summary = `${docs.length - failed - known}/${docs.length} doc comments parsed`;
if (known) summary += `, ${known} skipped (known invalid upstream)`;
if (failed) summary += `, ${failed} FAILED`;
console.log(`${summary}  [ucdocs]`);
process.exit(failed ? 1 : 0);
