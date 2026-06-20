; Inject ucdocs into JSDoc block comments (/** ... */).
((comment) @injection.content
  (#match? @injection.content "^/\\*\\*")
  (#set! injection.language "ucdocs"))
