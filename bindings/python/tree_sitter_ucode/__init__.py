"""Ucode grammars for tree-sitter: scripts, templates and doc comments.

- ``language_ucode()``: ucode scripts.
- ``language_ucode_markup()``: ucode templates (text with ``{% %}``, ``{{ }}``
  and ``{# #}`` tags).
- ``language_ucdocs()``: doc comments (``/** ... */``).
"""

from ._binding import language_ucdocs, language_ucode, language_ucode_markup


def _get_query(name, file):
    files = globals().get("_files")
    if files is None:
        from importlib.resources import files
        globals()["_files"] = files
    try:
        query = files(f"{__package__}") / file
        globals()[name] = query.read_text()
    except FileNotFoundError:
        globals()[name] = None
    return globals()[name]


_QUERIES = {
    "UCODE_HIGHLIGHTS_QUERY": "queries/ucode/highlights.scm",
    "UCODE_INJECTIONS_QUERY": "queries/ucode/injections.scm",
    "UCODE_LOCALS_QUERY": "queries/ucode/locals.scm",
    "UCODE_TAGS_QUERY": "queries/ucode/tags.scm",
    "UCODE_MARKUP_HIGHLIGHTS_QUERY": "queries/ucode_markup/highlights.scm",
    "UCODE_MARKUP_INJECTIONS_QUERY": "queries/ucode_markup/injections.scm",
    "UCODE_MARKUP_LOCALS_QUERY": "queries/ucode_markup/locals.scm",
    "UCODE_MARKUP_TAGS_QUERY": "queries/ucode_markup/tags.scm",
    "UCDOCS_HIGHLIGHTS_QUERY": "queries/ucdocs/highlights.scm",
    "UCDOCS_TAGS_QUERY": "queries/ucdocs/tags.scm",
}


def __getattr__(name):
    if name in _QUERIES:
        return _get_query(name, _QUERIES[name])

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "language_ucode",
    "language_ucode_markup",
    "language_ucdocs",
    *_QUERIES,
]


def __dir__():
    return sorted(__all__ + [
        "__all__", "__builtins__", "__cached__", "__doc__", "__file__",
        "__loader__", "__name__", "__package__", "__path__", "__spec__",
    ])
