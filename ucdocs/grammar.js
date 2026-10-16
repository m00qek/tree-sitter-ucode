/**
 * @file Ucdocs grammar for tree-sitter
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// ucode's identifier alphabet: ASCII, no `$`.
const ID_START = 'a-zA-Z_';
const ID_CONT = 'a-zA-Z0-9_';
const IDENT = `[${ID_START}][${ID_CONT}]*`;

module.exports = grammar({
  name: 'ucdocs',

  // A run of `*` in prose — see src/scanner.c.
  externals: $ => [$._stars],

  extras: _ => [
    token(choice(
      // The ` * ` frame: one star only, so `**bold**` / `* item` stay prose.
      seq(/\n/, /[ \t]*/, optional(seq('*', /[ \t]*/))),
      /\s/,
    )),
  ],

  rules: {
    document: $ => seq(
      $._begin,
      optional(alias($._description, $.description)),
      repeat(choice(
        $.param_tag,
        $.returns_tag,
        $.template_tag,
        $.typedef_tag,
        $.property_tag,
        $.type_tag,
        $.throws_tag,
        $.deprecated_tag,
        $.since_tag,
        $.see_tag,
        $.example_tag,
        $.default_tag,
        $.function_tag,
        $.module_tag,
        $.unknown_tag,
      )),
      $._end,
    ),

    // Exactly `/**`: `/\*+/` would eat the closing stars of `/***/`.
    _begin: _ => token('/**'),
    _end: _ => token(seq(/\*+/, '/')),

    // Balanced braces are prose. After a tag, a leading `{…}` is lexed as the
    // type (see _brace_text). An unbalanced `{` is an error. `text` nodes never
    // cross a line end, so joining them line by line drops the frame.
    _description: $ => repeat1(choice(
      alias($._text, $.text),
      alias($._stars, $.text),
      $.inline_tag,
      $._brace_text,
      $._stray_close_brace,
    )),

    // prec(-1): inside an inline tag, the tag's own closing `}` wins.
    _stray_close_brace: _ => token(prec(-1, '}')),

    inline_tag: $ => seq(
      '{',
      $.tag_name,
      optional(alias($._description, $.description)),
      '}',
    ),

    // Balanced `{…}` prose, e.g. object literals in @example. prec(-1) on the
    // lead char: `{T}` after a tag ties with a one-letter type, and the type wins.
    _brace_text: $ => seq(
      '{',
      optional(seq(
        choice(token(prec(-1, /[^{}@\s]/)), $._brace_text),
        // Not across a line end, so the frame stays an extra.
        repeat(choice(
          /[^{}\n]+/,
          $._brace_text,
        )),
      )),
      '}',
    ),

    param_tag: $ => seq(
      '@param',
      optional(field('type', choice($.type_expression, $.rest_type_expression))),
      optional(field('name', choice($.identifier, $.param_path, $.optional_param))),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    optional_param: $ => seq(
      '[',
      field('name', choice($.identifier, $.param_path)),
      optional(seq('=', field('default', $.default_value))),
      ']',
    ),

    param_path: $ => seq($.identifier, repeat1($._path_segment)),

    // One token including the name after the dot, so `x. The value` keeps
    // `x` as the name and the full stop as prose.
    _path_segment: _ => token.immediate(prec(1, new RegExp(`\\.[${ID_CONT}]+`))),

    // `name - description`. Needs a space after `-`, so `-1 to disable` is prose.
    _separator: _ => token(prec(1, /-[ \t]+/)),

    // Anything up to `]`; strings and `[]` may contain `]`. Whitespace ends it.
    default_value: _ => token(repeat1(choice(
      /"([^"\\\n]|\\.)*"/,
      /'([^'\\\n]|\\.)*'/,
      /\[[^\[\]\n]*\]/,
      /[^\[\]"'\s]/,
    ))),

    returns_tag: $ => seq(
      choice('@returns', '@return'),
      optional(field('type', $.type_expression)),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    template_tag: $ => seq(
      '@template',
      commaSep1(alias(choice($.type_identifier, $.identifier), $.type_param)),
    ),

    // Every part is optional: the stdlib also writes a bare @typedef.
    typedef_tag: $ => seq(
      '@typedef',
      optional(field('type', $.type_expression)),
      optional(field('name', choice($.type_identifier, $.identifier, $.namepath))),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    // prec(1): a `*` after the type is the name (any key), not prose.
    property_tag: $ => prec(1, seq(
      choice('@property', '@prop'),
      optional(field('type', $.type_expression)),
      optional(field('name', choice(
        $.property_name,
        $.optional_param,
        alias($._stars, $.property_name),
      ))),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    )),

    property_name: $ => seq(/[A-Za-z0-9_$]+/, repeat($._path_segment)),

    type_tag: $ => seq(
      '@type',
      field('type', $.type_expression),
    ),

    throws_tag: $ => seq(
      choice('@throws', '@throw'),
      optional(field('type', $.type_expression)),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    deprecated_tag: $ => seq(
      '@deprecated',
      optional(field('description', alias($._description, $.description))),
    ),

    since_tag: $ => seq(
      '@since',
      optional(field('description', alias($._description, $.description))),
    ),

    see_tag: $ => seq(
      '@see',
      optional(field('description', alias($._description, $.description))),
    ),

    example_tag: $ => seq(
      '@example',
      optional(field('description', alias($._description, $.description))),
    ),

    default_tag: $ => seq(
      '@default',
      optional(field('description', alias($._description, $.description))),
    ),

    function_tag: $ => seq(
      '@function',
      optional(field('namepath', $.namepath)),
    ),

    // A bare @module is named after the file.
    module_tag: $ => seq(
      '@module',
      optional(field('name', $.member_name)),
    ),

    // module:X.Y#Z
    namepath: $ => seq(
      'module:',
      field('path', $.module_path),
      optional(seq('#', field('member', $.member_name))),
    ),

    member_name: _ => new RegExp(IDENT),

    unknown_tag: $ => seq(
      $.tag_name,
      optional(field('description', alias($._description, $.description))),
    ),

    tag_name: _ => /@[a-zA-Z_]+/,

    // ── Type expressions ────────────────────────────────────────────────────

    type_expression: $ => seq('{', $._type, '}'),

    // {...Type}, @param only.
    rest_type_expression: $ => seq('{', '...', $._type, '}'),

    _type: $ => choice($._non_union_type, $.union_type),

    _non_union_type: $ => choice(
      $.primitive_type,
      $.list_type,
      $.dict_type,
      $.record_type,
      $.named_type,
      $.module_type,
      $.function_type,
      $.anon_function_type,
      $.nullable_type,
      $.any_type,
      $.parenthesized_type,
      $.array_type,
    ),

    // Doc-convention names plus the names ucode's `type()` returns.
    primitive_type: _ => choice(
      'int', 'integer', 'float', 'double', 'number',
      'string', 'boolean', 'null', 'void', 'function',
      'object', 'array', 'regexp', 'resource',
    ),

    any_type: _ => choice('*', 'any'),

    list_type: $ => seq(
      'list',
      optional(seq('<', field('element', $._type), '>')),
    ),

    dict_type: $ => seq(
      'dict',
      optional(seq('<', field('value', $._type), '>')),
    ),

    // prec(1): `{{}}` after a tag is a type, not brace-text prose.
    record_type: $ => prec(1, seq(
      '{',
      commaSep($.record_field),
      '}',
    )),

    record_field: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    module_type: $ => seq(
      'module:',
      field('path', $.module_path),
    ),

    module_path: _ => new RegExp(`${IDENT}(\\.${IDENT})*`),

    // Also the old JSDoc `Array.<T>`.
    named_type: $ => seq(
      field('name', choice($.type_identifier, $.identifier)),
      optional(seq(
        optional('.'),
        '<',
        field('params', commaSep1($._type)),
        '>',
      )),
    ),

    function_type: $ => seq(
      '(',
      field('params', commaSep(choice($.function_param, $.rest_param))),
      ')',
      '=>',
      field('return', $._type),
    ),

    function_param: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    // `...args: any`, or unnamed `...any`.
    rest_param: $ => seq(
      '...',
      choice(
        seq(field('name', $.identifier), ':', field('type', $._type)),
        field('type', $._type),
      ),
    ),

    // function(T, U): V
    anon_function_type: $ => seq(
      'function',
      '(',
      field('params', commaSep(choice($._type, $.rest_param))),
      ')',
      optional(seq(':', field('return', $._type))),
    ),

    parenthesized_type: $ => seq('(', $._type, ')'),

    // ?T[] == ?(T[])
    array_type: $ => prec(3, seq($._non_union_type, '[]')),

    // Flat: T | U | V is one node. prec(1): a function's return type takes
    // the whole union.
    union_type: $ => prec(1, seq($._non_union_type, repeat1(seq('|', $._non_union_type)))),

    // ?T | U == (?T) | U
    nullable_type: $ => prec(2, seq('?', $._non_union_type)),

    type_identifier: _ => new RegExp(`[A-Z][${ID_CONT}]*`),

    identifier: _ => new RegExp(`[a-z_][${ID_CONT}]*`),

    // Prose. A star-run is taken only before a non-`*`/`/` char, so it never
    // eats `*/`. An `@` after a non-space (`foo@bar.com`) is prose; only one
    // starting a word begins a tag. The token starts and ends on a non-space,
    // so a description ends at its last visible character.
    _text: _ => token(prec(-1, seq(
      /[^*{}@\s]@*/,
      repeat(seq(
        /[^\S\n\r]*/,
        choice(/[^*{}@\s]@*/, /\*+[^*/{}@\s]@*/),
      )),
    ))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
