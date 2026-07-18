/*
 * Shared external-scanner implementation for ucode and ucode_markup.
 *
 * Included by src/scanner.c and markup/src/scanner.c.  Every function here
 * is static so each compilation unit gets its own copy and no ucode_*
 * symbols leak into the markup shared library.
 *
 * Token order MUST match the `externals` array in grammar.js:
 *   0  AUTOMATIC_SEMICOLON        $._automatic_semicolon
 *   1  TEMPLATE_CHARS             $._template_chars
 *   2  TERNARY_QMARK              $._ternary_qmark
 *   3  RAW_TEXT                   $.raw_text
 *   4  STATEMENT_TAG_OPEN         $.statement_tag_open         {%
 *   5  STATEMENT_TAG_TRIM_OPEN    $.statement_tag_trim_open    {%-
 *   6  STATEMENT_TAG_LSTRIP_OPEN  $.statement_tag_lstrip_open  {%+
 *   7  STATEMENT_TAG_CLOSE        $.statement_tag_close        %}
 *   8  STATEMENT_TAG_TRIM_CLOSE   $.statement_tag_trim_close   -%}
 *   9  EXPRESSION_TAG_OPEN        $.expression_tag_open        {{
 *  10  EXPRESSION_TAG_TRIM_OPEN   $.expression_tag_trim_open   {{-
 *  11  EXPRESSION_TAG_CLOSE       $.expression_tag_close       }}
 *  12  EXPRESSION_TAG_TRIM_CLOSE  $.expression_tag_trim_close  -}}
 *  13  COMMENT_CHARS              $.comment_content            {# ... #} body
 *  14  COMMENT                    $.comment                    line and block
 *  15  SINGLE_QUOTE_STRING_CONTENT $._single_quote_string_content  '...' body
 *  16  DOUBLE_QUOTE_STRING_CONTENT $._double_quote_string_content  "..." body
 *  17  REGEX_CONTENT               $._regex_content                /.../ body
 *  18  OCTAL_ESCAPE                $._octal_escape                 \NNN in a string/template
 *  19  ASI_GAP                     $._asi_gap                      zero-width no-op (extra)
 */

#ifndef UCODE_SCANNER_IMPL_H_
#define UCODE_SCANNER_IMPL_H_

#include "tree_sitter/parser.h"
#include <wctype.h>
#include <stdlib.h>   /* calloc / free for the scanner state */

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
    TERNARY_QMARK,
    RAW_TEXT,
    STATEMENT_TAG_OPEN,
    STATEMENT_TAG_TRIM_OPEN,
    STATEMENT_TAG_LSTRIP_OPEN,
    STATEMENT_TAG_CLOSE,
    STATEMENT_TAG_TRIM_CLOSE,
    EXPRESSION_TAG_OPEN,
    EXPRESSION_TAG_TRIM_OPEN,
    EXPRESSION_TAG_CLOSE,
    EXPRESSION_TAG_TRIM_CLOSE,
    COMMENT_CHARS,
    COMMENT,
    SINGLE_QUOTE_STRING_CONTENT,
    DOUBLE_QUOTE_STRING_CONTENT,
    REGEX_CONTENT,
    OCTAL_ESCAPE,
    ASI_GAP,
};

/*
 * Persistent scanner state.  A single flag, carried across exactly two
 * consecutive scans: when the ASI-before-comment path emits its zero-width
 * marker (a real ASI or a no-op ASI_GAP), it sets skip_asi_before_comment so
 * the very next scan re-scans the comment itself instead of re-deciding the
 * ASI (which would loop, and would misplace the marker).  Serialized because a
 * GLR fork between the two scans must carry the flag to each branch.
 */
