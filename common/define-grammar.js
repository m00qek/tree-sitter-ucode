/**
 * @file Ucode grammar for tree-sitter
 * @license MIT
 *
 * Based on tree-sitter-javascript (MIT, Max Brunsfeld, Amaan Qureshi).
 * Ucode is an ECMAScript-like language for OpenWrt system scripting.
 * See README.md for a full list of syntax differences from JavaScript.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Both parsers are built from this one rule set (the same pattern
 * tree-sitter-typescript uses for typescript/tsx):
 *
 *   ucode         — a script: a statement list from the first byte.
 *   ucode_markup  — a template: starts in TEXT mode. ucode's own lexer turns a
 *                   template into one statement stream in which the text
 *                   between `%}` and `{%` is a statement (the compiler emits it
 *                   as a print). So a template is a script wrapped in an
 *                   implicit leading `%}` and trailing `{%`, and the only
 *                   template-specific rule is `text_statement`, allowed
 *                   wherever a statement is. Blocks, alt-syntax bodies,
 *                   function bodies, switch cases, arrow bodies — anything
 *                   that holds statements — therefore span tags for free.
 *
 * The two differ only in the start rule and in whether `text_statement` (and
 * the tag rules it uses) exist. The external-token list is identical in both,
 * since the scanner implementation is shared; the script grammar simply never
 * reaches the template tokens.
 *
 * @param {'ucode' | 'ucode_markup'} name
 */
