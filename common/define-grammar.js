/**
 * @file Ucode grammar for tree-sitter
 * @license MIT
 *
 * Based on tree-sitter-javascript (MIT, Max Brunsfeld, Amaan Qureshi).
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Builds both parsers. A template (ucode_markup) is a script whose text
 * between `%}` and `{%` is a statement (`text_statement`), so blocks span
 * tags. The external-token list is shared; scripts never reach the template
 * tokens.
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
      $.raw_text,                    //  2  literal text outside tags
      $.statement_tag_open,          //  3  {%
      $.statement_tag_trim_open,     //  4  {%-
      $.statement_tag_lstrip_open,   //  5  {%+
      $.statement_tag_close,         //  6  %}
      $.statement_tag_trim_close,    //  7  -%}
      $.expression_tag_open,         //  8  {{
      $.expression_tag_trim_open,    //  9  {{-
      $.expression_tag_close,        // 10  }}
      $.expression_tag_trim_close,   // 11  -}}
      $.comment_content,             // 12  {# ... #} body
      $.comment,                     // 13  // and /* */ comments
      $._single_quote_string_content, // 14
      $._double_quote_string_content, // 15
      $._regex_content,               // 16
      $._octal_escape,                 // 17  \NNN, range-checked to <= 255
      $._asi_gap,                      // 18  zero-width, before an own-line comment when ASI declines
      $._tag_semicolon,                // 19  zero-width `;` before %} in an unbraced body
      $._text_end,                     // 20  zero-width end of input
      $._return_marker,                // 21  never emitted; marks the state after `return`
      $._block_end,                    // 22  zero-width end of input closing a statement list
      $.doc_comment,                   // 23  /** … */
      // Used by no rule, so it is valid only during error recovery. Keep it last.
      $._error_sentinel,               // 24
    ],

    extras: $ => [
      $.comment,
      $.doc_comment,
      $._asi_gap,
      // C isspace(), as ucode's lexer; `\s` would also accept Unicode spaces.
      /[ \t\n\r\f\v]/,
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
      $._lhs_expression,
      ...(isTemplate ? [$._stmt_open, $._stmt_close, $._expr_open, $._expr_close] : []),
    ],

    precedences: $ => [
      [
        'member',
        'call',
        'update',
        'unary',
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
      ['declaration', 'function_literal'],
      [$.primary_expression, $.statement_block, 'object'],
    ],

    conflicts: $ => [
      [$.primary_expression, $.formal_parameters],
      [$.primary_expression, $._for_in_header],
      [$.variable_declarator, $._for_in_header],
      [$.primary_expression, $.delete_expression],
      [$.primary_expression, $.update_expression],
    ],

    word: $ => $.identifier,

    rules: {
      // The first rule is the start rule.
      ...(isTemplate ? {
        // Leading text, then a statement list once the first `{%` opens code.
        markup: $ => seq(
          optional($.hash_bang_line),
          optional($._text),
          optional(seq(
            $._stmt_open,
            repeat($.statement),
          )),
          optional($._block_end),
          // For error recovery only; never shows in a tree.
          optional($._text_end),
        ),
      } : {
        program: $ => seq(
          optional($.hash_bang_line),
          statements($),
          optional($._text_end),
        ),
      }),

      // -----------------------------------------------------------------------
      // Template-only rules
      // -----------------------------------------------------------------------

      ...(isTemplate ? {
        // `%} text {%`: valid wherever a statement is, as in ucode. Only the
        // last one in a file may lack the `{%`.
        text_statement: $ => seq(
          $._stmt_close,
          optional($._text),
          optional($._stmt_open),
        ),

        _text: $ => repeat1(choice(
          $.raw_text,
          $.expression_tag,
          $.comment_tag,
        )),

        // ucode rejects an empty `{{ }}`.
        expression_tag: $ => seq(
          field('open',  $._expr_open),
          $._expressions,
          field('close', $._expr_close),
        ),

        // comment_content is external: a regex can't stop before `#}` in `x##}`.
        comment_tag: $ => seq(
          field('open',    choice(alias('{#-', $.comment_tag_trim_open), alias('{#', $.comment_tag_open))),
          optional(field('content', $.comment_content)),
          field('close',   choice(alias('-#}', $.comment_tag_trim_close), alias('#}', $.comment_tag_close))),
        ),

        _stmt_open:  $ => choice($.statement_tag_open, $.statement_tag_trim_open, $.statement_tag_lstrip_open),
        _stmt_close: $ => choice($.statement_tag_close, $.statement_tag_trim_close),
        _expr_open:  $ => choice($.expression_tag_open, $.expression_tag_trim_open),
        _expr_close: $ => choice($.expression_tag_close, $.expression_tag_trim_close),
      } : {}),

      hash_bang_line: _ => /#!.*/,

      //
      // Export declarations: no `from`, no namespace re-exports.
      //

      export_statement: $ => choice(
        seq(
          'export',
          field('clause', $.export_clause),
          $._semicolon,
        ),
        seq(
          'export',
          field('declaration', $.lexical_declaration),
        ),
        // ucode requires these `;` (optional only on ucode master); no ASI.
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

      // ucode rejects `export {};`.
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

      // Named `default`, so queries see every specifier's name and alias.
      _module_export_name: $ => choice(
        $.identifier,
        $.string,
        alias('default', $.default),
      ),

      declaration: $ => choice(
        $.function_declaration,
        $.lexical_declaration,
      ),

      //
      // Import declarations
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

      // ucode rejects `import {} from "x";`.
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

        ...controlStatements($),
        ...(isTemplate ? [$.text_statement] : []),
      ),

      // Divergence: `{a: 1};` parses as an object; ucode reads a block and
      // rejects it. Matching that would need a no-leading-`{` expression set.
      expression_statement: $ => seq(
        $._expressions,
        $._semicolon,
      ),

      // ucode rejects `const a;`.
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

      // A for-header initializer: `let` only and no ASI, as in ucode. No `kind`
      // field: it is always `let`, and the field costs ~20% more parse states.
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

      statement_list: $ => repeat1($.statement),

      statement_block: $ => prec.right(seq(
        '{',
        statements($),
        '}',
        optional($._automatic_semicolon),
      )),

      // ucode rejects let/const, import and export as an unbraced body.
      _unbraced_statement: $ => choice(
        $.expression_statement,
        $.function_declaration,
        $.statement_block,

        ...controlStatements($),
        // `%}` is `;` in ucode, so `{% if (a) %}x` is `if (a) ;` then text.
        ...(isTemplate ? [alias($._tag_semicolon, $.empty_statement)] : []),
      ),

      else_clause: $ => seq('else', $._unbraced_statement),

      if_statement: $ => prec.right(seq(
        'if',
        field('condition', $.parenthesized_expression),
        field('consequence', $._unbraced_statement),
        optional(field('alternative', $.else_clause)),
      )),

      if_alt_statement: $ => seq(
        'if',
        field('condition', $.parenthesized_expression),
        ':',
        altBody($, 'consequence'),
        repeat(field('elif_clause', $.elif_clause)),
        optional(field('alternative', $.else_alt_clause)),
        'endif',
      ),

      elif_clause: $ => seq(
        'elif',
        field('condition', $.parenthesized_expression),
        ':',
        altBody($, 'consequence'),
      ),

      else_alt_clause: $ => seq(
        'else',
        altBody($),
      ),

      switch_statement: $ => seq(
        'switch',
        field('value', $.parenthesized_expression),
        field('body', $.switch_body),
      ),

      for_statement: $ => seq(
        countingForHeader($),
        field('body', $._unbraced_statement),
      ),

      for_alt_statement: $ => seq(
        countingForHeader($),
        ':',
        altBody($, 'body'),
        'endfor',
      ),

      for_in_statement: $ => seq(
        'for',
        $._for_in_header,
        field('body', $._unbraced_statement),
      ),

      for_in_alt_statement: $ => seq(
        'for',
        $._for_in_header,
        ':',
        altBody($, 'body'),
        'endfor',
      ),

      // ucode allows only plain identifiers here, declared with `let` only.
      _for_in_header: $ => seq(
        '(',
        optional(field('kind', 'let')),
        choice(
          field('variable', $.identifier),
          seq(field('key', $.identifier), ',', field('value', $.identifier)),
        ),
        'in',
        field('object', $._expressions),
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
        altBody($, 'body'),
        'endwhile',
      ),

      // `catch` is required; there is no `finally`.
      try_statement: $ => seq(
        'try',
        field('body', $.statement_block),
        field('handler', $.catch_clause),
      ),

      // No labels. Use outside a loop is a compile-time error left to ucode.
      break_statement: $ => seq(
        'break',
        $._semicolon,
      ),

      continue_statement: $ => seq(
        'continue',
        $._semicolon,
      ),

      // ucode has no ASI, so `return⏎x` returns x. _return_marker lets the
      // scanner see this state and skip the newline ASI.
      return_statement: $ => seq(
        'return',
        optional($._return_marker),
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
        field('body', statements($)),
      ),

      switch_default: $ => seq(
        'default',
        ':',
        field('body', statements($)),
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
        $.identifier,
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

      // Trailing comma, but no elision.
      object: $ => prec('object', seq(
        '{',
        optional(seq(
          commaSep1(choice(
            $.pair,
            $.spread_element,
            alias($.identifier, $.shorthand_property_identifier),
          )),
          optional(','),
        )),
        '}',
      )),

      // Trailing comma, but no elision.
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

      // ucode lexes `?.[` and `?.(` as one token, hence token.immediate below.
      optional_chain: _ => '?.',

      call_expression: $ => choice(
        prec('call', seq(
          field('function', $.expression),
          field('arguments', $.arguments),
        )),
        prec('member', seq(
          field('function', $.primary_expression),
          field('optional_chain', $.optional_chain),
          field('arguments', alias($._immediate_arguments, $.arguments)),
        )),
      ),

      _immediate_arguments: $ => seq(
        token.immediate('('),
        commaSep(choice($.expression, $.spread_element)),
        ')',
      ),

      member_expression: $ => prec('member', seq(
        field('object', choice($.expression, $.primary_expression)),
        choice('.', field('optional_chain', $.optional_chain)),
        field('property', reserved('properties', alias($.identifier, $.property_identifier))),
      )),

      subscript_expression: $ => prec.right('member', seq(
        field('object', choice($.expression, $.primary_expression)),
        choice(
          '[',
          seq(field('optional_chain', $.optional_chain), alias(token.immediate('['), '[')),
        ),
        field('index', $._expressions), ']',
      )),

      // ucode rejects `(a) = 1`. `a?.b = 1` is left to its compiler.
      _lhs_expression: $ => choice(
        $.member_expression,
        $.subscript_expression,
        $.identifier,
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
        '?',
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
          ['**', 'binary_exp'],  // left-associative in ucode
          ['<', 'binary_relation'],
          ['<=', 'binary_relation'],
          ['==', 'binary_equality'],
          ['===', 'binary_equality'],
          ['!=', 'binary_equality'],
          ['!==', 'binary_equality'],
          ['>=', 'binary_relation'],
          ['>', 'binary_relation'],
          ['??', 'logical_or'],    // same level as ||
          ['in', 'binary_relation'],
        ].map(([operator, precedence]) =>
          prec.left(precedence, seq(
            field('left', $.expression),
            field('operator', operator),
            field('right', $.expression),
          )),
        ),
      ),

      unary_expression: $ => prec.left('unary', seq(
        field('operator', choice('!', '~', '-', '+')),
        field('argument', $.expression),
      )),

      // `delete (5)` is left to ucode's compiler.
      delete_expression: $ => prec.left('unary', seq(
        field('operator', 'delete'),
        field('argument', choice(
          $.member_expression,
          $.subscript_expression,
          $.parenthesized_expression,
        )),
      )),

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

      function_expression: $ => prec('function_literal', seq(
        'function',
        field('name', optional($.identifier)),
        $._call_signature,
        field('body', $.statement_block),
      )),

      function_declaration: $ => prec.right('declaration', seq(
        'function',
        field('name', $.identifier),
        $._call_signature,
        choice(
          field('body', $.statement_block),
          seq(':', altBody($, 'body'), 'endfunction'),
        ),
        optional($._automatic_semicolon),
      )),

      arrow_function: $ => seq(
        choice(
          field('parameter', $.identifier),
          $._call_signature,
        ),
        '=>',
        // Divergence: `x => {a: 1}` is an object here, a rejected block in ucode.
        field('body', choice(
          $.expression,
          $.statement_block,
        )),
      ),

      _call_signature: $ => field('parameters', $.formal_parameters),

      // A rest element comes last, with no trailing comma.
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

      // External content tokens: an internal one loses to the external
      // `comment` extra, so `'/*.uc'` would lex as a comment.
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

      // No `\u{…}`. Octal escapes are the external _octal_escape, which
      // range-checks them to <= 255.
      escape_sequence: _ => token.immediate(seq(
        '\\',
        choice(
          /[^xu0-7]/,
          /x[0-9a-fA-F]{2}/,
          /u[0-9a-fA-F]{4}/,
          /\r\n/,
        ),
      )),

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

      // The body is external: raw newlines are content, and an unterminated
      // `/` must not swallow the rest of the file.
      // Divergence: `a++ / b` is division here; ucode's lexer reads a regex.
      regex: $ => seq(
        '/',
        field('pattern', alias($._regex_content, $.regex_pattern)),
        token.immediate(prec(1, '/')),
        optional(field('flags', $.regex_flags)),
      ),

      regex_flags: _ => token.immediate(/[gis]+/),

      // Adds legacy octal (0177) and hex floats (0x1.8); no `1_000`, no `.5`.
      // After a leading 0: [0-7] is octal to the end, [89] is decimal.
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

        const legacyOctalLiteral = seq('0', /[0-7]+/);

        const decimalLiteral = choice(
          seq(/[1-9]/, optional(decimalDigits), optional(fraction), optional(exponentPart)),
          seq('0', /[89]/, optional(decimalDigits), optional(fraction), optional(exponentPart)),
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

      // ASCII only, no `$`.
      identifier: _ => /[A-Za-z_][A-Za-z0-9_]*/,

      this: _ => 'this',
      true: _ => 'true',
      false: _ => 'false',
      null: _ => 'null',

      // No trailing comma, unlike arrays and objects.
      arguments: $ => seq(
        '(',
        commaSep(choice($.expression, $.spread_element)),
        ')',
      ),

      // ucode rejects numeric keys (`{1: 2}`).
      _property_name: $ => reserved('properties', choice(
        alias($.identifier, $.property_identifier),
        $.string,
        $.computed_property_name,
      )),

      computed_property_name: $ => seq('[', $.expression, ']'),

      pair: $ => seq(
        field('key', $._property_name),
        ':',
        field('value', $.expression),
      ),

      // _block_end: end of input ends a statement, so `foo(a,` at EOF needs
      // only one MISSING token.
      _semicolon: $ => choice($._automatic_semicolon, ';', $._block_end),
    },
  });
};

function countingForHeader($) {
  // Divergence: any expression initializer is accepted; ucode allows only
  // `x`, `x = e`, `x op= e` or `x => e` there.
  return seq(
    'for',
    '(',
    choice(
      seq(field('initializer', alias($._for_lexical_declaration, $.lexical_declaration)), ';'),
      seq(field('initializer', $._expressions), ';'),
      field('initializer', $.empty_statement),
    ),
    choice(
      seq(field('condition', $._expressions), ';'),
      field('condition', $.empty_statement),
    ),
    field('increment', optional($._expressions)),
    ')',
  );
}

// Statements valid both in a list and as an unbraced body.
function controlStatements($) {
  return [
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
  ];
}

// At EOF the scanner emits _block_end once per open block, so the parser
// inserts each missing `}` / `endif` instead of an ERROR around the block.
function statements($) {
  return seq(repeat($.statement), optional($._block_end));
}

function altBody($, fieldName) {
  const list = fieldName ? field(fieldName, $.statement_list) : $.statement_list;
  return seq(optional(list), optional($._block_end));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

function commaSep(rule) {
  return optional(commaSep1(rule));
}