typedef struct {
    bool skip_asi_before_comment;
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

/* Result of attempting to scan a tag-close marker (%} -%} }} -}}). */
typedef enum {
    TAG_CLOSE_MATCHED,   /* full marker consumed; result_symbol set */
    TAG_CLOSE_ABSENT,    /* not a close marker; nothing consumed */
    TAG_CLOSE_PARTIAL,   /* a leading '-'/'%'/'}' was consumed, then rejected */
} TagCloseResult;

/*
 * Result of automatic-semicolon scanning.  Distinguishes the two "no
 * semicolon" outcomes so the dispatcher knows whether scanning a ternary '?'
 * next is safe: after an operator was consumed the lexer is skewed past it and
 * a following ternary token would swallow it (turning invalid `a -? b : c`
 * into a clean ternary).
 */
typedef enum {
    ASI_INSERT,       /* emit a zero-length semicolon */
    ASI_TRY_TERNARY,  /* no semicolon; nothing consumed, so a ternary is safe */
    ASI_DECLINE,      /* no semicolon; an operator ('-' '%' '/') was consumed */
} AsiResult;

/* The four ECMAScript line terminators: LF, CR, and the Unicode LS / PS. */
static inline bool is_line_terminator(int32_t c) {
    return c == '\n' || c == '\r' || c == 0x2028 || c == 0x2029;
}

/*
 * Inline (non-line-terminating) whitespace: iswspace() minus the line
 * terminators, which are handled separately wherever a newline is significant
 * (ASI, block-comment newline detection).  This is the single predicate for
 * "blank that does not end a line".
 *
 * iswspace() is narrower than the grammar's `extras` regex (which also skips
 * \p{Zs}, NBSP, ZWSP, …); in the C locale it covers only ' ' \t \v \f plus the
 * terminators.  Those exotic blanks are consumed by tree-sitter's own extras
 * handling, not here — this predicate exists so scan_comment's leading skip
 * eats the ordinary blanks (space, tab, \f, \v) between a newline and the next
 * token instead of stranding the ASI decision on one of them.
 */
static inline bool is_inline_ws(int32_t c) {
    return iswspace(c) && !is_line_terminator(c);
}

/* -------------------------------------------------------------------------
 * Markup-mode tokens
 * ---------------------------------------------------------------------- */

/*
 * scan_raw_text_from(lexer, has_content)
 *
 * Core raw-text loop.  Caller sets has_content=true when it has already
 * consumed one or more characters (e.g. a lone '{' that turned out not to
 * be a tag opener) so that the scanner returns true even if no additional
 * characters follow.
 *
 * Stops BEFORE '{' that is followed by '%', '{', or '#' (tag/comment openers).
 * A lone '{' is committed on the next iteration's mark_end.
 */
static bool scan_raw_text_from(TSLexer *lexer, bool has_content) {
    lexer->result_symbol = RAW_TEXT;
    while (true) {
        lexer->mark_end(lexer);
        /* Real end-of-input ends the token; a literal NUL byte in the file is
           ordinary content (ucode accepts NUL in raw template text). */
        if (lexer->eof(lexer)) return has_content;
        if (lexer->lookahead == '{') {
            advance(lexer);
            if (lexer->lookahead == '%' ||
                lexer->lookahead == '{' ||
                lexer->lookahead == '#')
                return has_content;
        } else {
            advance(lexer);
        }
        has_content = true;
    }
}

/*
 * scan_markup(lexer, valid_symbols)
 *
 * Unified handler for all three markup-opener tokens (RAW_TEXT,
 * STATEMENT_TAG_OPEN, EXPRESSION_TAG_OPEN).  Must be called when at
 * least one of those three is valid.
 *
 * Problem with calling separate sub-scanners sequentially:
 *   scan_raw_text advances past '{' when it returns false (tag found),
 *   leaving the lexer at position+1.  Subsequent sub-scanners then see
 *   the wrong character and also fail, so the whole scanner returns false
 *   and tree-sitter falls back to the internal '{' token — which has no
 *   valid action in the markup root state and triggers error recovery.
 *
 * Fix: handle '{' atomically here.  Advance past '{' exactly once, inspect
 * the second character, then dispatch without any further position skew.
 */
static bool scan_markup(TSLexer *lexer, const bool *valid_symbols) {
    /* Not at '{': only raw text is possible. */
    if (lexer->lookahead != '{')
        return valid_symbols[RAW_TEXT] ? scan_raw_text_from(lexer, false) : false;

    /* Peek at the second character by advancing past '{'. */
    advance(lexer);

    /* {%  {%-  {%+ — statement tag open (emit the precise variant) */
    if (lexer->lookahead == '%' &&
        (valid_symbols[STATEMENT_TAG_OPEN] ||
         valid_symbols[STATEMENT_TAG_TRIM_OPEN] ||
         valid_symbols[STATEMENT_TAG_LSTRIP_OPEN])) {
        advance(lexer);
        if (lexer->lookahead == '-') {
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = STATEMENT_TAG_TRIM_OPEN;
            return true;
        }
        if (lexer->lookahead == '+') {
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = STATEMENT_TAG_LSTRIP_OPEN;
            return true;
        }
        lexer->mark_end(lexer);
        lexer->result_symbol = STATEMENT_TAG_OPEN;
        return true;
    }

    /* {{  {{- — expression tag open (emit the precise variant) */
    if (lexer->lookahead == '{' &&
        (valid_symbols[EXPRESSION_TAG_OPEN] || valid_symbols[EXPRESSION_TAG_TRIM_OPEN])) {
        advance(lexer);
        if (lexer->lookahead == '-') {
            advance(lexer);
            lexer->mark_end(lexer);
            lexer->result_symbol = EXPRESSION_TAG_TRIM_OPEN;
            return true;
        }
        lexer->mark_end(lexer);
        lexer->result_symbol = EXPRESSION_TAG_OPEN;
        return true;
    }

    /* {#  {#- — comment tag; let the internal lexer match the literal '{#'. */
    if (lexer->lookahead == '#') return false;

    /* '{' followed by anything else: include it in raw text. */
    return valid_symbols[RAW_TEXT] ? scan_raw_text_from(lexer, true) : false;
}


/*
 * Scan a tag close: mid}  -mid}  (mid is '%' for a statement tag, '}' for an
 * expression tag). No leading-whitespace skip: scan_comment is dispatched
 * first (COMMENT is a valid extra in every state this runs in) and has
 * already consumed any whitespace and line terminators, so the lexer sits on
 * the marker char.
 */
static TagCloseResult scan_tag_close(
    TSLexer *lexer, int32_t mid, enum TokenType plain, enum TokenType trim
) {
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != mid) return TAG_CLOSE_PARTIAL;
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = trim;
        return TAG_CLOSE_MATCHED;
    }
    if (lexer->lookahead == mid) {
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = plain;
        return TAG_CLOSE_MATCHED;
    }
    return TAG_CLOSE_ABSENT;
}

static TagCloseResult scan_statement_tag_close(TSLexer *lexer) {
    return scan_tag_close(lexer, '%', STATEMENT_TAG_CLOSE, STATEMENT_TAG_TRIM_CLOSE);
}

static TagCloseResult scan_expression_tag_close(TSLexer *lexer) {
    return scan_tag_close(lexer, '}', EXPRESSION_TAG_CLOSE, EXPRESSION_TAG_TRIM_CLOSE);
}

/*
 * Scan the body of a {# ... #} comment: everything up to, but not including,
 * the first #} or -#} close marker.  A regex cannot express this — maximal
 * munch would consume the '#' that begins the terminator (e.g. the second '#'
 * of `{# x##}`), and tree-sitter regexes have no look-ahead — so the boundary
 * is found here by look-ahead.
 *
 * mark_end() is set at the start of each iteration, so when a close marker is
 * detected the characters already advanced past ('#' or '-#') fall outside the
 * token; the lexer resumes at mark_end and the internal lexer matches #}/-#}.
 * Returns false on an empty body (immediate close), leaving comment_content
 * unmatched (it is optional in the grammar).
 */
static bool scan_comment_chars(TSLexer *lexer) {
    lexer->result_symbol = COMMENT_CHARS;
    bool has_content = false;
    for (;;) {
        lexer->mark_end(lexer);
        if (lexer->eof(lexer)) return has_content; /* EOF: close is missing */
        /* A literal NUL is ordinary comment content (ucode accepts it). */

        if (lexer->lookahead == '#') {
            advance(lexer);
            if (lexer->lookahead == '}') return has_content; /* #} ahead */
            has_content = true;                              /* '#' was content */
            continue;
        }
        if (lexer->lookahead == '-') {
            advance(lexer);
            if (lexer->lookahead == '#') {
                advance(lexer);
                if (lexer->lookahead == '}') return has_content; /* -#} ahead */
                has_content = true;                              /* '-#' was content */
                continue;
            }
            has_content = true;                                  /* '-' was content */
            continue;
        }

        advance(lexer);
        has_content = true;
    }
}

