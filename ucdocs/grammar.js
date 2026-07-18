/**
 * @file Ucdocs grammar for tree-sitter
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Shared identifier alphabet (JS-style), written once so the character
// classes can't drift between the rules that use them. ID_START is the set
// of first characters; ID_CONT the set of subsequent characters.
const ID_START = 'a-zA-Z_$';
const ID_CONT = 'a-zA-Z0-9_$';
const IDENT = `[${ID_START}][${ID_CONT}]*`;

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

    // Exactly `/**`: a greedy `/\*+/` would swallow the closing stars of an
    // (almost) empty comment like `/***/`, leaving a lone `/` that `_end`
    // cannot match. Extra opening stars fall through to the body / `_end`.
    _begin: _ => token('/**'),
    _end: _ => token(seq(/\*+/, '/')),

    // Description after an optional {type} (param_tag, returns_tag, throws_tag).
    // Includes _brace_text so ordinary braces in prose — `{2,5}`, an object
    // example — don't hard-error. When a leading `{...}` could be read as either
    // the type or the start of a brace-text description, the type wins: for a
    // multi-character name (`{MyType}`) longest-match already prefers
    // type_identifier over _brace_text's single-char lead token, and for a
    // single-character name (`{T}`, `{t}`) the tie is broken by the negative
    // lexical precedence on that lead token (see _brace_text below), so
    // `@param {int} n` and `@param {T} n` both parse the brace as the type.
    _typed_description: $ => repeat1(choice($._text, $.inline_tag, $._brace_text)),

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
    //
    // The single-character lead token carries prec(-1) so that when a `{X}` could
    // begin either a type or brace-text and both match the same length — i.e. a
    // single-char name like `{T}`/`{t}` — the type_identifier/identifier token
    // (default precedence) wins the tie and the brace parses as the type. Without
    // it, `@param {T} item` mis-parses `{T}` as description prose (multi-char
    // names are already saved by longest-match). Mirrors the prec(-1) on `_text`.
    _brace_text: $ => seq(
      '{',
      optional(seq(
        token(prec(-1, /[^{}@]/)),
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
      new RegExp(IDENT),
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
      field('name', choice($.type_identifier, $.identifier)),
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
    member_name: _ => new RegExp(IDENT),

    unknown_tag: $ => seq(
      $.tag_name,
      optional(field('description', alias($._free_description, $.description))),
    ),

    tag_name: _ => /@[a-zA-Z_]+/,

    // ── Type expressions ────────────────────────────────────────────────────

    // prec.dynamic biases the leading `{...}` toward the type when its contents
    // also parse as brace-text description (e.g. `@param {int} n`); a `{...}`
    // that is not a valid type (e.g. `{2,5}`) has only the brace-text parse.
    type_expression: $ => prec.dynamic(1, seq('{', $._type, '}')),

    // {..Type} — only valid on @param, signals a rest/variadic parameter.
    rest_type_expression: $ => prec.dynamic(1, seq('{', '...', $._type, '}')),

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

    module_path: _ => new RegExp(`${IDENT}(\\.${IDENT})*`),

    // Covers bare names and generic TypeName<T>, TypeName<T, U>, etc.
    // Accepts both PascalCase (type_identifier) and lowercase (identifier) names.
    named_type: $ => seq(
      field('name', choice($.type_identifier, $.identifier)),
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

    // Uppercase-starting names: PascalCase typedef references and type parameters.
    type_identifier: _ => new RegExp(`[A-Z][${ID_CONT}]*`),

    // Lowercase-starting names: parameter names and function param names.
    identifier: _ => new RegExp(`[a-z_$][${ID_CONT}]*`),

    // Description prose. A literal `*` (multiplication, markdown **bold**, a
    // glob) is allowed mid-text: it is consumed only as a star-run followed by
    // a non-`*`/non-`/` character, so it can never eat into a `*/` terminator
    // (a star-run before the terminator is always `\*+/`, which this refuses,
    // leaving it for `_end`).
    _text: _ => token(prec(-1, seq(
      choice(/[^*{}@\s]/, /\*+[^*/{}@\s]/),
      repeat(choice(/[^*{}@\n\r]/, /\*+[^*/{}@\n\r]/)),
    ))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
