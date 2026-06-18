(tag_name) @keyword
(param_tag "@param" @keyword)
(returns_tag ["@returns" "@return"] @keyword)
(template_tag "@template" @keyword)
(typedef_tag "@typedef" @keyword)
(type_tag "@type" @keyword)
(throws_tag ["@throws" "@throw"] @keyword)
(deprecated_tag "@deprecated" @keyword)
(since_tag "@since" @keyword)
(see_tag "@see" @keyword)
(example_tag "@example" @keyword)
(default_tag "@default" @keyword)

(type_param) @type.parameter
(type_identifier) @type
(primitive_type) @type.builtin
(any_type) @type.builtin
(module_type "module:" @module)
(module_path) @module

(identifier) @variable.parameter
(default_value) @constant
(description) @comment
(inline_tag "{" @punctuation.bracket "}" @punctuation.bracket)
(inline_tag (tag_name) @keyword)