/* -------------------------------------------------------------------------
 * Code-mode tokens (carried over and extended from the original scanner)
 * ---------------------------------------------------------------------- */

static bool scan_template_chars(TSLexer *lexer) {
    lexer->result_symbol = TEMPLATE_CHARS;
    for (bool has_content = false;; has_content = true) {
        lexer->mark_end(lexer);
        /* Real end-of-input leaves the template unterminated (discard, matching
           tree-sitter-javascript). A literal NUL byte is ordinary content —
           ucode accepts NUL inside a template string. */
        if (lexer->eof(lexer)) return false;
        switch (lexer->lookahead) {
            case '`': return has_content;
            case '$':
                advance(lexer);
                if (lexer->lookahead == '{') return has_content;
                break;
            case '\\': return has_content;
            default: advance(lexer);
        }
    }
}

/*
 * Body of a single- or double-quoted string, up to the closing quote or a
 * backslash (start of an escape_sequence).  Unlike JavaScript, ucode strings
 * MAY span raw line terminators: lexer.c parse_string has no newline handling,
 * so a bare LF/CR is ordinary content and only EOF (a missing closing quote)
 * makes a string unterminated.  We therefore keep '\r'/'\n' as content and,
 * mirroring scan_template_chars, return false at EOF: discarding the token on a
 * missing quote lets the parser recover statement-by-statement instead of
 * swallowing the rest of the file into one string.
 *
 * Dispatched as an external token BEFORE the COMMENT scanner so a string
 * starting with `/*` or `//` (e.g. the glob `'/*.uc'`) is kept as string
 * content instead of being lexed as a comment.  A literal NUL is ordinary
 * content (ucode allows it in strings).
 *
 * Cost note (accepted): return-false-at-EOF means an UNTERMINATED string is
 * rescanned to end-of-file on every keystroke while it is open, because the
 * discarded token leaves no reusable subtree.  This was benchmarked as a
 * linear ~0.06 ms per KB of file tail on incremental reparse — below the
 * measurement noise floor at realistic ucode file sizes (<1 ms up to ~15 KB),
 * transient (only while the quote is unbalanced), and the same behaviour
 * backtick templates have always had.  The alternatives (mark_end at the last
 * newline, return has_content) are cheaper but swallow the file tail into the
 * string, reversing the statement-by-statement recovery this false-at-EOF
 * return deliberately buys.  Recovery quality wins; the cost is a non-issue.
 */
static bool scan_string_chars(TSLexer *lexer, int32_t quote, enum TokenType sym) {
    lexer->result_symbol = sym;
    bool has_content = false;
    for (;;) {
        /* The terminator/EOF check below always runs before any advance() past
           it, so no committed character is ever advanced past — one mark_end()
           right at each return is enough, instead of one per character. */
        if (lexer->eof(lexer)) {
            lexer->mark_end(lexer);
            return false;
        }
        int32_t c = lexer->lookahead;
        if (c == quote || c == '\\') {
            lexer->mark_end(lexer);
            return has_content;
        }
        advance(lexer);
        has_content = true;
    }
}

/* Consume a backslash escape (the '\' plus the escaped char).  Returns false on
   a trailing '\' at EOF, which makes the surrounding literal unterminated. */
static inline bool regex_consume_escape(TSLexer *lexer) {
    advance(lexer); /* the backslash */
    if (lexer->eof(lexer)) return false;
    advance(lexer); /* the escaped char (any char, incl. newline) */
    return true;
}

/*
 * Body of a regex literal, up to the closing '/' delimiter (external token
 * REGEX_CONTENT).  ucode lexes regexes with parse_string(lex, '/') — the SAME
 * routine as strings (lexer.c parse_regexp) — so, exactly like scan_string_chars:
 * raw newlines are ordinary content, and only EOF makes the literal
 * unterminated.  Returning false at EOF discards the run so the parser recovers
 * statement-by-statement instead of swallowing the file tail (a greedy grammar
 * token could not do this — the reason regex moved into the scanner; see the
 * regex rule in grammar.js).
 *
 * A regex additionally has character-class structure a plain string lacks
 * (parse_string only applies it when the delimiter is '/'): inside `[ ... ]`,
 * '/' and newlines are literal, an optional leading '^' and a leading ']' are
 * literal members (`[]…]`, `[^]…]` do not close at the first ']'), and nested
 * POSIX / collating / equivalence sub-expressions ([:name:] [.coll.] [=eq=])
 * keep their inner ']' from closing the class.  We stop just before the closing
 * '/', leaving it for the grammar (like scan_string_chars leaves the quote).
 *
 * An empty pattern is impossible here: `//` is a line comment, dispatched by
 * scan_comment before REGEX_CONTENT is offered.  We still require at least one
 * content char (return false on a leading '/') so the grammar never accepts an
 * empty regex.
 */
static bool scan_regex_content(TSLexer *lexer) {
    lexer->result_symbol = REGEX_CONTENT;
    bool has_content = false;
    for (;;) {
        /* Same reasoning as scan_string_chars: the terminator check below
           always runs before advancing past it, so mark_end() is only needed
           right at the two returns here, not once per outer-loop iteration
           (the '[' branch's own EOF returns need none — they discard). */
        if (lexer->eof(lexer)) {
            lexer->mark_end(lexer);
            return false;
        }
        int32_t c = lexer->lookahead;
        if (c == '/') {
            lexer->mark_end(lexer);
            return has_content;
        }
        if (c == '\\') {
            if (!regex_consume_escape(lexer)) return false;
            has_content = true;
            continue;
        }
        if (c == '[') {
            advance(lexer);
            has_content = true;
            if (lexer->lookahead == '^') advance(lexer);
            if (lexer->lookahead == ']') advance(lexer); /* literal leading ']' */
            for (;;) { /* read up to the closing ']' */
                if (lexer->eof(lexer)) return false;
                int32_t d = lexer->lookahead;
                if (d == '\\') {
                    if (!regex_consume_escape(lexer)) return false;
                    continue;
                }
                advance(lexer);
                if (d == ']') break;
                if (d == '[') { /* nested [:name:] / [.coll.] / [=eq=] */
                    int32_t kind = lexer->lookahead;
                    if (kind == ':' || kind == '.' || kind == '=') {
                        advance(lexer); /* the kind char */
                        for (;;) { /* read up to the matching kind + ']' */
                            if (lexer->eof(lexer)) return false;
                            int32_t e = lexer->lookahead;
                            if (e == '\\') {
                                if (!regex_consume_escape(lexer)) return false;
                                continue;
                            }
                            advance(lexer);
                            if (e == kind && lexer->lookahead == ']') {
                                advance(lexer);
                                break;
                            }
                        }
                    }
                }
            }
            continue;
        }
        advance(lexer); /* ordinary content, including raw newlines */
        has_content = true;
    }
}