module.exports = function defineGrammar(name) {
  const isTemplate = name === 'ucode_markup';

  return grammar({
    name,

    externals: $ => [
      $._automatic_semicolon,        //  0
      $._template_chars,             //  1
      $._ternary_qmark,              //  2
      $.raw_text,                    //  3  literal text outside tags
      $.statement_tag_open,          //  4  {%
      $.statement_tag_trim_open,     //  5  {%-
      $.statement_tag_lstrip_open,   //  6  {%+
      $.statement_tag_close,         //  7  %}
      $.statement_tag_trim_close,    //  8  -%}
      $.expression_tag_open,         //  9  {{
      $.expression_tag_trim_open,    // 10  {{-
      $.expression_tag_close,        // 11  }}
      $.expression_tag_trim_close,   // 12  -}}
      $.comment_content,             // 13  {# ... #} body (scans up to #}/-#})
      $.comment,                     // 14  // line and /* */ block comments
      $._single_quote_string_content, // 15  '...' body (scans up to ' / \ / EOF; raw newlines are content)
      $._double_quote_string_content, // 16  "..." body (scans up to " / \ / EOF; raw newlines are content)
      $._regex_content,               // 17  /.../ body (scans up to the closing / or EOF; raw newlines are content)
      $._octal_escape,                 // 18  \NNN octal escape in a string/template, range-checked to <= 255
      $._asi_gap,                      // 19  zero-width no-op emitted before an own-line comment when ASI declines (see scanner)
      $._tag_semicolon,                // 20  zero-width ';' before %} / -%} in an unbraced-body position (template only; see scanner)
    ],

    extras: $ => [
      $.comment,
      // Zero-width marker the external scanner emits at an own-line comment when
      // ASI does NOT fire before it (a continuation like `a\n// c\n.b`). It lets
      // the scanner decide ASI by peeking PAST the comment yet still emit the
      // comment on the next call at the same position \u2014 see scan_comment /
      // scan_asi_before_comment in src/scanner_impl.h. Hidden and zero-width, so
      // it never appears in the tree; listed as an extra because it can occur at
      // any inter-statement position a comment can.
      $._asi_gap,
      /[\s\p{Zs}\uFEFF\u2028\u2029\u2060\u200B]/,
    ],

    reserved: {
      global: $ => [
        'break',
        'case',
        'catch',
        'const',
        'continue',
        'default',
        'delete',
        'else',
        'elif',
        'endif',
        'endfor',
        'endwhile',
        'endfunction',
        'export',
        'false',
        'for',
        'function',
        'if',
        'import',
        'in',
        'let',
        'null',
        'return',
        'switch',
        'this',
        'true',
        'try',
        'while',
      ],
      properties: _ => [],
    },

    supertypes: $ => [
      $.statement,
      $.declaration,
      $.expression,
      $.primary_expression,
    ],

    inline: $ => [
      $._call_signature,
      $._expressions,
      $._semicolon,
      $._identifier,
      $._reserved_identifier,
      $._lhs_expression,
      ...(isTemplate ? [$._stmt_open, $._stmt_close, $._expr_open, $._expr_close] : []),
    ],

    precedences: $ => [
      [
        'member',
        'call',
        'update',
        'unary_void',
        'binary_exp',
        'binary_times',
        'binary_plus',
        'binary_shift',
        'binary_relation',
        'binary_equality',
        'bitwise_and',
        'bitwise_xor',
        'bitwise_or',
        'logical_and',
        'logical_or',
        'ternary',
        $.sequence_expression,
        $.arrow_function,
      ],
      ['assign', $.primary_expression],
      ['member', 'call', $.expression],
      ['declaration', 'literal'],
      [$.primary_expression, $.statement_block, 'object'],
      [$.export_statement, $.primary_expression],
      [$.lexical_declaration, $.primary_expression],
    ],

    conflicts: $ => [
      [$.primary_expression, $.formal_parameters],
      [$.primary_expression, $._for_header],
      [$.variable_declarator, $._for_header],
      [$.primary_expression, $.delete_expression],
      [$.primary_expression, $.update_expression],
    ],

    word: $ => $.identifier,

    rules: {
      // tree-sitter uses the FIRST rule as the start rule, so the entry rule is
      // spread in before everything else.
      ...(isTemplate ? {
        // A template starts in text mode: leading text, then (once the first
        // `{%` opens code) an ordinary statement list in which every later
        // `%}…{%` stretch is a text_statement, then optional trailing text
        // after the last `%}`. A file may also end inside an open `{%` tag.
        markup: $ => seq(
          optional($.hash_bang_line),
          optional($._text),
          optional(seq(
            $._stmt_open,
            repeat($.statement),
            optional(seq($._stmt_close, optional($._text))),
          )),
        ),
      } : {
        program: $ => seq(
          optional($.hash_bang_line),
          repeat($.statement),
        ),
      }),

      // -----------------------------------------------------------------------
      // Template-only rules
      // -----------------------------------------------------------------------

      ...(isTemplate ? {
        // `%} text {{ expr }} {# c #} {%` — the text between two code tags, as
        // one statement. Valid wherever a statement is, which is exactly where
        // ucode accepts it: `{% if (x) { %}hi{% } %}` is an if_statement whose
        // statement_block holds this node; `{% x = [ %}hi{% ] %}` is an ERROR
        // because text is not an expression. With no text in between
        // (`{% a %}{% b %}`) it is just the two delimiters.
        text_statement: $ => seq(
          $._stmt_close,
          optional($._text),
          $._stmt_open,
        ),

        // Shared by text_statement and the markup entry's leading/trailing text,
        // so all three reduce the same run and the parser only decides which one
        // it was at the following `{%` (text_statement) or EOF (trailing).
        _text: $ => repeat1(choice(
          $.raw_text,
          $.expression_tag,
          $.comment_tag,
        )),

        // {{ expr }} or {{- expr -}}. ucode requires an expression here — `{{ }}`
        // is "Expecting expression" at parse time, not merely a semantic reject.
        expression_tag: $ => seq(
          field('open',  $._expr_open),
          $._expressions,
          field('close', $._expr_close),
        ),

        // {# ... #}  with optional whitespace-stripping markers
        comment_tag: $ => seq(
          field('open',    choice('{#-', '{#')),
          optional(field('content', $.comment_content)),
          field('close',   choice('-#}', '#}')),
        ),

        // comment_content is an external token (see src/scanner_impl.h): it scans
        // everything up to but not including the first #} or -#}. A regex cannot do
        // this — maximal munch would consume the '#' of the terminator (e.g. the
        // second '#' of `{# x##}`), and tree-sitter regexes have no lookahead.

        // Inline wrappers for tag delimiter tokens.
        // Each groups all variants (plain / trim / lstrip) so grammar rules stay
        // concise while still surfacing distinct node types for highlight queries.
        _stmt_open:  $ => choice($.statement_tag_open, $.statement_tag_trim_open, $.statement_tag_lstrip_open),
        _stmt_close: $ => choice($.statement_tag_close, $.statement_tag_trim_close),
        _expr_open:  $ => choice($.expression_tag_open, $.expression_tag_trim_open),
        _expr_close: $ => choice($.expression_tag_close, $.expression_tag_trim_close),
      } : {}),

      hash_bang_line: _ => /#!.*/,

      //
      // Export declarations
      // Ucode export is simpler than JS: no `from`, no namespace re-exports.
      // `export default` always takes an expression (requires trailing semicolon).
      // `export function name() {}` does NOT require a semicolon.
      //

      export_statement: $ => choice(
        seq(
          'export',
          field('clause', $.export_clause),
          $._semicolon,
        ),
        // `export let/const …;` already carries its own terminating semicolon.
        seq(
          'export',
          field('declaration', $.lexical_declaration),
        ),
        // `export function f() {}` requires an explicit trailing `;` in ucode.
        seq(
          'export',
          field('declaration', $.function_declaration),
          ';',
        ),
        seq(
          'export',
          'default',
          field('value', $.expression),
          ';',
        ),
      ),

      // `export {};` is "Expecting Label" in ucode — the specifier list must
      // have at least one entry.
      export_clause: $ => seq(
        '{',
        commaSep1($.export_specifier),
        '}',
      ),

      export_specifier: $ => seq(
        field('name', $._module_export_name),
        optional(seq(
          'as',
          field('alias', $._module_export_name),
        )),
      ),

      _module_export_name: $ => choice(
        $.identifier,
        $.string,
        'default',
      ),

      declaration: $ => choice(
        $.function_declaration,
        $.lexical_declaration,
      ),

      //
      // Import declarations
      // Ucode keeps full ES module static import syntax.
      //

      import_statement: $ => seq(
        'import',
        choice(
          seq(field('clause', $.import_clause), 'from', field('source', $.string)),
          field('source', $.string),
        ),
        $._semicolon,
      ),

      import_clause: $ => choice(
        field('namespace', $.namespace_import),
        field('named', $.named_imports),
        seq(
          field('default', $.identifier),
          optional(seq(
            ',',
            choice(
              field('namespace', $.namespace_import),
              field('named', $.named_imports),
            ),
          )),
        ),
      ),

      namespace_import: $ => seq('*', 'as', $.identifier),

      // `import {} from "x";` is "Expecting Label, String or 'default'" in
      // ucode — the specifier list must have at least one entry.
      named_imports: $ => seq(
        '{',
        commaSep1($.import_specifier),
        '}',
      ),

      import_specifier: $ => choice(
        field('name', $.identifier),
        seq(
          field('name', $._module_export_name),
          'as',
          field('alias', $.identifier),
        ),
      ),

      //
      // Statements
      //

      statement: $ => choice(
        $.export_statement,
        $.import_statement,
        $.expression_statement,
        $.declaration,
        $.statement_block,

        $.if_statement,
        $.if_alt_statement,
        $.switch_statement,
        $.for_statement,
        $.for_alt_statement,
        $.for_in_statement,
        $.for_in_alt_statement,
        $.while_statement,
        $.while_alt_statement,
        $.try_statement,

        $.break_statement,
        $.continue_statement,
        $.return_statement,
        $.empty_statement,
        ...(isTemplate ? [$.text_statement] : []),
      ),

      // A leading `{` in statement position parses here as an object literal, but
      // ucode always opens a block there and rejects it (it has no labeled
      // statements, so `{a: 1};` is a block whose `a: 1` is a syntax error).
      // Forcing that error would need a whole `expression`-can't-start-with-`{`
      // hierarchy; we leave the semantic rejection to the compiler instead (a
      // documented divergence — see README; the same applies to the arrow body).
      expression_statement: $ => seq(
        $._expressions,
        $._semicolon,
      ),

      // `let` declarators may omit the initializer; `const` requires one.
      // ucode rejects `const a;` ("Expecting initializer expression").
      lexical_declaration: $ => choice(
        seq(
          field('kind', 'let'),
          commaSep1($.variable_declarator),
          $._semicolon,
        ),
        seq(
          field('kind', 'const'),
          commaSep1(alias($._const_declarator, $.variable_declarator)),
          $._semicolon,
        ),
      ),

      // Initializer declaration for a C-style for-header. Differs from
      // lexical_declaration in two ucode-faithful ways:
      //   - no trailing `$._semicolon`: the for-header supplies its own literal
      //     `;`, and ucode does NOT insert a semicolon there
      //     (`for (let i = 0⏎i < 3; …)` is an error), and
      //   - `let` only: ucode rejects `const` in a for-header initializer
      //     (`for (const …)` → "Expecting expression"), just as it does for the
      //     for-in target.
      // Aliased back to lexical_declaration in the for-header so the tree node
      // name is unchanged. No `kind` field on the `let`: it is invariant here
      // (always `let`), no query reads it, and adding it roughly doubles the
      // generated parse tables (measured: STATE_COUNT 2937 → 6055).
      _for_lexical_declaration: $ => seq(
        'let',
        commaSep1($.variable_declarator),
      ),

      variable_declarator: $ => seq(
        field('name', $.identifier),
        optional($._initializer),
      ),

      _const_declarator: $ => seq(
        field('name', $.identifier),
        $._initializer,
      ),

      statement_block: $ => prec.right(seq(
        '{',
        repeat($.statement),
        '}',
        optional($._automatic_semicolon),
      )),

      // An unbraced control-flow body accepts any statement except a lexical
      // declaration: ucode rejects `if (x) let y = 1;` / `while (c) const z = 1;`
      // ("Expecting expression") but accepts expression statements, `function`
      // declarations and blocks. (The `:`…`endif` alt-syntax body, which is
      // block-like, still allows `let`/`const` and uses `statement` directly.)
      // Mirror `statement` minus `lexical_declaration` — and minus import/export,
      // which ucode allows only at a module's top level (`if (1) import "m";`
      // also errors with "Expecting expression").
      _unbraced_statement: $ => choice(
        $.expression_statement,
        $.function_declaration,
        $.statement_block,

        $.if_statement,
        $.if_alt_statement,
        $.switch_statement,
        $.for_statement,
        $.for_alt_statement,
        $.for_in_statement,
        $.for_in_alt_statement,
        $.while_statement,
        $.while_alt_statement,
        $.try_statement,

        $.break_statement,
        $.continue_statement,
        $.return_statement,
        $.empty_statement,
        // ucode's compiler turns every `%}` into `;`, so in a template an
      // unbraced body that runs into a tag close is EMPTY — `{% if (a) %}x`
      // is `if (a) ;` followed by the text as the NEXT statement (and a later
      // `{% else %}` is then an error, as in ucode). The scanner emits this
      // zero-width token only directly before `%}` / `-%}`; text_statement
      // itself is deliberately NOT an unbraced body.
      ...(isTemplate ? [alias($._tag_semicolon, $.empty_statement)] : []),
      ),

      else_clause: $ => seq('else', $._unbraced_statement),

      // Standard brace-based if
      if_statement: $ => prec.right(seq(
        'if',
        field('condition', $.parenthesized_expression),
        field('consequence', $._unbraced_statement),
        optional(field('alternative', $.else_clause)),
      )),

      // Alternative colon/endif syntax: if (cond): stmts … elif (c): … else: … endif
      // In a template the bodies span tags like any other statement list:
      // {% if (c): %}text{% endif %} is this rule with a text_statement body.
      if_alt_statement: $ => seq(
        'if',
        field('condition', $.parenthesized_expression),
        ':',
        field('body', repeat($.statement)),
        repeat(field('elif_clause', $.elif_clause)),
        optional(field('else_body', $.else_alt_clause)),
        'endif',
      ),

      elif_clause: $ => seq(
        'elif',
        field('condition', $.parenthesized_expression),
        ':',
        field('body', repeat($.statement)),
      ),

      else_alt_clause: $ => seq(
        'else',
        field('body', repeat($.statement)),
      ),

      switch_statement: $ => seq(
        'switch',
        field('value', $.parenthesized_expression),
        field('body', $.switch_body),
      ),

      for_statement: $ => seq(
        forHeader($),
        field('body', $._unbraced_statement),
      ),

      for_alt_statement: $ => seq(
        forHeader($),
        ':',
        field('body', repeat($.statement)),
        'endfor',
      ),

      for_in_statement: $ => seq(
        'for',
        $._for_header,
        field('body', $._unbraced_statement),
      ),

      for_in_alt_statement: $ => seq(
        'for',
        $._for_header,
        ':',
        field('body', repeat($.statement)),
        'endfor',
      ),

      // Supports both `for (k in obj)` and `for (k, v in obj)` (ucode two-variable form).
      // The loop target must be a plain identifier: ucode rejects member/subscript
      // targets (`for (a.x in o)`) and only `let` (never `const`) may declare it.
      _for_header: $ => seq(
        '(',
        optional(field('kind', 'let')),
        field('left', $.identifier),
        optional(seq(',', field('value', $.identifier))),
        'in',
        field('right', $._expressions),
        ')',
      ),

      while_statement: $ => seq(
        'while',
        field('condition', $.parenthesized_expression),
        field('body', $._unbraced_statement),
      ),

      while_alt_statement: $ => seq(
        'while',
        field('condition', $.parenthesized_expression),
        ':',
        field('body', repeat($.statement)),
        'endwhile',
      ),

      // ucode requires the catch clause (`try {}` alone errors with "Unexpected
      // token"); the catch parameter parens stay optional (`try {} catch {}` is
      // valid). Unlike ECMAScript there is no `finally`.
      try_statement: $ => seq(
        'try',
        field('body', $.statement_block),
        field('handler', $.catch_clause),
      ),

      // ucode has no labeled statements, so `break`/`continue` take no label.
      // These parse anywhere a statement is valid, including top level; ucode
      // rejects `break`/`continue` outside a loop or switch, but only at compile
      // time — that context check is left to the compiler (documented divergence).
      break_statement: $ => seq(
        'break',
        $._semicolon,
      ),

      continue_statement: $ => seq(
        'continue',
        $._semicolon,
      ),

      return_statement: $ => seq(
        'return',
        optional($._expressions),
        $._semicolon,
      ),

      empty_statement: _ => ';',

      //
      // Statement components
      //

      switch_body: $ => seq(
        '{',
        repeat(choice($.switch_case, $.switch_default)),
        '}',
      ),

      switch_case: $ => seq(
        'case',
        field('value', $._expressions),
        ':',
        field('body', repeat($.statement)),
      ),

      switch_default: $ => seq(
        'default',
        ':',
        field('body', repeat($.statement)),
      ),

      catch_clause: $ => seq(
        'catch',
        optional(seq('(', field('parameter', $.identifier), ')')),
        field('body', $.statement_block),
      ),

      parenthesized_expression: $ => seq(
        '(',
        $._expressions,
        ')',
      ),

      //
      // Expressions
      //

      _expressions: $ => choice(
        $.expression,
        $.sequence_expression,
      ),

      expression: $ => choice(
        $.primary_expression,
        $.assignment_expression,
        $.augmented_assignment_expression,
        $.unary_expression,
        $.delete_expression,
        $.binary_expression,
        $.ternary_expression,
        $.update_expression,
      ),

      primary_expression: $ => choice(
        $.subscript_expression,
        $.member_expression,
        $.parenthesized_expression,
        $._identifier,
        alias($._reserved_identifier, $.identifier),
        $.this,
        $.number,
        $.string,
        $.template_string,
        $.regex,
        $.true,
        $.false,
        $.null,
        $.object,
        $.array,
        $.function_expression,
        $.arrow_function,
        $.call_expression,
      ),

      // ucode allows a trailing comma but NOT interior elision (`{a:1,,b:2}`).
      object: $ => prec('object', seq(
        '{',
        optional(seq(
          commaSep1(choice(
            $.pair,
            $.spread_element,
            alias(
              choice($.identifier, $._reserved_identifier),
              $.shorthand_property_identifier,
            ),
          )),
          optional(','),
        )),
        '}',
      )),

      // ucode allows a trailing comma but NOT interior elision (`[1,,2]`).
      array: $ => seq(
        '[',
        optional(seq(
          commaSep1(choice(
            $.expression,
            $.spread_element,
          )),
          optional(','),
        )),
        ']',
      ),

      optional_chain: _ => '?.',

      call_expression: $ => choice(
        prec('call', seq(
          field('function', $.expression),
          field('arguments', $.arguments),
        )),
        prec('member', seq(
          field('function', $.primary_expression),
          field('optional_chain', $.optional_chain),
          field('arguments', $.arguments),
        )),
      ),

      member_expression: $ => prec('member', seq(
        field('object', choice($.expression, $.primary_expression)),
        choice('.', field('optional_chain', $.optional_chain)),
        field('property', reserved('properties', alias($.identifier, $.property_identifier))),
      )),

      subscript_expression: $ => prec.right('member', seq(
        field('object', choice($.expression, $.primary_expression)),
        optional(field('optional_chain', $.optional_chain)),
        '[', field('index', $._expressions), ']',
      )),

      // Assignment targets. ucode rejects a parenthesized whole target
      // (`(a) = 1` is "Unexpected token"), so the left-hand side is a plain
      // reference. (An optional chain anywhere in the target — `a?.b = 1` — is
      // also rejected by ucode, but that is a semantic lval check the grammar
      // does not attempt; member/subscript here still permit `?.`.)
      _lhs_expression: $ => choice(
        $.member_expression,
        $.subscript_expression,
        $._identifier,
        alias($._reserved_identifier, $.identifier),
      ),

      assignment_expression: $ => prec.right('assign', seq(
        field('left', $._lhs_expression),
        '=',
        field('right', $.expression),
      )),

      augmented_assignment_expression: $ => prec.right('assign', seq(
        field('left', $._lhs_expression),
        field('operator', choice(
          '+=', '-=', '*=', '/=', '%=', '**=',
          '^=', '&=', '|=', '>>=', '<<=',
          '&&=', '||=', '??=',
        )),
        field('right', $.expression),
      )),

      _initializer: $ => seq(
        '=',
        field('value', $.expression),
      ),

      spread_element: $ => seq('...', $.expression),

      ternary_expression: $ => prec.right('ternary', seq(
        field('condition', $.expression),
        alias($._ternary_qmark, '?'),
        field('consequence', $.expression),
        ':',
        field('alternative', $.expression),
      )),

      binary_expression: $ => choice(
        ...[
          ['&&', 'logical_and'],
          ['||', 'logical_or'],
          ['>>', 'binary_shift'],
          ['<<', 'binary_shift'],
          ['&', 'bitwise_and'],
          ['^', 'bitwise_xor'],
          ['|', 'bitwise_or'],
          ['+', 'binary_plus'],
          ['-', 'binary_plus'],
          ['*', 'binary_times'],
          ['/', 'binary_times'],
          ['%', 'binary_times'],
          ['**', 'binary_exp'],  // left-associative in ucode: 4**3**2 == (4**3)**2
          ['<', 'binary_relation'],
          ['<=', 'binary_relation'],
          ['==', 'binary_equality'],
          ['===', 'binary_equality'],
          ['!=', 'binary_equality'],
          ['!==', 'binary_equality'],
          ['>=', 'binary_relation'],
          ['>', 'binary_relation'],
          ['??', 'logical_or'],    // same level as ||, freely mixable
          ['in', 'binary_relation'],
        ].map(([operator, precedence, associativity]) =>
          (associativity === 'right' ? prec.right : prec.left)(precedence, seq(
            field('left', $.expression),
            field('operator', operator),
            field('right', $.expression),
          )),
        ),
      ),

      unary_expression: $ => prec.left('unary_void', seq(
        field('operator', choice('!', '~', '-', '+')),
        field('argument', $.expression),
      )),

      // ucode's `delete` accepts a property access (member or subscript), or a
      // parenthesized one: `delete o.k`, `delete o["k"]`, `delete (o.k)`. Unlike
      // an assignment/update target, an optional chain IS allowed (`delete a?.b`).
      // `delete x` and `delete (5)` are rejected by ucode at compile time, but
      // the parenthesized-non-property case is a semantic lval check the grammar
      // does not attempt (mirroring how tree-sitter-javascript treats `delete`).
      delete_expression: $ => prec.left('unary_void', seq(
        field('operator', 'delete'),
        field('argument', choice(
          $.member_expression,
          $.subscript_expression,
          $.parenthesized_expression,
        )),
      )),

      // The operand of ++/-- must be an assignable reference: `++5` and `5++`
      // are "Invalid increment/decrement operand" in ucode.
      update_expression: $ => prec.left('update', choice(
        seq(
          field('argument', $._lhs_expression),
          field('operator', choice('++', '--')),
        ),
        seq(
          field('operator', choice('++', '--')),
          field('argument', $._lhs_expression),
        ),
      )),

      sequence_expression: $ => prec.right(commaSep1($.expression)),

      //
      // Functions
      //

      function_expression: $ => prec('literal', seq(
        'function',
        field('name', optional($.identifier)),
        $._call_signature,
        field('body', $.statement_block),
      )),

      // Function declaration — brace body or alternative colon/endfunction syntax
      function_declaration: $ => prec.right('declaration', seq(
        'function',
        field('name', $.identifier),
        $._call_signature,
        field('body', choice(
          $.statement_block,
          seq(':', repeat($.statement), 'endfunction'),
        )),
        optional($._automatic_semicolon),
      )),

      arrow_function: $ => seq(
        choice(
          field('parameter', choice(
            alias($._reserved_identifier, $.identifier),
            $.identifier,
          )),
          $._call_signature,
        ),
        '=>',
        // `x => {a: 1}` parses the body as an object, but ucode reads `{` after
        // `=>` as a block and rejects it — write `x => ({a: 1})` for an object.
        // Same root as expression_statement's leading-`{` divergence (see there).
        field('body', choice(
          $.expression,
          $.statement_block,
        )),
      ),

      _call_signature: $ => field('parameters', $.formal_parameters),

      // A rest element (`...name`) must be the final parameter, and there can be
      // only one.  ucode rejects a rest param followed by anything — including a
      // trailing comma.  A trailing comma is allowed only after plain parameters.
      formal_parameters: $ => seq(
        '(',
        optional(choice(
          $.rest_element,
          seq(commaSep1($.identifier), ',', $.rest_element),
          seq(commaSep1($.identifier), optional(',')),
        )),
        ')',
      ),

      rest_element: $ => seq('...', $.identifier),

      //
      // Primitives
      //

      // The string body is scanned by the external scanner (see scanner_impl.h),
      // exactly like template_string's `_template_chars`. A regular internal
      // `token.immediate` fragment would lose to the external `comment` token,
      // which is a global `extra` and is offered by tree-sitter even inside a
      // string: a string starting with `/*` or `//` (e.g. the glob `'/*.uc'`)
      // was then mis-lexed as a block/line comment. Because the content token is
      // dispatched before COMMENT in the scanner, it shadows the comment inside
      // the string while still leaving escape sequences as their own nodes.
      string: $ => choice(
        seq(
          '"',
          repeat(choice(
            alias($._double_quote_string_content, $.string_fragment),
            $.escape_sequence,
            alias($._octal_escape, $.escape_sequence),
          )),
          '"',
        ),
        seq(
          '\'',
          repeat(choice(
            alias($._single_quote_string_content, $.string_fragment),
            $.escape_sequence,
            alias($._octal_escape, $.escape_sequence),
          )),
          '\'',
        ),
      ),

      // Ucode extends JS escapes with \e (ESC), \a (BEL), and octal sequences.
      // Unlike JS, ucode supports only the 4-hex `\uXXXX` form \u2014 not `\u{...}`.
      //
      // The octal branch lives entirely in the external `_octal_escape` token
      // (aliased back to escape_sequence above and in template_string below),
      // not here: ucode range-checks octal escapes to <= 255 (\377), a check
      // that requires computing the value, not something a regex can express
      // (see the doc comment on scan_octal_escape in scanner_impl.h for why a
      // capped regex alternative like [0-3][0-7]{2}|[0-7]{1,2} does not work).
      escape_sequence: _ => token.immediate(seq(
        '\\',
        choice(
          /[^xu0-7]/,
          /x[0-9a-fA-F]{2}/,
          /u[0-9a-fA-F]{4}/,
          /\r[\n\u2028\u2029]/,
        ),
      )),

      // `comment` is an external token (see externals / scanner_impl.h). A `//`
      // line comment runs to the end of the line (or EOF), matching ucode — a
      // same-line `%}` inside a statement tag is swallowed as comment content, so
      // `{% x = 1; // note %}` on one line is an unterminated tag (ucode swallows
      // the `%}` too). Block comments `/* */` end at `*/`, and an unterminated
      // block comment at EOF is an ERROR (ucode "Unterminated comment").

      template_string: $ => seq(
        '`',
        repeat(choice(
          alias($._template_chars, $.string_fragment),
          $.escape_sequence,
          alias($._octal_escape, $.escape_sequence),
          $.template_substitution,
        )),
        '`',
      ),

      template_substitution: $ => seq(
        '${',
        $._expressions,
        '}',
      ),

      // The pattern body is the external token `_regex_content` (see externals /
      // scanner_impl.h scan_regex_content), aliased back to `regex_pattern` so the
      // tree shape is unchanged.  ucode lexes regexes with parse_string(lex, '/')
      // (lexer.c parse_regexp) — the same routine as strings — so raw newlines are
      // ordinary content and only EOF makes the literal unterminated.  A grammar
      // token cannot model that without swallowing the file tail on an
      // unterminated '/', which is why the body lives in the external scanner (it
      // returns false at EOF, recovering statement-by-statement like the
      // string-content tokens).  The scanner also handles the character-class
      // structure (leading '^'/']' literals, nested [:name:]/[.coll.]/[=eq=]).
      //
      // DOCUMENTED DIVERGENCE (not emulated — see README): `a++ / b` parses here
      // as ordinary division, but ucode rejects it ("Unterminated string", since
      // its lexer starts scanning a regex at that '/' and never finds a closer
      // before EOF/newline) — verified against both the local oracle and the
      // packaged 2026.01.16 release, rc=255 for every unparenthesized form
      // (`(a++) / b` works fine; only the bare postfix-then-slash sequence
      // fails). Root cause lives entirely in ucode itself: lexer.c's no_regexp
      // flag is set after every other value-producing token (identifiers,
      // literals, ')', ']', etc. — see compiler.c) but never after postfix
      // TK_INC/TK_DEC, so the lexer treats the following '/' as a regex opener
      // instead of division — still true on ucode master, not something a
      // future release is likely to have already fixed. Faithfully reproducing
      // it would mean starting a regex scan after '++'/'--', which is wrong far
      // more often than the actual bug is meaningful (`a++ / b` is ordinary,
      // intentional division in the vast majority of real code) — a case where
      // matching ucode exactly would make the grammar *worse*, not more
      // faithful. Left as a divergence; a candidate for an upstream ucode fix.
      regex: $ => seq(
        '/',
        field('pattern', alias($._regex_content, $.regex_pattern)),
        token.immediate(prec(1, '/')),
        optional(field('flags', $.regex_flags)),
      ),

      // Ucode supports only g, i, s flags (not m, u, y, d)
      regex_flags: _ => token.immediate(/[gis]+/),

      // Ucode number literals extend JS with:
      // - C-style legacy octal: 0177
      // - Hex float: 0x1.8
      // - Uppercase prefixes: 0O, 0B (already in JS grammar)
      //
      // Unlike JS, ucode does NOT support:
      // - numeric underscore separators (1_000)
      // - leading-dot floats (.5) — a digit is required before the dot
      //
      // Leading-zero handling matches ucode exactly (verified against the
      // interpreter). After a leading `0` (not 0x/0b/0o):
      //   - `.`/`e` follows      -> decimal float/exp, the 0 is a lone zero (0.5, 0e2)
      //   - a [0-7] digit follows -> legacy octal; ALL further digits must be
      //                              [0-7] and no `.`/`e` is allowed (0177 ok;
      //                              017.5, 0177e2, 019 rejected)
      //   - an [89] digit follows -> decimal (08, 09, 089, 0812, 08.5e2)
      // Invalid forms (019, 0189, 0177e2, 0123.5, 00.5) are not matched by any
      // alternative; they split into adjacent tokens and surface as parse errors,
      // matching ucode's "Invalid number literal".
      number: _ => {
        const hexDigits = /[\da-fA-F]+/;
        const hexLiteral = seq(choice('0x', '0X'), hexDigits);
        const hexFloat = seq(choice('0x', '0X'), hexDigits, '.', optional(hexDigits));

        const decimalDigits = /\d+/;
        const signedInteger = seq(optional(choice('-', '+')), decimalDigits);
        const exponentPart = seq(choice('e', 'E'), signedInteger);
        const fraction = seq('.', optional(decimalDigits));

        const binaryLiteral = seq(choice('0b', '0B'), /[0-1]+/);
        const octalLiteral = seq(choice('0o', '0O'), /[0-7]+/);

        // Legacy C octal: `0` then octal digits only, no fraction/exponent.
        const legacyOctalLiteral = seq('0', /[0-7]+/);

        const decimalLiteral = choice(
          // No leading zero: 1-9 then optional digits/fraction/exponent.
          seq(/[1-9]/, optional(decimalDigits), optional(fraction), optional(exponentPart)),
          // Leading zero followed by 8 or 9: legacy non-octal decimal.
          seq('0', /[89]/, optional(decimalDigits), optional(fraction), optional(exponentPart)),
          // A lone zero, optionally with a fraction and/or exponent.
          seq('0', optional(choice(seq(fraction, optional(exponentPart)), exponentPart))),
        );

        return token(choice(
          hexFloat,
          hexLiteral,
          decimalLiteral,
          binaryLiteral,
          octalLiteral,
          legacyOctalLiteral,
        ));
      },

      _identifier: $ => $.identifier,

      // ucode identifiers are ASCII only: a leading letter or underscore, then
      // letters, digits, or underscores. Unlike JS there is no `$`, no unicode
      // escape sequences (`\u...` is an "Unexpected character"), and no non-ASCII
      // letters \u2014 real ucode rejects `$x`, `a$b`, and `caf\u00E9` all as "Unexpected
      // character". (property_identifier and shorthand_property_identifier alias
      // this rule, so they inherit the same alphabet.)
      identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

      this: _ => 'this',
      true: _ => 'true',
      false: _ => 'false',
      null: _ => 'null',

      // Unlike arrays/objects, ucode call arguments allow neither interior
      // elision (`f(1,,2)`) nor a trailing comma (`f(1,2,)`).
      arguments: $ => seq(
        '(',
        commaSep(choice($.expression, $.spread_element)),
        ')',
      ),

      // ucode object keys are a label, a string, or a computed `[expr]` — a bare
      // numeric key (`{1: 2}`) is rejected at parse time ("Expecting label",
      // compiler.c uc_compiler_compile_object) even after the 8d7d15e method-
      // shorthand change, which uses the same key check.
      _property_name: $ => reserved('properties', choice(
        alias(
          choice($.identifier, $._reserved_identifier),
          $.property_identifier,
        ),
        $.string,
        $.computed_property_name,
      )),

      computed_property_name: $ => seq('[', $.expression, ']'),

      pair: $ => seq(
        field('key', $._property_name),
        ':',
        field('value', $.expression),
      ),

      _reserved_identifier: _ => choice(
        'get',
        'set',
      ),

      _semicolon: $ => choice($._automatic_semicolon, ';'),
    },
  });
};

