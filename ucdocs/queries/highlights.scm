; Tag keywords

(tag_name) @keyword

(param_tag "@param" @keyword)
(returns_tag ["@returns" "@return"] @keyword)
(template_tag "@template" @keyword)
(typedef_tag "@typedef" @keyword)
(property_tag ["@property" "@prop"] @keyword)
(type_tag "@type" @keyword)
(throws_tag ["@throws" "@throw"] @keyword)
(deprecated_tag "@deprecated" @keyword)
(since_tag "@since" @keyword)
(see_tag "@see" @keyword)
(example_tag "@example" @keyword)
(default_tag "@default" @keyword)
(function_tag "@function" @keyword)
(module_tag "@module" @keyword)

; Names

(type_param) @type.parameter
(type_identifier) @type
(primitive_type) @type.builtin
(anon_function_type "function" @type.builtin)
(list_type "list" @type.builtin)
(dict_type "dict" @type.builtin)
(any_type) @type.builtin

; Lowercase names are parameters only in name positions.
(param_tag name: (identifier) @variable.parameter)
(param_tag name: (param_path) @variable.parameter)
(optional_param name: (_) @variable.parameter)
(function_param name: (identifier) @variable.parameter)
(rest_param name: (identifier) @variable.parameter)
(named_type name: (identifier) @type)
(typedef_tag name: (identifier) @type)
(record_field name: (identifier) @variable.member)
(member_name) @variable.member
(property_name) @variable.member

(default_value) @constant

; Module paths

(module_type "module:" @module)
(module_type path: (module_path) @module)
(namepath "module:" @module)
(namepath path: (module_path) @module)

; Operators

(union_type "|" @operator)
(nullable_type "?" @operator)
(function_type "=>" @operator)
(optional_param "=" @operator)

; Punctuation: brackets

(type_expression "{" @punctuation.bracket "}" @punctuation.bracket)
(rest_type_expression "{" @punctuation.bracket "}" @punctuation.bracket)
(record_type "{" @punctuation.bracket "}" @punctuation.bracket)
(parenthesized_type "(" @punctuation.bracket ")" @punctuation.bracket)
(function_type "(" @punctuation.bracket ")" @punctuation.bracket)
(anon_function_type "(" @punctuation.bracket ")" @punctuation.bracket)
(named_type "<" @punctuation.bracket ">" @punctuation.bracket)
(list_type "<" @punctuation.bracket ">" @punctuation.bracket)
(dict_type "<" @punctuation.bracket ">" @punctuation.bracket)
(optional_param "[" @punctuation.bracket "]" @punctuation.bracket)
(array_type "[]" @punctuation.bracket)
(inline_tag "{" @punctuation.bracket "}" @punctuation.bracket)

; Punctuation: delimiters

"," @punctuation.delimiter
(named_type "." @punctuation.delimiter)
(record_field ":" @punctuation.delimiter)
(function_param ":" @punctuation.delimiter)
(rest_param ":" @punctuation.delimiter)
(anon_function_type ":" @punctuation.delimiter)
(namepath "#" @punctuation.delimiter)

; Punctuation: special

(rest_type_expression "..." @punctuation.special)
(rest_param "..." @punctuation.special)

; Descriptions

; @spell on prose only (@example holds code), before @comment: the last
; capture wins.
(document          (description) @spell)
(param_tag         description: (description) @spell)
(returns_tag       description: (description) @spell)
(typedef_tag       description: (description) @spell)
(property_tag      description: (description) @spell)
(throws_tag        description: (description) @spell)
(deprecated_tag    description: (description) @spell)
(since_tag         description: (description) @spell)
(see_tag           description: (description) @spell)

(description) @comment

; {@link …} body; after `(description) @comment` so it wins.
(inline_tag
  (tag_name) @_tag
  (description) @markup.link
  (#any-of? @_tag "@link" "@linkcode" "@linkplain"))