/*
 * Octal escape sequence in a string/template literal: '\' followed by 1-3
 * octal digits, e.g. \0, \40, \377.  ucode's lexer (lexer.c parse_escape)
 * greedily consumes up to 3 octal digits like any grammar regex would, but
 * then range-checks the resulting value and rejects it ("Invalid escape
 * sequence") if it exceeds 255 (\377) — a check no regex can express, since
 * regex/token matching is maximal-munch: a pattern like [0-3][0-7]{2}|[0-7]{1,2}
 * does not reject "\777", it just matches the shorter "\77" and lets the
 * remaining '7' be silently absorbed as ordinary string content (verified:
 * produces a clean tree, no ERROR, just the wrong split). Only a scan
 * function that computes the value and can refuse to produce a token at all
 * — leaving nothing else able to start at the '\' — gets a real rejection.
 *
 * Aliased back to escape_sequence in grammar.js (like REGEX_CONTENT is
 * aliased to regex_pattern) so the tree is unchanged for every valid case;
 * escape_sequence's own regex no longer has an octal branch, so this is the
 * only path for '\' followed by an octal digit.
 */
static bool scan_octal_escape(TSLexer *lexer) {
    if (lexer->lookahead != '\\') return false;
    advance(lexer);

    int code = 0, i;
    for (i = 0; i < 3 && lexer->lookahead >= '0' && lexer->lookahead <= '7'; i++) {
        code = code * 8 + (lexer->lookahead - '0');
        advance(lexer);
    }

    if (i == 0 || code > 255) return false;

    lexer->mark_end(lexer);
    lexer->result_symbol = OCTAL_ESCAPE;
    return true;
}

/*
 * Return true if the lookahead is the start of %} or -%} (statement tag
 * close).  Used during ASI scanning to allow a zero-length semicolon to be
 * inserted immediately before the tag close without consuming any characters.
 */
static bool lookahead_is_stmt_close(TSLexer *lexer) {
    if (lexer->lookahead == '%') {
        advance(lexer);
        return lexer->lookahead == '}';
    }
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead == '%') {
            advance(lexer);
            return lexer->lookahead == '}';
        }
    }
    return false;
}

/*
 * ASI decision when the pending token is '-' or '%'.  Shared by both the
 * same-line and post-newline paths: '-'/'%' begins a statement-tag close
 * (%} / -%}) → insert the zero-length ';'; otherwise it is a binary operator
 * continuing the expression, and lookahead_is_stmt_close has consumed it, so
 * DECLINE (a ternary here would swallow the operator, e.g. `a -? b : c`, which
 * ucode rejects).
 */
static AsiResult asi_dash_or_percent(TSLexer *lexer) {
    return lookahead_is_stmt_close(lexer) ? ASI_INSERT : ASI_DECLINE;
}

/*
 * Return true if the lookahead is the keyword `in` at a word boundary, not a
 * prefix of a longer identifier (`intval`).  `in` is ucode's only keyword
 * binary operator (there is no `instanceof`), so it must decline ASI like any
 * other continuation token: `let x = y\nin [1, 2];` is valid ucode and must
 * not be split into two statements.  mark_end was already called at the top
 * of the caller, so peeking ahead with advance() here does not consume
 * characters from the (zero-length) semicolon token, exactly as
 * lookahead_is_stmt_close does above.
 */
static bool lookahead_is_in_keyword(TSLexer *lexer) {
    if (lexer->lookahead != 'i') return false;
    advance(lexer);
    if (lexer->lookahead != 'n') return false;
    advance(lexer);

    int32_t c = lexer->lookahead;
    bool is_ident_cont = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                          (c >= '0' && c <= '9') || c == '_';
    return !is_ident_cont;
}

/*
 * Automatic Semicolon Insertion (ECMA-262 §12.10).
 *
 * NOTE: This is intentionally MORE lenient than the ucode compiler.  ucode only
 * lets a statement omit its terminating ';' immediately before '}', EOF, a tag
 * close (%} / -%}), or an alt-syntax end keyword (endif/endfor/endwhile/
 * endfunction/elif/else); it rejects a bare newline between two statements
 * (`x = 1\ny = 2`).  We keep full ECMAScript-style ASI here on purpose so that
 * incomplete, mid-edit code is not aggressively flagged as an error in editors.
 * See test/corpus and README for the (deliberate) divergence.
 *
 * Extended to allow ASI immediately before %} and -%} so that the last
 * statement in a statement tag does not need an explicit trailing semicolon:
 *   {% let x = 1 %}      — works without a semicolon
 *   {% return val %}     — works without a semicolon
 *
 * The tag-close characters are never consumed; mark_end stays at position 0,
 * so the zero-length semicolon token is emitted and the scanner is called
 * again immediately at the same position for STATEMENT_TAG_CLOSE.
 */
/*
 * Same-line ASI decision from the current lookahead — no mark_end / result_symbol
 * side effects, so it can be reused both by scan_automatic_semicolon (which sets
 * up the zero-length token first) and by the ASI-before-comment peek, which
 * decides while positioned past a comment and rewinds via a held mark_end.
 */
