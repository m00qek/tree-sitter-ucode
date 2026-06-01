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

module.exports = grammar({
  name: 'ucode',

  externals: $ => [
    $._automatic_semicolon,
    $._template_chars,
    $._ternary_qmark,
  ],

  extras: $ => [
    $.comment,
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
    $._formal_parameter,
    $._expressions,
    $._semicolon,
    $._identifier,
    $._reserved_identifier,
    $._lhs_expression,
  ],

  precedences: $ => [
    [
      'member',
      'call',
      $.update_expression,
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
    [$.assignment_expression, $.pattern],
    [$.labeled_statement, $._property_name],
  ],

  word: $ => $.identifier,

  rules: {
    program: $ => seq(
      optional($.hash_bang_line),
      repeat($.statement),
    ),

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
        $.export_clause,
        $._semicolon,
      ),
      seq(
        'export',
        choice(
          field('declaration', $.declaration),
          seq(
            'default',
            seq(
              field('value', $.expression),
              ';',
            ),
          ),
        ),
      ),
    ),

    export_clause: $ => seq(
      '{',
      commaSep($.export_specifier),
      optional(','),
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
        seq($.import_clause, 'from', field('source', $.string)),
        field('source', $.string),
      ),
      $._semicolon,
    ),

    import_clause: $ => choice(
      $.namespace_import,
      $.named_imports,
      seq(
        $.identifier,
        optional(seq(
          ',',
          choice(
            $.namespace_import,
            $.named_imports,
          ),
        )),
      ),
    ),

    namespace_import: $ => seq('*', 'as', $.identifier),

    named_imports: $ => seq(
      '{',
      commaSep($.import_specifier),
      optional(','),
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
      $.labeled_statement,
    ),

    expression_statement: $ => seq(
      $._expressions,
      $._semicolon,
    ),

    lexical_declaration: $ => seq(
      field('kind', choice('let', 'const')),
      commaSep1($.variable_declarator),
      $._semicolon,
    ),

    variable_declarator: $ => seq(
      field('name', $.identifier),
      optional($._initializer),
    ),

    statement_block: $ => prec.right(seq(
      '{',
      repeat($.statement),
      '}',
      optional($._automatic_semicolon),
    )),

    else_clause: $ => seq('else', $.statement),

    // Standard brace-based if
    if_statement: $ => prec.right(seq(
      'if',
      field('condition', $.parenthesized_expression),
      field('consequence', $.statement),
      optional(field('alternative', $.else_clause)),
    )),

    // Alternative colon/endif syntax
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
      field('body', $.statement),
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
      field('body', $.statement),
    ),

    for_in_alt_statement: $ => seq(
      'for',
      $._for_header,
      ':',
      field('body', repeat($.statement)),
      'endfor',
    ),

    // Supports both `for (k in obj)` and `for (k, v in obj)` (ucode two-variable form)
    _for_header: $ => seq(
      '(',
      choice(
        seq(
          field('kind', choice('let', 'const')),
          field('left', $.identifier),
          optional(seq(',', field('value', $.identifier))),
        ),
        seq(
          field('left', $._lhs_expression),
          optional(seq(',', field('value', $.identifier))),
        ),
      ),
      'in',
      field('right', $._expressions),
      ')',
    ),

    while_statement: $ => seq(
      'while',
      field('condition', $.parenthesized_expression),
      field('body', $.statement),
    ),

    while_alt_statement: $ => seq(
      'while',
      field('condition', $.parenthesized_expression),
      ':',
      field('body', repeat($.statement)),
      'endwhile',
    ),

    try_statement: $ => seq(
      'try',
      field('body', $.statement_block),
      optional(field('handler', $.catch_clause)),
    ),

    break_statement: $ => seq(
      'break',
      field('label', optional(alias($.identifier, $.statement_identifier))),
      $._semicolon,
    ),

    continue_statement: $ => seq(
      'continue',
      field('label', optional(alias($.identifier, $.statement_identifier))),
      $._semicolon,
    ),

    return_statement: $ => seq(
      'return',
      optional($._expressions),
      $._semicolon,
    ),

    empty_statement: _ => ';',

    labeled_statement: $ => prec.dynamic(-1, seq(
      field('label', alias(choice($.identifier, $._reserved_identifier), $.statement_identifier)),
      ':',
      field('body', $.statement),
    )),

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

    object: $ => prec('object', seq(
      '{',
      commaSep(optional(choice(
        $.pair,
        $.spread_element,
        alias(
          choice($.identifier, $._reserved_identifier),
          $.shorthand_property_identifier,
        ),
      ))),
      '}',
    )),

    array: $ => seq(
      '[',
      commaSep(optional(choice(
        $.expression,
        $.spread_element,
      ))),
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

    _lhs_expression: $ => choice(
      $.member_expression,
      $.subscript_expression,
      $._identifier,
      alias($._reserved_identifier, $.identifier),
    ),

    assignment_expression: $ => prec.right('assign', seq(
      field('left', choice($.parenthesized_expression, $._lhs_expression)),
      '=',
      field('right', $.expression),
    )),

    _augmented_assignment_lhs: $ => choice(
      $.member_expression,
      $.subscript_expression,
      alias($._reserved_identifier, $.identifier),
      $.identifier,
      $.parenthesized_expression,
    ),

    augmented_assignment_expression: $ => prec.right('assign', seq(
      field('left', $._augmented_assignment_lhs),
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
        ['**', 'binary_exp', 'right'],
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
      field('operator', choice('!', '~', '-', '+', 'delete')),
      field('argument', $.expression),
    )),

    update_expression: $ => prec.left(choice(
      seq(
        field('argument', $.expression),
        field('operator', choice('++', '--')),
      ),
      seq(
        field('operator', choice('++', '--')),
        field('argument', $.expression),
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
      field('body', choice(
        $.expression,
        $.statement_block,
      )),
    ),

    _call_signature: $ => field('parameters', $.formal_parameters),
    _formal_parameter: $ => choice($.identifier, $.rest_element),

    formal_parameters: $ => seq(
      '(',
      optional(seq(
        commaSep1($._formal_parameter),
        optional(','),
      )),
      ')',
    ),

    rest_element: $ => seq('...', $.identifier),

    pattern: $ => prec.dynamic(-1, $._lhs_expression),

    //
    // Primitives
    //

    string: $ => choice(
      seq(
        '"',
        repeat(choice(
          alias($.unescaped_double_string_fragment, $.string_fragment),
          $.escape_sequence,
        )),
        '"',
      ),
      seq(
        '\'',
        repeat(choice(
          alias($.unescaped_single_string_fragment, $.string_fragment),
          $.escape_sequence,
        )),
        '\'',
      ),
    ),

    unescaped_double_string_fragment: _ => token.immediate(prec(1, /[^"\\\r\n]+/)),
    unescaped_single_string_fragment: _ => token.immediate(prec(1, /[^'\\\r\n]+/)),

    // Ucode extends JS escapes with \e (ESC), \a (BEL), and octal sequences
    escape_sequence: _ => token.immediate(seq(
      '\\',
      choice(
        /[^xu0-7]/,
        /[0-7]{1,3}/,
        /x[0-9a-fA-F]{2}/,
        /u[0-9a-fA-F]{4}/,
        /u\{[0-9a-fA-F]+\}/,
        /\r[\n\u2028\u2029]/,
      ),
    )),

    comment: _ => token(choice(
      seq("//", /[^\r\n\u2028\u2029]*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/'),
    )),

    template_string: $ => seq(
      '`',
      repeat(choice(
        alias($._template_chars, $.string_fragment),
        $.escape_sequence,
        $.template_substitution,
      )),
      '`',
    ),

    template_substitution: $ => seq(
      '${',
      $._expressions,
      '}',
    ),

    regex: $ => seq(
      '/',
      field('pattern', $.regex_pattern),
      token.immediate(prec(1, '/')),
      optional(field('flags', $.regex_flags)),
    ),

    regex_pattern: _ => token.immediate(prec(-1,
      repeat1(choice(
        seq('[', repeat(choice(seq('\\', /./), /[^\]\n\\]/)), ']'),
        seq('\\', /./),
        /[^/\\\[\n]/,
      )),
    )),

    // Ucode supports only g, i, s flags (not m, u, y, d)
    regex_flags: _ => token.immediate(/[gis]+/),

    // Ucode number literals extend JS with:
    // - C-style legacy octal: 0177
    // - Hex float: 0x1.8
    // - Uppercase prefixes: 0O, 0B (already in JS grammar)
    number: _ => {
      const hexDigits = /[\da-fA-F](_?[\da-fA-F])*/;
      const hexLiteral = seq(choice('0x', '0X'), hexDigits);
      const hexFloat = seq(choice('0x', '0X'), hexDigits, '.', optional(hexDigits));

      const decimalDigits = /\d(_?\d)*/;
      const signedInteger = seq(optional(choice('-', '+')), decimalDigits);
      const exponentPart = seq(choice('e', 'E'), signedInteger);

      const binaryLiteral = seq(choice('0b', '0B'), /[0-1](_?[0-1])*/);
      const octalLiteral = seq(choice('0o', '0O'), /[0-7](_?[0-7])*/);
      const legacyOctalLiteral = seq('0', /[0-7]+/);

      const decimalIntegerLiteral = choice(
        '0',
        seq(optional('0'), /[1-9]/, optional(seq(optional('_'), decimalDigits))),
      );

      const decimalLiteral = choice(
        seq(decimalIntegerLiteral, '.', optional(decimalDigits), optional(exponentPart)),
        seq('.', decimalDigits, optional(exponentPart)),
        seq(decimalIntegerLiteral, exponentPart),
        decimalDigits,
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

    identifier: _ => {
      const alpha = /[^\x00-\x1F\s\p{Zs}0-9:;`"'@#.,|^&<=>+\-*/\\%?!~()\[\]{}\uFEFF\u2060\u200B\u2028\u2029]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      const alphanumeric = /[^\x00-\x1F\s\p{Zs}:;`"'@#.,|^&<=>+\-*/\\%?!~()\[\]{}\uFEFF\u2060\u200B\u2028\u2029]|\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}/;
      return token(seq(alpha, repeat(alphanumeric)));
    },

    this: _ => 'this',
    true: _ => 'true',
    false: _ => 'false',
    null: _ => 'null',

    arguments: $ => seq(
      '(',
      commaSep(optional(choice($.expression, $.spread_element))),
      ')',
    ),

    _property_name: $ => reserved('properties', choice(
      alias(
        choice($.identifier, $._reserved_identifier),
        $.property_identifier,
      ),
      $.string,
      $.number,
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

function forHeader($) {
  return seq(
    'for',
    '(',
    choice(
      field('initializer', $.lexical_declaration),
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
