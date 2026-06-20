; Inject ucdocs into JSDoc block comments (/** ... */).
; The [^*] guard excludes /*** section dividers which start with three or more stars.
((comment) @injection.content
  (#match? @injection.content "^/\\*\\*[^*]")
  (#set! injection.language "ucdocs"))