static AsiResult asi_same_line_decision(TSLexer *lexer) {
    /* ECMAScript rule 1 ('}') and rule 3 (EOF): insert. */
    if (lexer->lookahead == '}' || lexer->lookahead == 0)
        return ASI_INSERT;

    /* Ucode extension: %} / -%} closing a statement tag → insert (see
       asi_dash_or_percent). */
    if (lexer->lookahead == '%' || lexer->lookahead == '-')
        return asi_dash_or_percent(lexer);

    /* Any other token on the same line: no line terminator precedes it, so no
       ASI.  Nothing was consumed, so a ternary '?' here is safe (`a ? b : c`). */
    return ASI_TRY_TERNARY;
}

static AsiResult scan_automatic_semicolon(TSLexer *lexer) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

    /*
     * scan_comment() is dispatched before ASI (see ucode_scanner_scan) and is
     * valid wherever ASI is, so by the time we reach here it has already skipped
     * all inline whitespace, line terminators and comments.  When it crossed a
     * line terminator it returns CMT_NONE_NEWLINE and asi_after_newline() makes
     * the post-newline decision, so ucode_scanner_scan returns before this
     * function runs.  So this is reached ONLY in the same-line case, with the
     * lexer sitting on the next real (non-whitespace, non-'/') token — a
     * same-line token never triggers ASI except at the boundaries below.
     */
    return asi_same_line_decision(lexer);
}

/*
 * Post-newline ASI decision from the current lookahead — the mark-free core of
 * asi_after_newline, likewise reused by the ASI-before-comment peek.  This is
 * the single authoritative post-newline continuation list; `in` (checked in the
 * default arm via lookahead_is_in_keyword) is the one continuation token that
 * isn't punctuation.
 */
static AsiResult asi_after_newline_decision(TSLexer *lexer) {
    switch (lexer->lookahead) {
        case '(': case '[': case '`':
        case '.': case ',': case ';':
        case '+': case '*':
        case '=': case '<': case '>': case '!': case '~':
        case '&': case '|': case '^': case '?':
            /* Continuation token; nothing consumed, so a ternary '?' here is
               safe (e.g. `a\n// c\n? b : c`). */
            return ASI_TRY_TERNARY;
        case '-':
        case '%':
            return asi_dash_or_percent(lexer);
        default:
            /* `in` continues the expression (`y\nin [1, 2]`); anything else
               is '}', EOF, or the start of a new statement → insert. */
            if (lookahead_is_in_keyword(lexer)) return ASI_DECLINE;
            return ASI_INSERT;
    }
}

/*
 * ASI decision when a line terminator has ALREADY been consumed — scan_comment
 * skips newlines to reach a possible following-line comment, and when it finds
 * none it reports crossed_newline and leaves the lexer at the next real token.
 * Decide purely from that token: there is no more whitespace or comment to skip
 * (scan_comment stopped at the first non-whitespace char, and a comment there
 * would have been emitted as its own token).
 */
static AsiResult asi_after_newline(TSLexer *lexer) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);
    return asi_after_newline_decision(lexer);
}

static bool scan_ternary_qmark(TSLexer *lexer) {
    if (lexer->lookahead != '?') return false;
    advance(lexer);

    if (lexer->lookahead == '?') return false; /* nullish coalescing */

    lexer->mark_end(lexer);
    lexer->result_symbol = TERNARY_QMARK;

    if (lexer->lookahead == '.') {
        advance(lexer);
        return iswdigit(lexer->lookahead); /* ?. followed by digit is ternary */
    }

    return true;
}

/*
 * Turn an ASI decision into the scanner's return value.  Both the same-line
 * (scan_automatic_semicolon) and post-newline (asi_after_newline) paths end the
 * same way: INSERT emits the zero-length ';', TRY_TERNARY re-reads the stop char
 * as a ternary '?' when one is valid, and DECLINE returns false (an operator was
 * consumed, so re-lex it).
 */
static bool dispatch_asi(AsiResult result, TSLexer *lexer,
                         const bool *valid_symbols) {
    switch (result) {
        case ASI_INSERT:      return true;
        case ASI_TRY_TERNARY: return valid_symbols[TERNARY_QMARK] && scan_ternary_qmark(lexer);
        case ASI_DECLINE:     return false;
    }
    return false; /* unreachable: switch is exhaustive over AsiResult */
}

/*
 * Line comments (slash-slash) and block comments (slash-star ... star-slash).
 *
 * Line comments run to the end of the line (or EOF), matching ucode's lexer
 * exactly — including inside a markup statement tag, where a same-line `%}` is
 * swallowed as comment content rather than closing the tag.  So
 * `{% x = 1; // note %}` on one line leaves the tag unterminated (an ERROR),
 * just as ucode swallows the `%}`; the common multi-line style (comment on its
 * own line, `%}` on the next) is unaffected.
 *
 * The return distinguishes four outcomes because the '/' is ambiguous and the
 * scanner cannot un-consume it once advanced past:
 *   CMT_FOUND        — a comment was scanned; emit the COMMENT token.
 *   CMT_ABORT        — a '/' was consumed but it starts a division / regex, not
 *                a comment.  The dispatcher must return false from the WHOLE
 *                scanner so tree-sitter discards the consumed '/' and re-lexes
 *                it from the original position (as division or a regex).  This
 *                mirrors ASI's own division-slash DECLINE and is what keeps
 *                `a /? b : c` an ERROR rather than a swallowed ternary.
 *   CMT_NONE        — no comment and no line terminator was crossed (only inline
 *                whitespace was skipped); the dispatcher may safely fall through
 *                to the tag-close / ASI / ternary scanners.
 *   CMT_NONE_NEWLINE — no comment, but a line terminator WAS skipped to reach the
 *                current token.  The dispatcher runs asi_after_newline (when ASI
 *                is valid) because the consumed newline is the one lenient
 *                inter-statement ASI relies on.
 */
typedef enum { CMT_NONE, CMT_NONE_NEWLINE, CMT_FOUND, CMT_ABORT } CommentResult;

