'use strict';
// Structural checks run by scripts/run-tests.js after each grammar's corpus
// tests. Corpus tests compare tree SHAPES only; these catch what they cannot:
//
//   checkExternals     the scanner's TokenType enum must list the grammar's
//                      external tokens in the same order (the generated parser
//                      indexes valid_symbols by position — a mismatch is a
//                      silent wrong-token bug, not a test failure).
//   checkPositions     no name-like node may start or end with whitespace
//                      (a lexer bug can absorb a neighbouring space into a
//                      token without changing the tree's shape — see b6f6574).
//   checkHighlights    every token of every corpus input must be covered by a
//                      highlights.scm capture, except the grammar's listed
//                      deliberate exceptions.
//
// All three use only the tree-sitter CLI (`parse --cst`, `query`), like the
// rest of the test runner, so the test job needs no npm dependencies.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TREE_SITTER = require('./tree-sitter-cli');

const ROOT = path.dirname(__dirname);

// ---------------------------------------------------------------------------
// External tokens vs the scanner's enum
// ---------------------------------------------------------------------------

// `_template_chars` → TEMPLATE_CHARS, `comment_content` → COMMENT_CONTENT
function enumName(external) {
  return external.replace(/^_+/, '').toUpperCase();
}

function scannerEnum(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const m = src.match(/enum\s+TokenType\s*\{([^}]*)\}/);
  if (!m) throw new Error(`no enum TokenType in ${file}`);
  return m[1].split(',').map((s) => s.replace(/\/\*.*?\*\/|\/\/.*$/gm, '').trim()).filter(Boolean);
}

function grammarExternals(grammar) {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, grammar, 'src', 'grammar.json'), 'utf8'));
  return json.externals.map((e) => e.name);
}

