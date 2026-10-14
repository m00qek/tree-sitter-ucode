from typing import Final
from typing_extensions import CapsuleType

UCODE_HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for the ``ucode`` grammar."""

UCODE_INJECTIONS_QUERY: Final[str] | None
"""The language injection query for the ``ucode`` grammar."""

UCODE_LOCALS_QUERY: Final[str] | None
"""The local variable query for the ``ucode`` grammar."""

UCODE_TAGS_QUERY: Final[str] | None
"""The symbol tagging query for the ``ucode`` grammar."""

UCODE_MARKUP_HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for the ``ucode_markup`` grammar."""

UCODE_MARKUP_INJECTIONS_QUERY: Final[str] | None
"""The language injection query for the ``ucode_markup`` grammar."""

UCODE_MARKUP_LOCALS_QUERY: Final[str] | None
"""The local variable query for the ``ucode_markup`` grammar."""

UCODE_MARKUP_TAGS_QUERY: Final[str] | None
"""The symbol tagging query for the ``ucode_markup`` grammar."""

UCDOCS_HIGHLIGHTS_QUERY: Final[str] | None
"""The syntax highlighting query for the ``ucdocs`` grammar."""

UCDOCS_TAGS_QUERY: Final[str] | None
"""The symbol tagging query for the ``ucdocs`` grammar."""

def language_ucode() -> CapsuleType:
    """The tree-sitter language function for ucode scripts."""

def language_ucode_markup() -> CapsuleType:
    """The tree-sitter language function for ucode templates."""

def language_ucdocs() -> CapsuleType:
    """The tree-sitter language function for ucode doc comments."""