/*
 * Decide the preceding statement's ASI BEFORE an own-line comment is emitted.
 *
 * A comment is an external `extra`, dispatched ahead of ASI, so once a line
 * terminator has been crossed and the next thing is a comment, the naive flow
 * emits the comment first and only decides ASI at the token after it — which
 * lands the comment INSIDE the still-open preceding statement.  For a statement
 * ended by a brace (most visibly `function f() {}` with no explicit `;`) that
 * misplaces a following doc comment inside the function body instead of at the
 * outer level, breaking doc-to-next-declaration association.  (This was correct
 * before comments became an external token; the token order flipped.)
 *
 * We restore the [ASI, comment] order without un-scanning the comment (mark_end
 * cannot move backwards): peek PAST this comment and any further own-line
 * comments to the next real token, decide, and emit a ZERO-WIDTH token at the
 * ENTRY position (right after the preceding token, before the newline — the
 * same position ASI used before comments went external, which is why a brace-
 * terminated statement like `function f(){}` reduces there instead of absorbing
 * the comment) — a real AUTOMATIC_SEMICOLON when the next token starts a new
 * statement (INSERT: closes the statement, so the comment attaches at the outer
 * level), or a no-op ASI_GAP when the next token continues the expression
 * (`a\n// c\n.b`: the statement stays open, so the comment attaches to the
 * continuation, exactly as before).  Either way the comment itself is scanned
 * on the NEXT call.
 *
 * Returns true iff it emitted a real ASI (INSERT), false for a no-op ASI_GAP.
 * The caller uses this to gate Scanner.skip_asi_before_comment: only the GAP
 * (decline) case needs it, because there the statement stays open and ASI is
 * still valid next call — without the flag this path would re-trigger and loop.
 * The INSERT case needs no flag: the emitted ASI closes the statement, so ASI
 * is no longer valid next call and the path is not re-taken; forcing the flag
 * there instead makes the follow-up comment attach inside a not-yet-reduced
 * declaration (the `function f(){}` case).
 *
 * Contract: mark_end is set at the ENTRY position; the caller has advanced past
 * the comment's '/', so lookahead is its second char ('/' or '*').  This
 * function only advance()s (never mark_end), so the emitted token stays
 * zero-width at entry.
 */
static bool scan_asi_before_comment(TSLexer *lexer) {
    bool newline_before_next = true;  /* a newline precedes this first comment */

    for (;;) {
        /* Consume the rest of this comment (lookahead is '/' or '*'). */
        if (lexer->lookahead == '/') {
            advance(lexer);
            while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead))
                advance(lexer);
        } else {  /* '*' — block comment */
            advance(lexer);
            if (lexer->lookahead == '/') {
                advance(lexer);  /* slash-star-slash is a complete empty comment */
            } else {
                bool closed = false;
                while (!lexer->eof(lexer)) {
                    if (lexer->lookahead == '*') {
                        advance(lexer);
                        if (lexer->lookahead == '/') { advance(lexer); closed = true; break; }
                    } else {
                        advance(lexer);
                    }
                }
                if (!closed) {
                    /* Unterminated block comment: an ERROR either way.  Emit the
                       gap and let the next call re-scan — scan_comment then hits
                       EOF and returns CMT_ABORT, so the parser errors as it does
                       without this path. */
                    lexer->result_symbol = ASI_GAP;
                    return false;
                }
            }
        }

        /* Skip whitespace and line terminators after the comment. */
        newline_before_next = false;
        for (;;) {
            while (is_inline_ws(lexer->lookahead)) advance(lexer);
            if (is_line_terminator(lexer->lookahead)) {
                newline_before_next = true;
                advance(lexer);
                continue;
            }
            break;
        }

        /* Another comment?  Classify a leading '/'. */
        if (lexer->lookahead != '/') break;
        advance(lexer);  /* consume the '/'; loop top handles the second char */
        if (lexer->lookahead == '/' || lexer->lookahead == '*')
            continue;
        /* A '/' that is not a comment is division/regex — the next real token,
           which continues the expression → decline. */
        lexer->result_symbol = ASI_GAP;
        return false;
    }

    /* At the next real token.  A newline before it uses the post-newline
       continuation list; same line uses the (stricter) same-line rules — which
       keeps a block comment whose own closing line carries the next statement
       an error, matching ucode, while allowing ASI before a `%}` on the
       comment's own line. */
    AsiResult r = newline_before_next
        ? asi_after_newline_decision(lexer)
        : asi_same_line_decision(lexer);
    lexer->result_symbol = (r == ASI_INSERT) ? AUTOMATIC_SEMICOLON : ASI_GAP;
    return r == ASI_INSERT;
}

