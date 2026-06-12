; Locals for ucode_markup — scope and definition tracking across tag boundaries.
;
; The markup grammar treats the entire document as a single implicit scope:
; variables declared in one statement tag are visible in subsequent tags.
; Defer to the injected ucode grammar for fine-grained scope tracking
; within individual tags; here we only register the document-level scope.

(markup) @local.scope
