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
 *   every markup-only `_tag`/clause-tag node (if_alt_statement_tag,
 *   elif_clause_tag, else_alt_clause_tag, for_alt_statement_tag,
 *   for_in_alt_statement_tag, while_alt_statement_tag,
 *   function_alt_declaration — the alt-syntax `:`…`endif` spanning forms —
 *   and if_statement_tag, elseif_clause_tag, else_clause_tag,
 *   for_statement_tag, for_in_statement_tag, while_statement_tag,
 *   function_declaration_tag, try_statement_tag, catch_clause_tag — their
 *   brace-bodied `{`…`}` spanning counterparts) that only the markup grammar
 *   produces — grammar.js splits each spanning statement into a code-only
 *   rule (reachable from `statement`, shared with the code grammar) and a
 *   markup-only rule (reachable only from `_markup_node`), so every base
 *   query pattern on the code-only name needs a sibling pattern on the
 *   markup-only name to keep editor behavior (indent/fold/textobject/locals)
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

// Indent rules for every markup-only spanning/clause node.
//
// Two shapes, matching the two structural roles a spanning rule can play
// (verified capture-identical to the four-single-capture predecessor this
// replaced, via `tree-sitter query` on if/elif/else and if-brace/else-if-
// brace/else-brace samples):
//
// TOP-LEVEL rules (own the first `:`/`{` that opens their first body) get a
// simple single-token @indent.begin, exactly like the code-only forms above
// (if_alt_statement ":" @indent.begin etc.): if_alt_statement_tag,
// for_alt_statement_tag, for_in_alt_statement_tag, while_alt_statement_tag,
// function_alt_declaration, if_statement_tag, for_statement_tag,
// for_in_statement_tag, while_statement_tag, function_declaration_tag,
// try_statement_tag.
//
// CLAUSE/CONTINUATION rules (reopen a tag with a closing brace/prior clause
// end, a branch keyword, then their own new body-opening token) CONTAIN
// their body (field('body', repeat($._markup_node))) and end with the tag
// close, not the branch keyword — a single-token @indent.begin on the
// keyword would not sit at the end of the header line and would not open
// the scope reliably. Capture the whole node for @indent.begin, with
// @indent.branch on the distinguishing keyword, so the branch dedents to
// its enclosing construct while still opening its own body's indent:
// elif_clause_tag, else_alt_clause_tag, elseif_clause_tag, else_clause_tag,
// catch_clause_tag.
const INDENTS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '(if_alt_statement_tag ":" @indent.begin)',
  '(for_alt_statement_tag ":" @indent.begin)',
  '(for_in_alt_statement_tag ":" @indent.begin)',
  '(while_alt_statement_tag ":" @indent.begin)',
  '(function_alt_declaration ":" @indent.begin)',
  '',
  '; ── Markup-only alt-syntax clause tags ────────────────────────────────',
  '(elif_clause_tag "elif") @indent.branch @indent.begin',
  '(else_alt_clause_tag "else") @indent.branch @indent.begin',
  '',
  '; ── Markup-only brace-spanning forms ──────────────────────────────────',
  '(if_statement_tag "{" @indent.begin)',
  '(for_statement_tag "{" @indent.begin)',
  '(for_in_statement_tag "{" @indent.begin)',
  '(while_statement_tag "{" @indent.begin)',
  '(function_declaration_tag "{" @indent.begin)',
  '(try_statement_tag "{" @indent.begin)',
  '',
  '; ── Markup-only brace-spanning clause tags ────────────────────────────',
  '(elseif_clause_tag "else") @indent.branch @indent.begin',
  '(else_clause_tag "else") @indent.branch @indent.begin',
  '(catch_clause_tag "catch") @indent.branch @indent.begin',
  '',
].join('\n');

