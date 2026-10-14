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

  // A run of `*` in prose — see src/scanner.c.
  externals: $ => [$._stars],

  extras: _ => [
    token(choice(
      // The comment frame at the start of each line: indentation and ONE
      // `*` (" * "). Only one, so markdown `**bold**` / `* bullets` at the
      // start of a line stay prose.
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

    // Exactly `/**`: a greedy `/\*+/` would swallow the closing stars of an
    // (almost) empty comment like `/***/`, leaving a lone `/` that `_end`
    // cannot match. Extra opening stars fall through to the body / `_end`.
    _begin: _ => token('/**'),
    _end: _ => token(seq(/\*+/, '/')),

    // Description prose: text, {@inline} tags, and balanced brace text, so
    // ordinary braces in prose — `{2,5}`, an object example — don't hard-error.
    //
    // After a tag that takes an optional {type} (param, returns, throws,
    // typedef, property), a leading `{...}` could be read as either the type or
    // the start of brace text. The decision is purely LEXICAL — the first token
    // after `{` — and the type wins: for a multi-character name (`{MyType}`)
    // longest-match prefers type_identifier over _brace_text's single-char lead
    // token, and for a single-character name (`{T}`, `{t}`) the tie is broken by
    // that lead token's negative lexical precedence (see _brace_text below).
    _description: $ => repeat1(choice($._text, $._stars, $.inline_tag, $._brace_text)),

    // {@link target text} and similar inline JSDoc tags embedded in description text.
    inline_tag: $ => seq(
      '{',
      $.tag_name,
      optional(alias($._description, $.description)),
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
        choice(token(prec(-1, /[^{}@\s]/)), $._brace_text),
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
      optional(field('name', choice($.identifier, $.param_path, $.optional_param))),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    // [name] or [name=default] — marks the parameter as optional, JSDoc-style.
    optional_param: $ => seq(
      '[',
      field('name', choice($.identifier, $.param_path)),
      optional(seq('=', field('default', $.default_value))),
      ']',
    ),

    // A dotted parameter path naming a nested option field: opts.precision.
    param_path: $ => seq($.identifier, repeat1($._path_segment)),

    // `.name` immediately after a name, as ONE token. A name never includes a
    // dot itself, and the segment must include the identifier after the dot,
    // so a name followed by a full stop (`@param {int} x. The value`,
    // `@property {number} Z_FINISH.`) keeps the name and leaves `.` to the
    // description: if names could run on through a dot, the lexer would share
    // that path with _text and fall back to it, swallowing the name.
    _path_segment: _ => token.immediate(prec(1, new RegExp(`\\.[${ID_CONT}]+`))),

    // The JSDoc `name - description` separator. Hidden, so descriptions don't
    // start with "- ". Requires whitespace after the hyphen so prose like
    // `-1 to disable` keeps its sign; the positive lexical precedence beats
    // _text's -1 where both could match.
    _separator: _ => token(prec(1, /-[ \t]+/)),

    // Anything up to the closing `]`, as the stdlib writes it: numbers (0, -1,
    // 0o666), constants (O_RDONLY), strings ("r" — which may contain `]`),
    // paths (/etc/config), calls (buffer.length()) and bracketed literals
    // ([]). Bare whitespace ends it: JSDoc writes `[name=value]` unspaced.
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
      commaSep1(alias($.type_identifier, $.type_param)),
    ),

    // @typedef {Type} Name description. Every part is optional, because the
    // ucode stdlib writes all of these:
    //   @typedef {Object} module:core.TimeSpec        (namepath name)
    //   @typedef {{ a: int }} Rec — what it is         (trailing description)
    //   @typedef                                       (bare: the name comes
    //   @name module:fs.ST_FLAGS                        from @name, the shape
    //   @property {number} ST_RDONLY - …                from @property lines)
    typedef_tag: $ => seq(
      '@typedef',
      optional(field('type', $.type_expression)),
      optional(field('name', choice($.type_identifier, $.identifier, $.namepath))),
      optional($._separator),
      optional(field('description', alias($._description, $.description))),
    ),

    // @property {Type} name description — one member of the enclosing
    // @typedef. Names are constants (ST_RDONLY — the most common form by far),
    // plain or dotted names (opts.mode), [optional] / [name=default] members,
    // or `*` (any further key).
    //
    // prec(1): a lone star-run right after the type is the `*` name, not the
    // start of a description (the scanner's star token is valid in both).
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
      optional(field('description', alias($._description, $.description))),
    ),

    tag_name: _ => /@[a-zA-Z_]+/,

    // ── Type expressions ────────────────────────────────────────────────────

    // Whether a leading `{...}` is this or brace-text prose is settled by the
    // lexer, not here — see _description.
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

    // The doc-convention names (int, float, …) plus ucode's own runtime type
    // names as `type()` reports them (integer, double, object, array, regexp,
    // resource) and `number`, by far the most used type in the stdlib docs.
    primitive_type: _ => choice(
      'int', 'integer', 'float', 'double', 'number',
      'string', 'boolean', 'null', 'void', 'function',
      'object', 'array', 'regexp', 'resource',
    ),

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

    // prec(1): right after a tag, `{{}}` could also be nested brace-text
    // prose; as everywhere else here, the type reading wins.
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

    // module:core.ParseConfig — cross-module type reference used by stdlib docs.
    module_type: $ => seq(
      'module:',
      field('path', $.module_path),
    ),

    module_path: _ => new RegExp(`${IDENT}(\\.${IDENT})*`),

    // Covers bare names and generic TypeName<T>, TypeName<T, U>, etc.
    // Accepts both PascalCase (type_identifier) and lowercase (identifier) names,
    // and the older JSDoc dotted generic `Array.<T>`.
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

    // A variadic parameter in a function type: `(...args: any) => R`, or
    // unnamed as the stdlib writes it: `(...any) => R`, `function(string, ...any)`.
    rest_param: $ => seq(
      '...',
      choice(
        seq(field('name', $.identifier), ':', field('type', $._type)),
        field('type', $._type),
      ),
    ),

    // JSDoc anonymous function syntax: function(T, U): V (no parameter names).
    // Return type is optional to allow bare function(T) declarations.
    anon_function_type: $ => seq(
      'function',
      '(',
      field('params', commaSep(choice($._type, $.rest_param))),
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
    //
    // An `@` directly after a non-space character is prose too — an email
    // (`foo@bar.com`), a code span (`` `@` ``), a quoted `"@"` — so only an
    // `@` that starts a word can begin a block tag. (JSDoc only recognises
    // tags at the start of a line; "after whitespace" is the closest a
    // context-free lexer gets, and keeps one-line `/** @a … @b … */` working.)
    _text: _ => token(prec(-1, seq(
      /[^*{}@\s]@*/,
      repeat(choice(/[^*{}@\n\r]/, /\*+[^*/{}@\n\r]@*/, /[^\s*{}@]@+/)),
    ))),
  },
});

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
