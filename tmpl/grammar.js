/**
 * @file Ucode template grammar for tree-sitter
 * @license MIT
 *
 * Handles .uc.tmpl / .utpl files: raw text interspersed with ucode code
 * blocks ({%...%}), expression blocks ({{...}}), and comments ({#...#}).
 *
 * The grammar captures raw text verbatim and the inner content of code /
 * expression blocks as opaque `code` nodes.  Editors use language injection
 * (see tmpl/queries/injections.scm) to parse those nodes as ucode.
 *
 * Whitespace-stripping markers are supported on both openers and closers:
 *
 *   Opener variants   Closer variants
 *   ─────────────     ──────────────
 *   {%   {%-  {%+     %}   -%}       (statement)
 *   {{   {{-           }}   -}}       (expression)
 *   {#   {#-           #}   -#}       (comment)
 *
 * {%-  strips trailing whitespace from the preceding raw-text block.
 * -%}  strips leading whitespace from the following raw-text block.
 * {%+  suppresses stripping even when lstrip_blocks is configured.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'ucode_tmpl',

  externals: $ => [
    $._raw_text,     // literal text outside any tag
    $._stmt_code,    // content between {% ... %} (before the closer)
    $._expr_code,    // content between {{ ... }} (before the closer)
    $._comment_body, // content between {# ... #} (before the closer)
  ],

  // The template scanner handles all whitespace explicitly; no implicit extras.
  extras: $ => [],

  rules: {
    document: $ => repeat(choice(
      alias($._raw_text, $.raw_text),
      $.statement_tag,
      $.expression_tag,
      $.comment_tag,
    )),

    statement_tag: $ => seq(
      field('open',  choice('{%-', '{%+', '{%')),
      field('code',  optional(alias($._stmt_code, $.code))),
      field('close', choice('-%}', '%}')),
    ),

    expression_tag: $ => seq(
      field('open',  choice('{{-', '{{')),
      field('code',  optional(alias($._expr_code, $.code))),
      field('close', choice('-}}', '}}')),
    ),

    comment_tag: $ => seq(
      field('open',    choice('{#-', '{#')),
      field('content', optional(alias($._comment_body, $.comment_content))),
      field('close',   choice('-#}', '#}')),
    ),
  },
});
