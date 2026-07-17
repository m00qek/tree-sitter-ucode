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
 */

#ifndef UCODE_SCANNER_IMPL_H_
#define UCODE_SCANNER_IMPL_H_

#include "tree_sitter/parser.h"
#include <wctype.h>

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
};

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
 * Scan statement tag close: %}  -%}
 * No leading-whitespace skip: scan_comment is dispatched first (COMMENT is a
 * valid extra in every state this runs in) and has already consumed any
 * whitespace and line terminators, so the lexer sits on the marker char.
 */
static TagCloseResult scan_statement_tag_close(TSLexer *lexer) {
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != '%') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = STATEMENT_TAG_TRIM_CLOSE;
        return TAG_CLOSE_MATCHED;
    }
    if (lexer->lookahead == '%') {
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = STATEMENT_TAG_CLOSE;
        return TAG_CLOSE_MATCHED;
    }
    return TAG_CLOSE_ABSENT;
}

/*
 * Scan expression tag close: }}  -}}
 * No leading-whitespace skip — like scan_statement_tag_close, scan_comment ran
 * first and left the lexer on the marker char.
 */
static TagCloseResult scan_expression_tag_close(TSLexer *lexer) {
    if (lexer->lookahead == '-') {
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = EXPRESSION_TAG_TRIM_CLOSE;
        return TAG_CLOSE_MATCHED;
    }
    if (lexer->lookahead == '}') {
        advance(lexer);
        if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
        advance(lexer);
        lexer->mark_end(lexer);
        lexer->result_symbol = EXPRESSION_TAG_CLOSE;
        return TAG_CLOSE_MATCHED;
    }
    return TAG_CLOSE_ABSENT;
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
        lexer->mark_end(lexer);
        if (lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (c == quote || c == '\\')
            return has_content;
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
        lexer->mark_end(lexer);
        if (lexer->eof(lexer)) return false;
        int32_t c = lexer->lookahead;
        if (c == '/')
            return has_content;
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
     *
     * (Verified empirically over the full corpus + the jow-/ucode suite: ASI is
     * never entered without COMMENT co-valid, so scan_comment always runs first
     * and this function never needs to skip whitespace, comments or newlines of
     * its own.)
     */

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

/*
 * ASI decision when a line terminator has ALREADY been consumed — scan_comment
 * skips newlines to reach a possible following-line comment, and when it finds
 * none it reports crossed_newline and leaves the lexer at the next real token.
 * Decide purely from that token: there is no more whitespace or comment to skip
 * (scan_comment stopped at the first non-whitespace char, and a comment there
 * would have been emitted as its own token).  This is the single authoritative
 * post-newline continuation list — scan_automatic_semicolon handles only the
 * same-line case and shares the '-'/'%' tag-close arm below.  `in` (checked
 * in the default arm via lookahead_is_in_keyword) is the one continuation
 * token that isn't punctuation.
 */
static AsiResult asi_after_newline(TSLexer *lexer) {
    lexer->result_symbol = AUTOMATIC_SEMICOLON;
    lexer->mark_end(lexer);

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

static CommentResult scan_comment(TSLexer *lexer) {
    bool crossed_newline = false;
    /* Skip leading inline whitespace to reach a comment.  tree-sitter calls the
       scanner at the whitespace before the comment and will not re-invoke it
       after lexing that whitespace internally, so a comment reached only across
       whitespace would otherwise be lexed as division or a regex.  is_inline_ws
       matches everything the grammar's `extras` treat as whitespace except line
       terminators, so exotic blanks (form feed, vertical tab, NBSP, …) between a
       newline and the next token are consumed here rather than derailing the ASI
       decision that follows.
       Line terminators need care: skipping one destroys the newline that
       lenient inter-statement ASI relies on.  We
       cannot defer to ASI (leave the newline unconsumed) — a comment may follow
       on the next line, and once ASI skips past it to decide, an emitted
       zero-length ';' cannot carry the skipped comment back out.  Instead we
       skip the newline ourselves but report that we crossed one (CMT_NONE_NEWLINE);
       the dispatcher then runs asi_after_newline at the first token past this
       whitespace when no comment intervenes.  A comment that does follow is
       emitted normally (CMT_FOUND), and the preceding statement's ASI is decided
       on a later call once the comments are past. */
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
    (void)payload;

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
     */
    if (valid_symbols[TEMPLATE_CHARS])
        return scan_template_chars(lexer);

    /*
     * Quoted-string body: only inside a '...' / "..." literal. Dispatched here,
     * ahead of COMMENT, so that a `/*` or `//` at the start of the string (or
     * right after an escape) is kept as content instead of being lexed as a
     * comment (the `comment` extra is otherwise offered even inside strings).
     * Same non-overlap with AUTOMATIC_SEMICOLON as TEMPLATE_CHARS above.
     */
    if (valid_symbols[SINGLE_QUOTE_STRING_CONTENT])
        return scan_string_chars(lexer, '\'', SINGLE_QUOTE_STRING_CONTENT);
    if (valid_symbols[DOUBLE_QUOTE_STRING_CONTENT])
        return scan_string_chars(lexer, '"', DOUBLE_QUOTE_STRING_CONTENT);

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
        switch (scan_comment(lexer)) {
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

#endif /* UCODE_SCANNER_IMPL_H_ */