static CommentResult scan_comment(TSLexer *lexer, Scanner *state,
                                  bool asi_valid, bool gap_valid) {
    bool crossed_newline = false;

    /* The previous scan emitted an ASI/ASI_GAP marker before this comment (see
       scan_asi_before_comment); this call re-scans the comment itself.  Consume
       the flag and take the normal path below, not the ASI-before-comment one. */
    bool suppress_asi_before_comment = state->skip_asi_before_comment;
    state->skip_asi_before_comment = false;

    /* Mark the ENTRY position (before any leading whitespace/newline is skipped)
       so the ASI-before-comment path can emit its zero-width marker here — the
       position ASI occupied before comments became an external token. */
    lexer->mark_end(lexer);
    /* Skip leading inline whitespace to reach a comment.  tree-sitter calls the
       scanner at the whitespace before the comment and will not re-invoke it
       after lexing that whitespace internally, so a comment reached only across
       whitespace would otherwise be lexed as division or a regex.  is_inline_ws
       matches everything the grammar's `extras` treat as whitespace except line
       terminators, so exotic blanks (form feed, vertical tab, NBSP, …) between a
       newline and the next token are consumed here rather than derailing the ASI
       decision that follows.
       Line terminators need care: skipping one destroys the newline that
       lenient inter-statement ASI relies on.  We cannot defer to ASI (leave the
       newline unconsumed).  Instead we skip the newline ourselves but report
       that we crossed one: when NO comment follows, we return CMT_NONE_NEWLINE
       and the dispatcher runs asi_after_newline at the next token; when a
       comment DOES follow, the ASI-before-comment path below decides the
       preceding statement's ASI first (emitting a zero-width marker at the
       entry position) so the comment lands after any inserted ';'. */
    for (;;) {
        while (is_inline_ws(lexer->lookahead))
            skip(lexer);
        if (is_line_terminator(lexer->lookahead)) {
            crossed_newline = true;
            skip(lexer);
            continue;
        }
        break;
    }
    if (lexer->lookahead != '/')
        return crossed_newline ? CMT_NONE_NEWLINE : CMT_NONE;

    /* ASI-before-comment: when a line terminator was crossed and both ASI and
       the ASI_GAP marker are valid here (and this is not the follow-up re-scan),
       decide the preceding statement's ASI before this comment is emitted (see
       scan_asi_before_comment).  mark_end is already at the entry position;
       advance past the '/' to classify, and hand off only if a comment actually
       follows.  A lone '/' (division/regex after a newline) falls through to the
       normal handling below, which returns CMT_ABORT. */
    bool advanced_slash = false;
    if (crossed_newline && asi_valid && gap_valid && !suppress_asi_before_comment) {
        advance(lexer);
        advanced_slash = true;
        if (lexer->lookahead == '/' || lexer->lookahead == '*') {
            bool inserted = scan_asi_before_comment(lexer);
            /* Only the GAP (decline) case needs the follow-up flag; see the
               note on scan_asi_before_comment.  INSERT reduces the statement,
               so ASI is no longer valid next call and the path self-limits. */
            state->skip_asi_before_comment = !inserted;
            return CMT_FOUND;
        }
    }
    if (!advanced_slash)
        advance(lexer);

    if (lexer->lookahead == '/') {
        advance(lexer);
        lexer->result_symbol = COMMENT;
        /* A line comment runs to the end of the line (or EOF), exactly like
           ucode's lexer.  It does NOT stop at a `%}` / `-%}` tag close: ucode
           swallows a same-line close into the comment, so the statement tag
           stays open until a later `%}` (or EOF).  Modelling that faithfully
           means a lone single-line `{% … // c %}` is an unterminated tag (an
           ERROR) rather than silently pretending the swallowed `%}` closed it,
           and a `%}` sitting in the text of a `//` line inside a multi-line tag
           is comment content — the code after it still parses as code. */
        for (;;) {
            lexer->mark_end(lexer);
            if (lexer->eof(lexer) || is_line_terminator(lexer->lookahead))
                return CMT_FOUND;
            advance(lexer);
        }
    }

    if (lexer->lookahead == '*') {
        advance(lexer);
        lexer->result_symbol = COMMENT;
        /* ucode quirk (lexer.c parse_comment): the block opener is scanned by
           peeking the '*' without consuming it, so the opening '*' also counts
           as a potential closing '*'.  A '/' immediately after `/*` therefore
           closes an empty comment — `/`+`*`+`/` is complete, not an unterminated
           opener.  (`/* /` with anything between the stars is still open.) */
        if (lexer->lookahead == '/') {
            advance(lexer);
            lexer->mark_end(lexer);
            return CMT_FOUND;
        }
        for (;;) {
            /* EOF before a closing star-slash: ucode rejects an unterminated
               block comment ("Unterminated comment").  Abort so the whole
               scanner returns false and the parser reports an ERROR rather than
               accepting the run as a valid comment.  (If the unterminated run
               contains a '/', tree-sitter may re-lex the leading '/' as a regex
               and still accept it — a lenient-regex artifact present since the
               comment was an internal token; the common `/* note<EOF>` case
               errors as ucode does.) */
            if (lexer->eof(lexer)) return CMT_ABORT;
            if (lexer->lookahead == '*') {
                advance(lexer);
                if (lexer->lookahead == '/') {
                    advance(lexer);
                    lexer->mark_end(lexer);
                    return CMT_FOUND;
                }
            } else {
                advance(lexer);
            }
        }
    }

    return CMT_ABORT;  /* consumed a lone '/': division or regex, re-lex it */
}

/* -------------------------------------------------------------------------
 * Main dispatch
 * ---------------------------------------------------------------------- */