// Whole-node fold captures mirror queries/folds.scm's alt-syntax group, one
// entry per TOP-LEVEL spanning rule (clause/continuation tags are not folded
// separately — they are already inside their enclosing construct's fold
// region, matching the code-only forms: elif_clause/else_alt_clause/
// catch_clause have no fold entry of their own either).
const FOLDS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '[',
  '  (if_alt_statement_tag)',
  '  (for_alt_statement_tag)',
  '  (for_in_alt_statement_tag)',
  '  (while_alt_statement_tag)',
  '  (function_alt_declaration)',
  '] @fold',
  '',
  '; ── Markup-only brace-spanning forms ──────────────────────────────────',
  '[',
  '  (if_statement_tag)',
  '  (for_statement_tag)',
  '  (for_in_statement_tag)',
  '  (while_statement_tag)',
  '  (function_declaration_tag)',
  '  (try_statement_tag)',
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
  '(function_alt_declaration) @function.outer',
  '',
  '; ── Markup-only brace-spanning forms ──────────────────────────────────',
  '(if_statement_tag) @conditional.outer',
  '(for_statement_tag) @loop.outer',
  '(for_in_statement_tag) @loop.outer',
  '(while_statement_tag) @loop.outer',
  '(function_declaration_tag) @function.outer',
  '',
].join('\n');

// Scopes, function-name definitions, catch-parameter bindings, and kind-
// gated for-in loop-variable definitions — mirrors exactly which code-only
// forms get each capture in the base file (if/while get none of these; only
// for/for-in/function/catch do). formal_parameters/rest_element parameter
// definitions need no markup-only entry: function_alt_declaration and
// function_declaration_tag both reach $.formal_parameters through the same
// shared _call_signature field as function_declaration, so the base file's
// unqualified (formal_parameters (identifier) @local.definition.parameter)
// already covers them.
const LOCALS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only alt-syntax spanning forms ─────────────────────────────',
  '(for_alt_statement_tag) @local.scope',
  '(for_in_alt_statement_tag) @local.scope',
  '(function_alt_declaration) @local.scope',
  '(function_alt_declaration',
  '  name: (identifier) @local.definition.function',
  '  (#set! definition.function.scope parent))',
  '(for_in_alt_statement_tag',
  '  kind: _',
  '  left: (identifier) @local.definition.var)',
  '(for_in_alt_statement_tag',
  '  kind: _',
  '  value: (identifier) @local.definition.var)',
  '',
  '; ── Markup-only brace-spanning forms ──────────────────────────────────',
  '(for_statement_tag) @local.scope',
  '(for_in_statement_tag) @local.scope',
  '(function_declaration_tag) @local.scope',
  '(function_declaration_tag',
  '  name: (identifier) @local.definition.function',
  '  (#set! definition.function.scope parent))',
  '(catch_clause_tag) @local.scope',
  '(catch_clause_tag',
  '  parameter: (identifier) @local.definition.var)',
  '(for_in_statement_tag',
  '  kind: _',
  '  left: (identifier) @local.definition.var)',
  '(for_in_statement_tag',
  '  kind: _',
  '  value: (identifier) @local.definition.var)',
  '',
].join('\n');

// Symbol-index (go-to-definition/outline) coverage for the two markup-only
// function forms, mirroring the base file's (function_declaration name: ...)
// pattern exactly (same @doc/#select-adjacent! shape).
const TAGS_MARKUP_EXTRA = [
  '',
  '; ── Markup-only function declarations (alt-syntax and brace-spanning) ──',
  '(',
  '  (comment)* @doc',
  '  .',
  '  (function_alt_declaration',
  '    name: (identifier) @name) @definition.function',
  '  (#strip! @doc "^[\\\\s\\\\*/]+|^[\\\\s\\\\*/]$")',
  '  (#select-adjacent! @doc @definition.function)',
  ')',
  '',
  '(',
  '  (comment)* @doc',
  '  .',
  '  (function_declaration_tag',
  '    name: (identifier) @name) @definition.function',
  '  (#strip! @doc "^[\\\\s\\\\*/]+|^[\\\\s\\\\*/]$")',
  '  (#select-adjacent! @doc @definition.function)',
  ')',
  '',
].join('\n');

const DERIVED = {
  'folds.scm':       { rename: [], append: FOLDS_MARKUP_EXTRA },
  'tags.scm':        { rename: [], append: TAGS_MARKUP_EXTRA },
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
