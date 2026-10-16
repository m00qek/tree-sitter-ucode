'use strict';
// Checks run after each grammar's corpus tests, for what tree shapes miss:
//
//   checkExternals   the scanner's TokenType enum matches the externals, in
//                    order (valid_symbols is indexed by position)
//   checkPositions   no node absorbs neighbouring whitespace
//   checkHighlights  every corpus token has a highlight capture
//
// CLI only (no npm dependencies), so the CI test job can run them.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const TREE_SITTER = require('./tree-sitter-cli');

const ROOT = path.dirname(__dirname);

// `_template_chars` → TEMPLATE_CHARS, `comment_content` → COMMENT_CONTENT
function enumName(external) {
  return external.replace(/^_+/, '').toUpperCase();
}

function scannerEnum(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const m = src.match(/enum\s+TokenType\s*\{([^}]*)\}/);
  if (!m) throw new Error(`no enum TokenType in ${file}`);
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function grammarExternals(grammar) {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, grammar, 'src', 'grammar.json'), 'utf8'));
  return json.externals.map((e) => e.name);
}

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

// Every non-:error corpus input, written to a temp dir with its line endings
// kept (crlf.txt), as `tree-sitter test` does.
function corpusInputs(grammar) {
  const dir = path.join(ROOT, grammar, 'test', 'corpus');
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const re = /^={3,}\r?\n(.*?)\r?\n((?::\S+\r?\n)*)={3,}\r?\n([\s\S]*?)\r?\n-{3,}\r?\n/gm;
    let m;
    while ((m = re.exec(text))) {
      if (/^:error\r?$/m.test(m[2])) continue;
      out.push({ name: `${f}: ${m[1].trim()}`, source: m[3].replace(/^\r?\n/, '') });
    }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ts-ucode-${grammar}-`));
  out.forEach((t, i) => {
    t.file = path.join(tmp, `${String(i).padStart(4, '0')}.txt`);
    fs.writeFileSync(t.file, t.source);
  });
  return { tests: out, tmp };
}

// `tree-sitter parse --cst` lines: "0:13 - 0:14     object: identifier `x`".
// Padding grows with the row/column numbers, so depth is measured from each
// file's root label, two columns per level.
const CST_LINE = /^(\d+):(\d+)\s+-\s+(\d+):(\d+)(\s+)(•?)((?:\w+: )?)("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\S+)/;

const ROOT_TYPE = { ucode: 'program', ucode_markup: 'markup', ucdocs: 'document' };

// One node list per parsed file.
function parseCst(output, grammar) {
  const files = [];
  let nodes = null;
  let rootIndent = 0;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
    const m = line.match(CST_LINE);
    if (!m) continue;
    const label = m[8];
    // Continuation lines of a multi-line node's text, not nodes.
    if (label.startsWith('`')) continue;
    const indent = m[0].length - m[7].length - label.length;
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
      named: !label.startsWith('"'),
      type: label.startsWith('"') ? label.slice(1, -1).replace(/\\(.)/g, '$1') : label,
    });
  }
  for (const nodes of files) {
    nodes.forEach((n, i) => { n.leaf = !(nodes[i + 1] && nodes[i + 1].depth > n.depth); });
  }
  return files;
}

// `parse` exits 1 when an input has an ERROR; its output is still complete.
function treeSitter(args) {
  try {
    return execFileSync(TREE_SITTER, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    if (e.status === 1 && e.stdout) return e.stdout;
    throw e;
  }
}

// Parsed once, shared by the checks. Trees with errors are null and skipped;
// they are left out of the --cst run because its `•` error marker shifts the
// indentation depths are read from.
function loadCorpus(lib, grammar) {
  const { tests, tmp } = corpusInputs(grammar);
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true });
  try {
    return { ...parseCorpus(lib, grammar, tests, tmp), cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

function parseCorpus(lib, grammar, tests, tmp) {
  const files = tests.map((t) => t.file);
  const all = path.join(tmp, 'all.list');
  fs.writeFileSync(all, files.join('\n'));
  const quiet = treeSitter(['parse', '--lib-path', lib, '--lang-name', grammar, '--quiet', '--paths', all]);
  const broken = new Set(files.filter((f) => quiet.includes(f)));
  const clean = files.filter((f) => !broken.has(f));
  const cleanList = path.join(tmp, 'clean.list');
  fs.writeFileSync(cleanList, clean.join('\n'));
  const parsed = parseCst(
    treeSitter(['parse', '--lib-path', lib, '--lang-name', grammar, '--cst', '--paths', cleanList]),
    grammar,
  );
  if (parsed.length !== clean.length) {
    throw new Error(`${grammar}: expected ${clean.length} CST trees, parsed ${parsed.length}`);
  }
  let k = 0;
  return {
    lib,
    grammar,
    tests,
    trees: files.map((f) => (broken.has(f) ? null : parsed[k++])),
    cleanList,
  };
}

function offsets(buf) {
  const starts = [0];
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) starts.push(i + 1);
  return (row, col) => starts[row] + col;
}

// Leaves whose text may start or end with whitespace.
const CONTENT_NODES = new Set([
  'raw_text', 'comment', 'comment_content', 'string_fragment', 'regex_pattern',
  'hash_bang_line',
]);

// Inner nodes may not END with whitespace either: a zero-width token (ASI,
// TAG_SEMICOLON) emitted after skipped whitespace stretches its statement to
// the next line, and editors then indent as if still inside the block.
const MAY_END_WITH_SPACE = new Set(['program', 'markup', 'document', 'text_statement']);

function checkPositions({ tests, trees }) {
  const problems = [];
  tests.forEach((t, i) => {
    const nodes = trees[i];
    if (!nodes) return;
    const buf = Buffer.from(t.source, 'utf8');
    const at = offsets(buf);
    for (const n of nodes) {
      if (!n.named || CONTENT_NODES.has(n.type)) continue;
      if (!n.leaf && MAY_END_WITH_SPACE.has(n.type)) continue;
      const text = buf.subarray(at(n.sr, n.sc), at(n.er, n.ec)).toString('utf8');
      if (n.leaf ? /^\s|\s$/.test(text) : /\s$/.test(text)) {
        problems.push(`${t.name}: ${n.type} at ${n.sr}:${n.sc} is ${JSON.stringify(text.length > 60 ? `${text.slice(0, 25)}…${text.slice(-25)}` : text)}`);
      }
    }
  });
  return problems;
}

// Tokens deliberately left to the surrounding colour.
const UNHIGHLIGHTED = {
  ucode: new Set(),
  ucode_markup: new Set(['raw_text']),
  ucdocs: new Set(['/**']),             // keeps the host comment's colour
};

const CAPTURE = /capture: (?:\d+ - )?([\w.]+), start: \((\d+), (\d+)\), end: \((\d+), (\d+)\)/;

function checkHighlights(corpus, queryFile = path.join(ROOT, corpus.grammar, 'queries', 'highlights.scm')) {
  const { lib, grammar, tests, trees, cleanList } = corpus;
  const out = treeSitter(['query', '--lib-path', lib, '--lang-name', grammar, queryFile, '--paths', cleanList]);
  // The output names each file before its captures.
  const byFile = new Map(tests.map((t) => [t.file, []]));
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
  return problems;
}

module.exports = { checkExternals, loadCorpus, checkPositions, checkHighlights };
