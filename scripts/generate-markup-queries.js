#!/usr/bin/env node
/**
 * Generate the derivable markup query files from the code-grammar queries.
 *
 * The ucode and ucode_markup grammars come from the same grammar.js, so the
 * markup grammar contains every node the code grammar does.  Most markup query
 * files are therefore identical to their `queries/` counterpart (or differ by
 * one node name), and were previously hand-copied — which silently drifted
 * (e.g. a tags.scm reference fix that was applied to only one copy).
 *
 * This script derives those files instead:
 *
 *   folds / tags / textobjects / locals / indents — copied, plus rules for
 *   the markup-only _tag nodes (if_alt_statement_tag, for_alt_statement_tag,
 *   for_in_alt_statement_tag, while_alt_statement_tag, elif_clause_tag,
 *   else_alt_clause_tag) that only the spanning alt-syntax markup form
 *   produces — grammar.js splits each alt-statement into a code-only rule
 *   (reachable from `statement`, shared with the code grammar) and a
 *   markup-only `_tag` rule (reachable only from `_markup_node`), so every
 *   base query pattern on the code-only name needs a sibling pattern on the
 *   `_tag` name to keep editor behavior (indent/fold/textobject/locals)
 *   working for the spanning form too.
 *
 * highlights.scm and injections.scm are genuinely markup-specific (tag
 * punctuation and ucode-into-tag injection) and are maintained by hand — this
 * script never touches them.
 *
 * Run via `npm run build` (after generate-markup-grammar.js).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const root   = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'queries');
const dstDir = path.join(root, 'markup', 'queries');

// Markup-only indent rules for the clause-tag nodes that only the spanning
// if-alt markup form produces.  Appended after the shared code indents.
//
// Unlike the code form, both clause tags CONTAIN their body (field('body',
// repeat($._markup_node))), and the header ends with the `%}` close, not the
// `:` — so a `:`-token @indent.begin would not sit at the end of the header
// line and would not open the scope reliably.  Capture the whole node for
// @indent.begin on both clauses (as the code form does for else), so elif and
// else bodies indent identically.
//
// Both captures sit on the CLAUSE-TAG node, so each clause is one dual-capture
// pattern.  Do NOT move @indent.branch onto the keyword (`("elif" @indent.branch)
// @indent.begin`): that captures the "elif"/"else" token, a different (smaller)
// range than the clause tag, so it is NOT equivalent.  The dual-capture form
// here was verified capture-identical to the four single-capture patterns it
// replaces via `tree-sitter query` on an if/elif/else sample.
const INDENTS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '(if_alt_statement_tag ":" @indent.begin)',
  '(for_alt_statement_tag ":" @indent.begin)',
  '(for_in_alt_statement_tag ":" @indent.begin)',
  '(while_alt_statement_tag ":" @indent.begin)',
  '',
  '; ── Markup-only alt-syntax clause tags ────────────────────────────────',
  '(elif_clause_tag "elif") @indent.branch @indent.begin',
  '(else_alt_clause_tag "else") @indent.branch @indent.begin',
  '',
].join('\n');

// The whole-node fold captures mirror queries/folds.scm's alt-syntax group,
// one entry per spanning `_tag` rule.
const FOLDS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '[',
  '  (if_alt_statement_tag)',
  '  (for_alt_statement_tag)',
  '  (for_in_alt_statement_tag)',
  '  (while_alt_statement_tag)',
  '] @fold',
  '',
].join('\n');

const TEXTOBJECTS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '(if_alt_statement_tag) @conditional.outer',
  '(for_alt_statement_tag) @loop.outer',
  '(for_in_alt_statement_tag) @loop.outer',
  '(while_alt_statement_tag) @loop.outer',
  '',
].join('\n');

// Only for/for-in get a scope + loop-variable definition in the base locals.scm
// (if/while introduce no bindings of their own) — mirror only those for the
// spanning `_tag` forms.
const LOCALS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '(for_alt_statement_tag) @local.scope',
  '(for_in_alt_statement_tag) @local.scope',
  '(for_in_alt_statement_tag',
  '  kind: _',
  '  left: (identifier) @local.definition.var)',
  '(for_in_alt_statement_tag',
  '  kind: _',
  '  value: (identifier) @local.definition.var)',
  '',
].join('\n');

const DERIVED = {
  'folds.scm':       { rename: [], append: FOLDS_MARKUP_EXTRA },
  'tags.scm':        { rename: [] },
  'textobjects.scm': { rename: [], append: TEXTOBJECTS_MARKUP_EXTRA },
  'locals.scm':      { rename: [['(program)', '(markup)']], append: LOCALS_MARKUP_EXTRA },
  'indents.scm':     { rename: [], append: INDENTS_MARKUP_EXTRA },
};

fs.mkdirSync(dstDir, { recursive: true });

for (const [file, rule] of Object.entries(DERIVED)) {
  let body = fs.readFileSync(path.join(srcDir, file), 'utf8');
  for (const [from, to] of rule.rename) body = body.split(from).join(to);

  const header =
    `; GENERATED by scripts/generate-markup-queries.js from queries/${file}\n` +
    `; — do not edit by hand.  highlights.scm and injections.scm are the only\n` +
    `; markup-specific query files and are maintained directly.\n\n`;

  let out = header + body;
  if (rule.append) out = out.replace(/\n*$/, '\n') + rule.append;

  fs.writeFileSync(path.join(dstDir, file), out, 'utf8');
  console.log(`Wrote ${path.relative(process.cwd(), path.join(dstDir, file))}`);
}
