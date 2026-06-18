/**
 * @file Ucdocs grammar for tree-sitter
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: 'ucdocs',

  extras: _ => [
    token(choice(
      // Skip leading stars at the start of each line (e.g. " * " in block comments)
      seq(/\n/, /[ \t]*/, repeat(seq('*', /[ \t]*/))),
      /\s/,
    )),
  ],

  rules: {
    document: $ => seq(
      $._begin,
      optional($.description),
      repeat(choice(
        $.param_tag,
        $.returns_tag,
        $.template_tag,
        $.typedef_tag,
        $.type_tag,
        $.throws_tag,
        $.deprecated_tag,
        $.since_tag,
        $.see_tag,
        $.example_tag,
        $.default_tag,
        $.unknown_tag,
      )),
      $._end,
    ),

    _begin: _ => seq('/', repeat('*')),
    _end: _ => '/',

    description: $ => prec.right(seq(
      $._text,
      repeat($._text),
    )),

    param_tag: $ => seq(
      '@param',
      optional(field('type', choice($.type_expression, $.rest_type_expression))),
      optional(field('name', $.identifier)),
      optional(field('description', $.description)),
    ),

    returns_tag: $ => seq(
      choice('@returns', '@return'),
      optional(field('type', $.type_expression)),
      optional(field('description', $.description)),
    ),

    template_tag: $ => seq(
      '@template',
      commaSep1(alias($.type_identifier, $.type_param)),
    ),

    typedef_tag: $ => seq(
      '@typedef',
      optional(field('type', $.type_expression)),
      field('name', $.type_identifier),
    ),

    type_tag: $ => seq(
      '@type',
      field('type', $.type_expression),
    ),

    throws_tag: $ => seq(
      choice('@throws', '@throw'),
      optional(field('type', $.type_expression)),
      optional(field('description', $.description)),
    ),

    deprecated_tag: $ => seq(
      '@deprecated',
      optional(field('description', $.description)),
    ),

    since_tag: $ => seq(
      '@since',
      optional(field('description', $.description)),
    ),

    see_tag: $ => seq(
      '@see',
      optional(field('description', $.description)),
    ),

    example_tag: $ => seq(
      '@example',
      optional(field('description', $.description)),
    ),

    default_tag: $ => seq(
      '@default',
      optional(field('description', $.description)),
    ),

    unknown_tag: $ => seq(
      $.tag_name,
      optional(field('description', $.description)),
    ),

    tag_name: _ => /@[a-zA-Z_]+/,

    // ── Type expressions ────────────────────────────────────────────────────

    type_expression: $ => seq('{', $._type, '}'),

    // {..Type} — only valid on @param, signals a rest/variadic parameter.
    rest_type_expression: $ => seq('{', '...', $._type, '}'),

    _type: $ => choice(
      $.primitive_type,
      $.list_type,
      $.dict_type,
      $.record_type,
      $.named_type,
      $.function_type,
      $.anon_function_type,
      $.union_type,
      $.nullable_type,
      $.any_type,
    ),

    primitive_type: _ => choice('int', 'float', 'string', 'boolean', 'null', 'void'),

    any_type: _ => choice('*', 'any'),

    list_type: $ => seq(
      'list',
      '<',
      field('element', $._type),
      '>',
    ),

    dict_type: $ => seq(
      'dict',
      '<',
      field('value', $._type),
      '>',
    ),

    record_type: $ => seq(
      '{',
      commaSep($.record_field),
      '}',
    ),

    record_field: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    // Covers bare TypeName and generic TypeName<T>, TypeName<T, U>, etc.
    named_type: $ => seq(
      field('name', $.type_identifier),
      optional(seq(
        '<',
        field('params', commaSep1($._type)),
        '>',
      )),
    ),

    function_type: $ => seq(
      '(',
      field('params', commaSep($.function_param)),
      ')',
      '=>',
      field('return', $._type),
    ),

    function_param: $ => seq(
      field('name', $.identifier),
      ':',
      field('type', $._type),
    ),

    // JSDoc anonymous function syntax: function(T, U): V (no parameter names).
    // Return type is optional to allow bare function(T) declarations.
    anon_function_type: $ => seq(
      'function',
      '(',
      field('params', commaSep($._type)),
      ')',
      optional(seq(':', field('return', $._type))),
    ),

    // Left-associative so T | U | V parses as (T | U) | V.
    union_type: $ => prec.left(1, seq($._type, '|', $._type)),

    // ?T is sugar for T | null; higher precedence than union so ?T | U == (?T) | U.
    nullable_type: $ => prec(2, seq('?', $._type)),

    // PascalCase names: typedef references and type parameters.
    type_identifier: _ => /[A-Z][a-zA-Z0-9]*/,

    // Lowercase-starting names: parameter names and function param names.
    identifier: _ => /[a-z_$][a-zA-Z_$0-9]*/,

    _text: _ => token(prec(-1, /[^*{@\s][^*@\n]*/)),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