// Returns a list of problems (empty when consistent).
function checkExternals() {
  const problems = [];
  const pairs = [
    ['ucode', 'common/scanner.h'],
    ['ucode_markup', 'common/scanner.h'],
    ['ucdocs', 'ucdocs/src/scanner.c'],
  ];
  for (const [grammar, scanner] of pairs) {
    const externals = grammarExternals(grammar);
    const tokens = scannerEnum(scanner);
    if (externals.length !== tokens.length) {
      problems.push(`${grammar}: ${externals.length} externals but ${scanner} has ${tokens.length} TokenType entries`);
    }
    externals.forEach((ext, i) => {
      if (tokens[i] !== enumName(ext)) {
        problems.push(`${grammar}: external #${i} is ${ext}, but ${scanner} TokenType #${i} is ${tokens[i]} (expected ${enumName(ext)})`);
      }
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Corpus inputs
// ---------------------------------------------------------------------------

// Every non-:error test input of a grammar's corpus, written to a temp dir.
function corpusInputs(grammar) {
  const dir = path.join(ROOT, grammar, 'test', 'corpus');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
    const re = /^={3,}\n(.*)\n((?::\S+\n)*)={3,}\n([\s\S]*?)\n-{3,}\n/gm;
    let m;
    while ((m = re.exec(text))) {
      if (/^:error$/m.test(m[2])) continue;
      out.push({ name: `${f}: ${m[1].trim()}`, source: m[3].replace(/^\n/, '') });
    }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ts-ucode-${grammar}-`));
  out.forEach((t, i) => {
    t.file = path.join(tmp, `${String(i).padStart(4, '0')}.txt`);
    fs.writeFileSync(t.file, t.source);
  });
  return { tests: out, tmp };
}

// ---------------------------------------------------------------------------
// CST parsing (`tree-sitter parse --cst`)
// ---------------------------------------------------------------------------

// Lines look like:  "0:13 - 0:14               object: identifier `x`"
// A `•` marks nodes on the path to a parse error; it sits just before the
// label without shifting it. Column padding varies per file (it grows with the
// row/column numbers), so depth is measured from each file's root label.
const CST_LINE = /^(\d+):(\d+)\s+-\s+(\d+):(\d+)(\s+)(•?)((?:\w+: )?)("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\S+)/;

const ROOT_TYPE = { ucode: 'program', ucode_markup: 'markup', ucdocs: 'document' };

// One node list per parsed file. A file's tree starts at its root node (the
// only node of the grammar's root type); depth is the label's indentation
// relative to that root, two columns per level.
function parseCst(output, grammar) {
  const files = [];
  let nodes = null;
  let rootIndent = 0;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
    const m = line.match(CST_LINE);
    if (!m) continue;
    const label = m[8];
    // `text` lines are not nodes: the CLI prints a multi-line node's text as
    // extra display lines under it (with their own, inconsistent padding).
    if (label.startsWith('`')) continue;
    const indent = m[0].length - m[7].length - label.length;   // where `field: label` starts
    if (label === ROOT_TYPE[grammar]) {
      nodes = [];
      files.push(nodes);
      rootIndent = indent;
    }
    if (!nodes) continue;
    const depth = (indent - rootIndent) / 2;
    const prev = nodes[nodes.length - 1];
    if (!Number.isInteger(depth) || depth < 0 || (prev && depth > prev.depth + 1)) {
      throw new Error(`unexpected \`tree-sitter parse --cst\` layout at: ${line}`);
    }
    nodes.push({
      sr: +m[1], sc: +m[2], er: +m[3], ec: +m[4],
      depth,
      named: !label.startsWith('"'),   // "tok" is an anonymous token
      type: label.startsWith('"') ? label.slice(1, -1).replace(/\\(.)/g, '$1') : label,
    });
  }
  // Mark leaves: a node whose next line is not deeper.
  for (const nodes of files) {
    nodes.forEach((n, i) => { n.leaf = !(nodes[i + 1] && nodes[i + 1].depth > n.depth); });
  }
  return files;
}

// Run the tree-sitter CLI and return its stdout. `parse` exits 1 when any input
// contains an ERROR node (some corpus tests expect one); its output is still
// complete, and those inputs are skipped by the checks, so accept it.
function treeSitter(args) {
  try {
    return execFileSync(TREE_SITTER, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    if (e.status === 1 && e.stdout) return e.stdout;
    throw e;
  }
}

// CST node lists for `files`, or null for a file whose tree contains an error.
// Error trees are skipped by every check, and are filtered out before asking
// for CST output: the CLI prints a `•` path-to-error marker there that shifts
// some lines' indentation, which would make depths unrecoverable.
function cst(lib, grammar, files) {
  const tmp = path.dirname(files[0]);
  const all = path.join(tmp, 'all.list');
  fs.writeFileSync(all, files.join('\n'));
  const quiet = treeSitter(['parse', '--lib-path', lib, '--lang-name', grammar, '--quiet', '--paths', all]);
  const broken = new Set(files.filter((f) => quiet.includes(f)));
  const clean = files.filter((f) => !broken.has(f));
  const list = path.join(tmp, 'clean.list');
  fs.writeFileSync(list, clean.join('\n'));
  const trees = parseCst(
    treeSitter(['parse', '--lib-path', lib, '--lang-name', grammar, '--cst', '--paths', list]),
    grammar,
  );
  if (trees.length !== clean.length) {
    throw new Error(`${grammar}: expected ${clean.length} CST trees, parsed ${trees.length}`);
  }
  let k = 0;
  return files.map((f) => (broken.has(f) ? null : trees[k++]));
}

// Byte offset of (row, column) in a UTF-8 buffer.
function offsets(buf) {
  const starts = [0];
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) starts.push(i + 1);
  return (row, col) => starts[row] + col;
}


// ---------------------------------------------------------------------------
// Positions: name-like nodes never start or end with whitespace
// ---------------------------------------------------------------------------

// Named leaves whose text is content and may legitimately start or end with
// whitespace (prose, raw template text, string bodies, …).
const CONTENT_NODES = new Set([
  'raw_text', 'comment', 'comment_content', 'string_fragment', 'regex_pattern',
  'hash_bang_line', 'description',
]);

function checkPositions(lib, grammar) {
  const { tests, tmp } = corpusInputs(grammar);
  const trees = cst(lib, grammar, tests.map((t) => t.file));
  const problems = [];
  tests.forEach((t, i) => {
    const nodes = trees[i];
    if (!nodes) return;
    const buf = Buffer.from(t.source, 'utf8');
    const at = offsets(buf);
    for (const n of nodes) {
      if (!n.named || !n.leaf || CONTENT_NODES.has(n.type)) continue;
      const text = buf.subarray(at(n.sr, n.sc), at(n.er, n.ec)).toString('utf8');
      if (text.length && /^\s|\s$/.test(text)) {
        problems.push(`${t.name}: ${n.type} at ${n.sr}:${n.sc} is ${JSON.stringify(text)}`);
      }
    }
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return problems;
}

// ---------------------------------------------------------------------------
// Highlight coverage
// ---------------------------------------------------------------------------

// Tokens a grammar deliberately leaves to the surrounding colour.
const UNHIGHLIGHTED = {
  ucode: new Set(),
  ucode_markup: new Set(['raw_text']),   // literal template text between tags
  ucdocs: new Set(['/**']),             // the opener keeps the host comment's colour
};

const CAPTURE = /capture: (?:\d+ - )?([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)/;

// `queryFile` defaults to the grammar's own highlights.scm (the Helix copies
// under editors/helix/ are checked with the same exceptions).
function checkHighlights(lib, grammar, queryFile = path.join(ROOT, grammar, 'queries', 'highlights.scm')) {
  const { tests, tmp } = corpusInputs(grammar);
  const files = tests.map((t) => t.file);
  const trees = cst(lib, grammar, files);
  const list = path.join(tmp, 'clean.list');
  const out = treeSitter(['query', '--lib-path', lib, '--lang-name', grammar, queryFile, '--paths', list]);
  // Captures per file: the query output names each file before its captures.
  const byFile = new Map(files.map((f) => [f, []]));
  let current = null;
  for (const line of out.split(/\r?\n/)) {
    if (byFile.has(line.trim())) { current = byFile.get(line.trim()); continue; }
    const m = line.match(CAPTURE);
    if (!m || !current) continue;
    if (m[1].startsWith('_') || m[1] === 'spell' || m[1] === 'nospell') continue;
    current.push({ sr: +m[2], sc: +m[3], er: +m[4], ec: +m[5] });
  }
  const before = (r1, c1, r2, c2) => r1 < r2 || (r1 === r2 && c1 <= c2);
  const problems = [];
  tests.forEach((t, i) => {
    const nodes = trees[i];
    if (!nodes) return;
    const caps = byFile.get(t.file);
    for (const n of nodes) {
      if (!n.leaf || (n.sr === n.er && n.sc === n.ec)) continue;
      if (UNHIGHLIGHTED[grammar].has(n.type)) continue;
      const covered = caps.some((c) => before(c.sr, c.sc, n.sr, n.sc) && before(n.er, n.ec, c.er, c.ec));
      if (!covered) problems.push(`${t.name}: ${n.named ? n.type : JSON.stringify(n.type)} at ${n.sr}:${n.sc} has no highlight`);
    }
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return problems;
}

module.exports = { checkExternals, checkPositions, checkHighlights };