function forHeader($) {
  // KNOWN LIMITATION (documented divergence): the expression-initializer branch
  // accepts any expression, which is MORE permissive than ucode.  ucode's
  // C-style for-init is a stateful hand-parser (uc_compiler_compile_for /
  // _for_count in lang/compiler.c): after a leading identifier it accepts only
  // `x`, `x = e`, `x op= e` or `x => e` (no binary/member/call/postfix), and a
  // top-level `in` there forces the for-in interpretation — so ucode rejects
  // `for (a in b; …)`, `for (a + b; …)`, `for (a.b; …)`, `for (a(); …)`, etc.
  // Matching that exactly would need a restricted label-expression rule plus a
  // no-in expression variant (ECMAScript's Expression[~In]) — a large, fragile
  // special-case for constructs no one writes.  We stay permissive on purpose;
  // the ASI and `const` restrictions above (the parts that matter) are enforced.
  return seq(
    'for',
    '(',
    choice(
      seq(field('initializer', alias($._for_lexical_declaration, $.lexical_declaration)), ';'),
      seq(field('initializer', $._expressions), ';'),
      field('initializer', $.empty_statement),
    ),
    field('condition', choice(
      seq($._expressions, ';'),
      $.empty_statement,
    )),
    field('increment', optional($._expressions)),
    ')',
  );
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}
