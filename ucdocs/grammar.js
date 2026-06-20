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
      optional(alias($._free_description, $.description)),
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
        $.function_tag,
        $.module_tag,
        $.unknown_tag,
      )),
      $._end,
    ),

    _begin: _ => token(seq('/', /\*+/)),
    _end: _ => token(seq(/\**/, '/')),

    // Used after a type_expression/rest_type_expression has already claimed `{` at
    // this position (param_tag, returns_tag, throws_tag) — excludes _brace_text so
    // it never competes with a legitimate {type} for the leading `{`.
    _typed_description: $ => repeat1(choice($._text, $.inline_tag)),

    // Used wherever no type_expression can appear at the same position, so a bare
    // `{` can only be an inline tag or arbitrary brace-text (e.g. @example code).
    _free_description: $ => repeat1(choice($._text, $.inline_tag, $._brace_text)),

    // {@link target text} and similar inline JSDoc tags embedded in description text.
    inline_tag: $ => seq(
      '{',
      $.tag_name,
      optional(alias($._free_description, $.description)),
      '}',
    ),

    // A `{` not immediately followed by `@tagname` is not an inline tag — e.g. an
    // object literal or arrow-function block in an @example code block. Recursive
    // so nested braces (object literals inside arrow functions, etc.) stay balanced
    // instead of erroring out on the first inner `}`.
    _brace_text: $ => seq(
      '{',
      optional(seq(
        /[^{}@]/,
        repeat(choice(
          /[^{}]+/,
          $._brace_text,
        )),
      )),
      '}',
    ),

    param_tag: $ => seq(
      '@param',
      optional(field('type', choice($.type_expression, $.rest_type_expression))),
      optional(field('name', choice($.identifier, $.optional_param))),
      optional(field('description', alias($._typed_description, $.description))),
    ),

    // [name] or [name=default] — marks the parameter as optional, JSDoc-style.
    optional_param: $ => seq(
      '[',
      field('name', $.param_path),
      optional(seq('=', field('default', $.default_value))),
      ']',
    ),

    // Dotted parameter paths, e.g. opts.precision for nested option fields.
    param_path: $ => seq(
      $.identifier,
      repeat(seq('.', $.identifier)),
    ),

    default_value: _ => token(choice(
      /-?\d+(\.\d+)?/,
      /[a-zA-Z_$][a-zA-Z0-9_$]*/,
    )),

    returns_tag: $ => seq(
      choice('@returns', '@return'),
      optional(field('type', $.type_expression)),
      optional(field('description', alias($._typed_description, $.description))),
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
      optional(field('description', alias($._typed_description, $.description))),
    ),

    deprecated_tag: $ => seq(
      '@deprecated',
      optional(field('description', alias($._free_description, $.description))),
    ),

    since_tag: $ => seq(
      '@since',
      optional(field('description', alias($._free_description, $.description))),
    ),

    see_tag: $ => seq(
      '@see',
      optional(field('description', alias($._free_description, $.description))),
    ),

    example_tag: $ => seq(
      '@example',
      optional(field('description', alias($._free_description, $.description))),
    ),

    default_tag: $ => seq(
      '@default',
      optional(field('description', alias($._free_description, $.description))),
    ),

    // @function module:X.Y#Z — identifies the qualified name of the documented function.
    function_tag: $ => seq(
      '@function',
      optional(field('namepath', $.namepath)),
    ),

    // @module name — identifies the module this file documents.
    module_tag: $ => seq(
      '@module',
      field('name', $.member_name),
    ),

    // module:X.Y#Z — a namepath referencing a specific member within a module.
    // The #member suffix distinguishes instance methods from the module path itself.
    namepath: $ => seq(
      'module:',
      field('path', $.module_path),
      optional(seq('#', field('member', $.member_name))),
    ),

    // Member names cover lowercase (error), uppercase (ERR), and underscored (ulog_open).
    member_name: _ => /[a-zA-Z_$][a-zA-Z0-9_$]*/,

    unknown_tag: $ => seq(
      $.tag_name,
      optional(field('description', alias($._free_description, $.description))),
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
      $.module_type,
      $.function_type,
      $.anon_function_type,
      $.union_type,
      $.nullable_type,
      $.any_type,
      $.parenthesized_type,
      $.array_type,
    ),

    primitive_type: _ => choice('int', 'float', 'string', 'boolean', 'null', 'void', 'function'),

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

    // module:core.ParseConfig — cross-module type reference used by stdlib docs.
    module_type: $ => seq(
      'module:',
      field('path', $.module_path),
    ),

    module_path: _ => /[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*/,

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

    // Explicit grouping: (T|U) to override default union associativity or
    // for clarity in complex expressions like ?(T|U).
    parenthesized_type: $ => seq('(', $._type, ')'),

    // T[] postfix array notation.  Precedence 3 > nullable (2) > union (1)
    // so ?T[] == ?(T[]) and T[]|U[] == (T[])|(U[]).
    array_type: $ => prec(3, seq($._type, '[]')),

    // Left-associative so T | U | V parses as (T | U) | V.
    union_type: $ => prec.left(1, seq($._type, '|', $._type)),

    // ?T is sugar for T | null; higher precedence than union so ?T | U == (?T) | U.
    nullable_type: $ => prec(2, seq('?', $._type)),

    // PascalCase names: typedef references and type parameters.
    type_identifier: _ => /[A-Z][a-zA-Z0-9]*/,

    // Lowercase-starting names: parameter names and function param names.
    identifier: _ => /[a-z_$][a-zA-Z_$0-9]*/,

    _text: _ => token(prec(-1, /[^*{}@\s][^*{}@\n\r]*/)),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
