(template_tag
  (type_param) @template.param)

(param_tag
  type: (_)? @param.type
  name: (_)? @param.name
  description: (description)? @param.description)

(returns_tag
  type: (type_expression) @returns.type
  description: (description)? @returns.description)

(throws_tag
  type: (type_expression)? @throws.type
  description: (description)? @throws.description)

(typedef_tag
  type: (type_expression)? @typedef.type
  name: (_)? @typedef.name
  description: (description)? @typedef.description)

(property_tag
  type: (type_expression)? @property.type
  name: (_)? @property.name
  description: (description)? @property.description)

(type_tag
  type: (type_expression) @type.type)