static bool ucode_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    Scanner *state = (Scanner *)payload;

    /*
     * Error-recovery guard.
     *
     * During error recovery tree-sitter sets every external token valid at
     * once.  AUTOMATIC_SEMICOLON (code context) and RAW_TEXT (markup context)
     * are never simultaneously valid in a normal parse, so their co-presence
     * signals error recovery.  Return false so the parser uses its own grammar
     * tokens for recovery instead of the scanner consuming raw_text.
     */
    if (valid_symbols[AUTOMATIC_SEMICOLON] && valid_symbols[RAW_TEXT])
        return false;

    /*
     * Template chars: only when we are unambiguously inside a template
     * literal body. Outside the all-valid recovery state just handled above,
     * TEMPLATE_CHARS and AUTOMATIC_SEMICOLON are never simultaneously valid
     * (confirmed in the generated ts_external_scanner_states of both
     * parsers), so no separate guard against a competing ASI decision is
     * needed here.
     *
     * Like the string-content dispatches below, this must NOT return
     * unconditionally: scan_template_chars declines (returns false) right at
     * a '\\', and OCTAL_ESCAPE is valid at that exact same position (a
     * template_string's repeat(choice(...)) includes the aliased octal
     * escape too) — an unconditional return would hand back that false
     * result immediately and never give OCTAL_ESCAPE a chance to run.
     */
    if (valid_symbols[TEMPLATE_CHARS] && scan_template_chars(lexer))
        return true;

    /*
     * Quoted-string body: only inside a '...' / "..." literal. Dispatched here,
     * ahead of COMMENT, so that a `/*` or `//` at the start of the string (or
     * right after an escape) is kept as content instead of being lexed as a
     * comment (the `comment` extra is otherwise offered even inside strings).
     * Same non-overlap with AUTOMATIC_SEMICOLON as TEMPLATE_CHARS above.
     *
     * String content and the octal escape below are both valid at the exact
     * same position right after the opening quote (or after a preceding
     * fragment/escape) — scan_string_chars declines there (lookahead is the
     * quote or a backslash), so it must NOT `return` unconditionally: doing
     * so would hand back its false result immediately and never give
     * OCTAL_ESCAPE a chance to run at all. Only return on success; fall
     * through to try the next external token otherwise.
     */
    if (valid_symbols[SINGLE_QUOTE_STRING_CONTENT] &&
        scan_string_chars(lexer, '\'', SINGLE_QUOTE_STRING_CONTENT))
        return true;
    if (valid_symbols[DOUBLE_QUOTE_STRING_CONTENT] &&
        scan_string_chars(lexer, '"', DOUBLE_QUOTE_STRING_CONTENT))
        return true;

    /*
     * Octal escape (\NNN) inside a string/template: only valid wherever
     * escape_sequence itself is (aliased back to it — see scan_octal_escape).
     * A '\' followed by a non-octal-digit, or an in-range value, falls
     * through to escape_sequence's own regex; an out-of-range value (> 255)
     * returns false here with nothing else able to match, forcing an ERROR.
     */
    if (valid_symbols[OCTAL_ESCAPE] && scan_octal_escape(lexer))
        return true;

    /*
     * Regex body: only inside a `/ ... /` literal, dispatched like the string
     * bodies above (and ahead of COMMENT so a `/` opening a regex is not lexed
     * as a comment/division). Same non-overlap with AUTOMATIC_SEMICOLON.
     */
    if (valid_symbols[REGEX_CONTENT])
        return scan_regex_content(lexer);

    /*
     * Comment body: only valid inside {# ... #}, where no other external token
     * competes.  Scans up to the #}/-#} close marker.
     */
    if (valid_symbols[COMMENT_CHARS])
        return scan_comment_chars(lexer);

    /*
     * Markup-mode tokens.
     *
     * All three markup openers are dispatched through scan_markup(), which
     * handles the '{' character atomically — advancing past it once and then
     * inspecting the second character — to avoid the position-skew bug that
     * arises when sequential sub-scanners each try to advance past '{'.
     */
    if (valid_symbols[RAW_TEXT] ||
        valid_symbols[STATEMENT_TAG_OPEN] ||
        valid_symbols[STATEMENT_TAG_TRIM_OPEN] ||
        valid_symbols[STATEMENT_TAG_LSTRIP_OPEN] ||
        valid_symbols[EXPRESSION_TAG_OPEN] ||
        valid_symbols[EXPRESSION_TAG_TRIM_OPEN]) {
        if (scan_markup(lexer, valid_symbols)) return true;
    }

    /*
     * Comments.  Run before the tag-close / ASI / ternary scanners so a comment
     * is emitted as its own token instead of being silently skipped by those
     * scanners' comment-skipping (e.g. a `//` line comment sitting between a
     * ternary condition and its `?`).  Run after the markup block so a `//` in
     * raw template text stays raw_text (COMMENT is not valid there anyway).
     * CMT_ABORT means a '/' was consumed that is really division/regex: return
     * false so tree-sitter re-lexes it from the original position.
     */
    bool crossed_newline = false;
    if (valid_symbols[COMMENT]) {
        switch (scan_comment(lexer, state, valid_symbols[AUTOMATIC_SEMICOLON], valid_symbols[ASI_GAP])) {
            case CMT_FOUND:        return true;
            case CMT_ABORT:        return false;
            case CMT_NONE_NEWLINE: crossed_newline = valid_symbols[AUTOMATIC_SEMICOLON]; break;
            case CMT_NONE:         break;
        }
    }

    /*
     * scan_comment skipped a line terminator while ASI was valid and found no
     * following-line comment: the newline it consumed is exactly the one ASI
     * needs.  Decide the insertion at the token it stopped on.  This handles
     * both bare-newline ASI (`x = 1\ny = 2`) and a continuation token reached
     * across a comment (`a\n// c\n.b`, which ucode accepts — the '.' declines
     * insertion so the member access still attaches).
     */
    if (crossed_newline)
        return dispatch_asi(asi_after_newline(lexer), lexer, valid_symbols);

    /*
     * Tag close tokens.  Checked before ASI so that %} / -%} / }} / -}}
     * are preferred over a zero-length semicolon when both are valid.
     *
     * TAG_CLOSE_PARTIAL means a leading '-'/'%'/'}' was consumed and then
     * rejected (it is really an operator).  We must NOT fall through to the
     * ternary scan afterwards: the lexer is skewed past that operator and a
     * TERNARY_QMARK token would swallow it (turning invalid `{{ a -? b : c }}`
     * into a clean ternary).  Returning false lets tree-sitter re-lex the
     * operator from the original position with the internal lexer.
     */
    if (valid_symbols[STATEMENT_TAG_CLOSE] || valid_symbols[STATEMENT_TAG_TRIM_CLOSE]) {
        switch (scan_statement_tag_close(lexer)) {
            case TAG_CLOSE_MATCHED: return true;
            case TAG_CLOSE_PARTIAL: return false;
            case TAG_CLOSE_ABSENT:  break;
        }
    }
    if (valid_symbols[EXPRESSION_TAG_CLOSE] || valid_symbols[EXPRESSION_TAG_TRIM_CLOSE]) {
        switch (scan_expression_tag_close(lexer)) {
            case TAG_CLOSE_MATCHED: return true;
            case TAG_CLOSE_PARTIAL: return false;
            case TAG_CLOSE_ABSENT:  break;
        }
    }

    /* ASI and ternary.  Only attempt the ternary when ASI consumed nothing but
     * whitespace (ASI_TRY_TERNARY); ASI_DECLINE means an operator was consumed
     * and a ternary token would swallow it. */
    if (valid_symbols[AUTOMATIC_SEMICOLON])
        return dispatch_asi(scan_automatic_semicolon(lexer), lexer, valid_symbols);

    if (valid_symbols[TERNARY_QMARK])
        return scan_ternary_qmark(lexer);

    return false;
}

/* -------------------------------------------------------------------------
 * Scanner lifecycle (shared by both parsers' shims)
 * ---------------------------------------------------------------------- */

static void *ucode_scanner_create(void) {
    return calloc(1, sizeof(Scanner));
}

static void ucode_scanner_destroy(void *payload) {
    free(payload);
}

static unsigned ucode_scanner_serialize(void *payload, char *buffer) {
    Scanner *state = (Scanner *)payload;
    buffer[0] = state->skip_asi_before_comment ? 1 : 0;
    return 1;
}

static void ucode_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *state = (Scanner *)payload;
    state->skip_asi_before_comment = (length > 0 && buffer[0] != 0);
}

#endif /* UCODE_SCANNER_IMPL_H_ */
