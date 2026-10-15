/*
 * Shared external-scanner implementation for ucode and ucode_markup.
 *
 * Included by ucode/src/scanner.c and ucode_markup/src/scanner.c.  Every
 * function here is static so each compilation unit gets its own copy and no
 * ucode_* symbols leak into the markup shared library.
 *
 * Token order MUST match the `externals` array in common/define-grammar.js:
 *  0  AUTOMATIC_SEMICOLON          $._automatic_semicolon
 *  1  TEMPLATE_CHARS               $._template_chars
 *  2  RAW_TEXT                     $.raw_text
 *  3  STATEMENT_TAG_OPEN           $.statement_tag_open            {%
 *  4  STATEMENT_TAG_TRIM_OPEN      $.statement_tag_trim_open       {%-
 *  5  STATEMENT_TAG_LSTRIP_OPEN    $.statement_tag_lstrip_open     {%+
 *  6  STATEMENT_TAG_CLOSE          $.statement_tag_close           %}
 *  7  STATEMENT_TAG_TRIM_CLOSE     $.statement_tag_trim_close      -%}
 *  8  EXPRESSION_TAG_OPEN          $.expression_tag_open           {{
 *  9  EXPRESSION_TAG_TRIM_OPEN     $.expression_tag_trim_open      {{-
 * 10  EXPRESSION_TAG_CLOSE         $.expression_tag_close          }}
 * 11  EXPRESSION_TAG_TRIM_CLOSE    $.expression_tag_trim_close     -}}
 * 12  COMMENT_CONTENT              $.comment_content               {# ... #} body
 * 13  COMMENT                      $.comment                       line and block
 * 14  SINGLE_QUOTE_STRING_CONTENT  $._single_quote_string_content  '...' body
 * 15  DOUBLE_QUOTE_STRING_CONTENT  $._double_quote_string_content  "..." body
 * 16  REGEX_CONTENT                $._regex_content                /.../ body
 * 17  OCTAL_ESCAPE                 $._octal_escape                 \NNN in a string/template
 * 18  ASI_GAP                      $._asi_gap                      zero-width no-op (extra)
 * 19  TAG_SEMICOLON                $._tag_semicolon                zero-width ';' before %} (template unbraced body)
 * 20  TEXT_END                     $._text_end                     zero-width end of input
 * 21  RETURN_MARKER                $._return_marker                never emitted; valid only right after `return`
 * 22  BLOCK_END                    $._block_end                    zero-width end of input, closing one statement list
 * 23  ERROR_SENTINEL               $._error_sentinel               never emitted; valid only in error recovery
 */

#ifndef UCODE_COMMON_SCANNER_H_
#define UCODE_COMMON_SCANNER_H_

#include "tree_sitter/parser.h"
#include <wctype.h>
#include <stdlib.h>   /* calloc / free for the scanner state */
#include <string.h>   /* strcmp in lookahead_is_end_keyword */

/*
 * 1 when compiled into the ucode_markup scanner (its shim defines it before
 * including this file), 0 for the plain ucode scanner. Enables the template-
 * only lexing of tag delimiters inside code (see lookahead_is_tag_open and
 * scan_stray_tag_delimiter).
 */
#ifndef UCODE_SCANNER_TEMPLATE
#define UCODE_SCANNER_TEMPLATE 0
#endif

enum TokenType {
    AUTOMATIC_SEMICOLON,
    TEMPLATE_CHARS,
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
    COMMENT_CONTENT,
    COMMENT,
    SINGLE_QUOTE_STRING_CONTENT,
    DOUBLE_QUOTE_STRING_CONTENT,
    REGEX_CONTENT,
    OCTAL_ESCAPE,
    ASI_GAP,
    TAG_SEMICOLON,
    TEXT_END,
    RETURN_MARKER,
    BLOCK_END,
    ERROR_SENTINEL,
};

/*
 * Persistent scanner state, serialized because a GLR fork must carry it to
 * each branch.
 *
 * skip_asi_before_comment is carried across exactly two consecutive scans:
 * when the ASI-before-comment path emits its zero-width marker (a real ASI or
 * a no-op ASI_GAP), it sets the flag so the very next scan re-scans the
 * comment itself instead of re-deciding the ASI (which would loop, and would
 * misplace the marker).
 *
 * text_end_emitted is set once the root's TEXT_END has been emitted, so no
 * BLOCK_END follows it (see the end of ucode_scanner_scan).
 */
typedef struct {
    bool skip_asi_before_comment;
    bool text_end_emitted;
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

/* Result of attempting to scan a tag-close marker (%} -%} }} -}}). */
typedef enum {
    TAG_CLOSE_MATCHED,   /* full marker consumed; result_symbol set */
    TAG_CLOSE_ABSENT,    /* not a close marker; nothing consumed */
    TAG_CLOSE_PARTIAL,   /* a leading '-'/'%'/'}' was consumed, then rejected */
} TagCloseResult;

/* Line terminators.  ucode has only LF and CR — not JavaScript's U+2028 /
   U+2029, which its lexer rejects as "Unexpected character". */
static inline bool is_line_terminator(int32_t c) {
    return c == '\n' || c == '\r';
}

/*
 * Inline (non-line-terminating) whitespace: the rest of C isspace(), which is
 * what ucode's lexer skips and what the grammar's `extras` regex matches.
 * Listed explicitly rather than calling iswspace(), whose answer depends on
 * the host process's locale (an editor that calls setlocale() would see NBSP
 * as a blank), so a file would parse differently from one program to the
 * next.  This is the single predicate for "blank that does not end a line";
 * scan_comment's leading skip uses it so the ASI decision is not stranded on
 * one of them.
 */
static inline bool is_inline_ws(int32_t c) {
    return c == ' ' || c == '\t' || c == '\v' || c == '\f';
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
 * The rest of a tag opener, after its '{': `{%`, `{%-`, `{%+`, `{{` or `{{-`.
 * The lookahead is the opener's '%' or '{'.
 */
static bool finish_tag_open(TSLexer *lexer) {
    bool statement = lexer->lookahead == '%';
    advance(lexer);
    if (lexer->lookahead == '-') {
        advance(lexer);
        lexer->result_symbol = statement ? STATEMENT_TAG_TRIM_OPEN : EXPRESSION_TAG_TRIM_OPEN;
    } else if (statement && lexer->lookahead == '+') {
        advance(lexer);
        lexer->result_symbol = STATEMENT_TAG_LSTRIP_OPEN;
    } else {
        lexer->result_symbol = statement ? STATEMENT_TAG_OPEN : EXPRESSION_TAG_OPEN;
    }
    lexer->mark_end(lexer);
    return true;
}

/*
 * Raw text and the tag openers. One function, because telling them apart
 * means advancing past a '{' and looking at the next character, and a
 * scanner cannot step back: it must decide here, from that position.
 */
static bool scan_markup(TSLexer *lexer, const bool *valid_symbols) {
    /* Not at '{': only raw text is possible. */
    if (lexer->lookahead != '{')
        return valid_symbols[RAW_TEXT] ? scan_raw_text_from(lexer, false) : false;

    advance(lexer);

    if (lexer->lookahead == '%' &&
        (valid_symbols[STATEMENT_TAG_OPEN] ||
         valid_symbols[STATEMENT_TAG_TRIM_OPEN] ||
         valid_symbols[STATEMENT_TAG_LSTRIP_OPEN]))
        return finish_tag_open(lexer);

    if (lexer->lookahead == '{' &&
        (valid_symbols[EXPRESSION_TAG_OPEN] || valid_symbols[EXPRESSION_TAG_TRIM_OPEN]))
        return finish_tag_open(lexer);

    /* {#  {#- — comment tag; let the internal lexer match the literal '{#'. */
    if (lexer->lookahead == '#') return false;

    /* '{' followed by anything else: include it in raw text. */
    return valid_symbols[RAW_TEXT] ? scan_raw_text_from(lexer, true) : false;
}


/*
 * Advance past a tag close: `%}` / `-%}` when statement is set, `}}` / `-}}`
 * when expression is. On a match, *symbol is its token; mark_end is left to
 * the caller. No leading-whitespace skip: scan_comment is dispatched first
 * (COMMENT is a valid extra wherever this runs) and has already consumed any
 * whitespace and line terminators.
 */
static TagCloseResult match_tag_close(
    TSLexer *lexer, bool statement, bool expression, enum TokenType *symbol
) {
    bool trim = lexer->lookahead == '-';
    if (trim) advance(lexer);
    int32_t mid = lexer->lookahead;
    if (!((statement && mid == '%') || (expression && mid == '}')))
        return trim ? TAG_CLOSE_PARTIAL : TAG_CLOSE_ABSENT;
    advance(lexer);
    if (lexer->lookahead != '}') return TAG_CLOSE_PARTIAL;
    advance(lexer);
    *symbol = mid == '%' ? (trim ? STATEMENT_TAG_TRIM_CLOSE : STATEMENT_TAG_CLOSE)
                         : (trim ? EXPRESSION_TAG_TRIM_CLOSE : EXPRESSION_TAG_CLOSE);
    return TAG_CLOSE_MATCHED;
}

/* Scan a tag close (see match_tag_close) as a token. */
static TagCloseResult scan_tag_close(TSLexer *lexer, bool statement, bool expression) {
    enum TokenType symbol;
    TagCloseResult result = match_tag_close(lexer, statement, expression, &symbol);
    if (result == TAG_CLOSE_MATCHED) {
        lexer->mark_end(lexer);
        lexer->result_symbol = symbol;
    }
    return result;
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
    lexer->result_symbol = COMMENT_CONTENT;
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
 * Code-mode tokens
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
 * starting with slash-star or `//` (e.g. the glob `'/\*.uc'`) is kept as string
 * content instead of being lexed as a comment.  A literal NUL is ordinary
 * content (ucode allows it in strings).
 *
 * Cost: while a string is unterminated, each reparse rescans it to EOF (about
 * 0.06 ms per KB of file tail). Ending the token earlier would be cheaper but
 * would swallow the rest of the file into the string.
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
 * statement-by-statement instead of swallowing the file tail, which a regex in
 * the grammar could not do.
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
 * consumes up to 3 digits and rejects a value above 255 ("Invalid escape
 * sequence"). A regex cannot: `\777` would match as `\77` plus a literal '7'.
 * Declining here leaves nothing else that can start at the '\', so it is an
 * error. Aliased to escape_sequence in the grammar, whose own regex has no
 * octal branch.
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
 * Return true if the lookahead is `%}` or `-%}`. Peeks by advancing, without
 * mark_end, so a zero-width token (ASI, TAG_SEMICOLON) can be emitted before
 * the close. The lookahead_is_* helpers below all work this way.
 */
static bool lookahead_is_stmt_close(TSLexer *lexer) {
    enum TokenType symbol;
    return match_tag_close(lexer, true, false, &symbol) == TAG_CLOSE_MATCHED;
}

/* Return true if the lookahead is `{%` or `{{`, in any variant. */
static bool lookahead_is_tag_open(TSLexer *lexer) {
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    return lexer->lookahead == '%' || lexer->lookahead == '{';
}

/*
 * Return true if the lookahead is the keyword `in` at a word boundary, not a
 * prefix of a longer identifier (`intval`).  `in` is ucode's only keyword
 * binary operator (there is no `instanceof`), so it must decline ASI like any
 * other continuation token: `let x = y\nin [1, 2];` is valid ucode and must
 * not be split into two statements.
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
 * Return true if the lookahead is a keyword that ends a statement list
 * (alt-syntax `else`/`elif`/`end*`, or a switch `case`/`default`) at a word
 * boundary.
 */
static bool lookahead_is_end_keyword(TSLexer *lexer) {
    static const char *const words[] = {
        "case", "default", "elif", "else",
        "endfor", "endfunction", "endif", "endwhile",
    };
    char word[12];
    unsigned len = 0;

    while (len < sizeof(word) - 1 &&
           ((lexer->lookahead >= 'a' && lexer->lookahead <= 'z') ||
            (lexer->lookahead >= 'A' && lexer->lookahead <= 'Z') ||
            (lexer->lookahead >= '0' && lexer->lookahead <= '9') ||
            lexer->lookahead == '_')) {
        word[len++] = (char)lexer->lookahead;
        advance(lexer);
    }
    word[len] = '\0';

    for (unsigned i = 0; i < sizeof(words) / sizeof(words[0]); i++)
        if (strcmp(word, words[i]) == 0)
            return true;
    return false;
}

/*
 * Automatic semicolon insertion. Each decision returns true to insert the
 * zero-width ';' and false not to; it peeks by advancing, and mark_end stays
 * at the scan's entry, right after the statement's last token, so the ';'
 * sits there rather than stretching the statement over the whitespace and
 * line breaks scan_comment skipped (editors would then treat the next line as
 * still inside the statement's block).
 *
 * Deliberately more lenient than ucode, which drops a ';' only before '}',
 * EOF, a tag close or an alt-syntax keyword (endif, elif, …) and rejects
 * `x = 1\ny = 2`: like ECMAScript, a line break also ends a statement, so
 * code being edited is not flagged (see README). Before a tag close
 * (`{% let x = 1 %}`) ucode itself needs no ';'.
 */

/* Decision for a token on the same line as the statement's end. */
static bool asi_same_line_decision(TSLexer *lexer) {
    /* '}', or EOF. A NUL byte in code is an error in any case; ending the
       statement before it keeps the statement intact. */
    if (lexer->lookahead == '}' || lexer->lookahead == 0)
        return true;

    /* Template only: a `{%` or `{{` inside a tag is always an error in ucode
       ("Template blocks may not be nested") — typically a half-typed tag
       followed by the next real one. End the statement here, so error
       recovery only has to supply the missing `%}` (see
       scan_stray_tag_delimiter) instead of swallowing the rest of the file. */
    if (UCODE_SCANNER_TEMPLATE && lexer->lookahead == '{')
        return lookahead_is_tag_open(lexer);

    if (lexer->lookahead == '%' || lexer->lookahead == '-')
        return lookahead_is_stmt_close(lexer);

    return false;
}

/*
 * Decision for the first token after a line break. This is the one list of
 * tokens that continue an expression on the next line; `in` is the only one
 * that is not punctuation.
 */
static bool asi_after_newline_decision(TSLexer *lexer, bool after_return) {
    /* Right after `return`, ucode reads the next line as the return value
       (`return\n\ta + b;` returns a + b), so end the statement only where no
       expression can follow: '}', EOF, a tag close or `{%`, or a keyword that
       ends the statement list.  Anything else — including '{', an object
       literal — is the operand. */
    if (after_return) {
        if (lexer->lookahead == '}' || lexer->eof(lexer))
            return true;
        if (lexer->lookahead == '%' || lexer->lookahead == '-')
            return lookahead_is_stmt_close(lexer);
        if (UCODE_SCANNER_TEMPLATE && lexer->lookahead == '{')
            return lookahead_is_tag_open(lexer);
        return lookahead_is_end_keyword(lexer);
    }

    switch (lexer->lookahead) {
        case '(': case '[': case '`':
        case '.': case ',': case ';':
        case '+': case '*':
        case '=': case '<': case '>': case '!': case '~':
        case '&': case '|': case '^': case '?':
            return false;
        case '-':
        case '%':
            /* A tag close, or else a binary operator. */
            return lookahead_is_stmt_close(lexer);
        default:
            /* `in` continues the expression (`y\nin [1, 2]`); anything else
               is '}', EOF, or the start of a new statement → insert. */
            return !lookahead_is_in_keyword(lexer);
    }
}

/*
 * Line (slash-slash) and block (slash-star) comments.
 *
 * The '/' is ambiguous and cannot be un-consumed once advanced past, so
 * scan_comment reports one of four outcomes:
 *   CMT_FOUND         a comment (or an ASI marker before one) was scanned.
 *   CMT_ABORT         a '/' was consumed that starts a division or a regex:
 *                     the whole scanner returns false, so tree-sitter re-lexes
 *                     it from the entry position.
 *   CMT_NONE          no comment; only inline whitespace was skipped.
 *   CMT_NONE_NEWLINE  no comment, but a line break was skipped: the
 *                     dispatcher makes the post-newline ASI decision.
 */
typedef enum { CMT_NONE, CMT_NONE_NEWLINE, CMT_FOUND, CMT_ABORT } CommentResult;

/*
 * Advance past the rest of a comment, from its second character ('/' or '*').
 * Returns false for a block comment left open at EOF.
 *
 * A line comment runs to the end of the line or EOF, as in ucode, swallowing
 * a `%}` on that line. A block comment's opening '*' also counts towards its
 * close, as in ucode's lexer (lexer.c parse_comment): slash-star-slash is a
 * complete, empty comment.
 */
static bool skip_comment_body(TSLexer *lexer) {
    if (lexer->lookahead == '/') {
        while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead))
            advance(lexer);
        return true;
    }
    advance(lexer);  /* the '*' */
    if (lexer->lookahead == '/') {
        advance(lexer);
        return true;
    }
    while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '*') {
            advance(lexer);
            if (lexer->lookahead == '/') {
                advance(lexer);
                return true;
            }
        } else {
            advance(lexer);
        }
    }
    return false;
}

/*
 * Decide the preceding statement's ASI BEFORE an own-line comment is emitted.
 *
 * A comment is an external `extra`, scanned ahead of ASI, so emitting it
 * first would leave it INSIDE the still-open preceding statement: a doc
 * comment after `function f() {}` (no `;`) would land in the function, not
 * before the next declaration. Instead, peek past this comment and any
 * further own-line comments to the next real token, decide, and emit a
 * zero-width token at the entry position: AUTOMATIC_SEMICOLON when that token
 * starts a new statement, or a no-op ASI_GAP when it continues the expression
 * (`a\n// c\n.b`). The comment itself is scanned on the next call.
 *
 * Returns true for AUTOMATIC_SEMICOLON. The caller then sets
 * Scanner.skip_asi_before_comment only for ASI_GAP: the statement is still
 * open, so ASI is valid on the next call, and this path would loop. After an
 * inserted ';' it is not valid, so no flag is needed — and setting one would
 * leave the comment inside the not-yet-reduced `function f() {}`.
 *
 * Contract: mark_end is at the entry position, and the caller has advanced
 * past the comment's '/'. This function never calls mark_end.
 */
static bool scan_asi_before_comment(TSLexer *lexer, bool after_return) {
    bool newline_before_next;

    for (;;) {
        if (!skip_comment_body(lexer)) {
            /* Unterminated block comment: an error either way. The next call
               re-scans it, and scan_comment returns CMT_ABORT. */
            lexer->result_symbol = ASI_GAP;
            return false;
        }

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

        /* Another comment? */
        if (lexer->lookahead != '/') break;
        advance(lexer);
        if (lexer->lookahead == '/' || lexer->lookahead == '*')
            continue;
        /* Division or a regex: it continues the expression. */
        lexer->result_symbol = ASI_GAP;
        return false;
    }

    /* At the next real token. On the line where a block comment ends, the
       same-line rules apply: a statement after the comment stays an error, as
       in ucode, while a `%}` there still ends the statement. */
    bool insert = newline_before_next
        ? asi_after_newline_decision(lexer, after_return)
        : asi_same_line_decision(lexer);
    lexer->result_symbol = insert ? AUTOMATIC_SEMICOLON : ASI_GAP;
    return insert;
}

static CommentResult scan_comment(TSLexer *lexer, Scanner *state,
                                  bool asi_valid, bool gap_valid,
                                  bool after_return) {
    bool crossed_newline = false;

    /* The previous scan emitted an ASI marker before this comment; this call
       scans the comment itself. */
    bool suppress_asi_before_comment = state->skip_asi_before_comment;
    state->skip_asi_before_comment = false;

    /* The entry position, where the zero-width tokens (ASI, ASI_GAP,
       TAG_SEMICOLON) are emitted. */
    lexer->mark_end(lexer);

    /* Skip whitespace to reach a comment: tree-sitter will not call the
       scanner again after lexing whitespace itself, so a comment reached only
       across whitespace would be lexed as division or a regex. A line break
       is skipped too, but reported (crossed_newline): it is what lenient ASI
       relies on. */
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
    if (lexer->lookahead != '/' && lexer->lookahead != '*')
        return CMT_ABORT;

    if (crossed_newline && asi_valid && gap_valid && !suppress_asi_before_comment) {
        state->skip_asi_before_comment = !scan_asi_before_comment(lexer, after_return);
        return CMT_FOUND;
    }

    /* An unterminated block comment is an error in ucode ("Unterminated
       comment"), so it is not a token. */
    if (!skip_comment_body(lexer)) return CMT_ABORT;
    lexer->result_symbol = COMMENT;
    lexer->mark_end(lexer);
    return CMT_FOUND;
}

/* -------------------------------------------------------------------------
 * Main dispatch
 * ---------------------------------------------------------------------- */

/*
 * Template only: a tag delimiter — `{%`, `%}`, `{{`, `}}`, in any variant —
 * where none is valid. ucode's lexer reads these as tag delimiters anywhere in
 * template code outside strings, comments, regexes and template-literal text,
 * so `{% x = {a:{b:1}}; %}` or `{% if (a) {{ … }} %}` is a syntax error there,
 * not nested braces. Typically it is a half-typed tag (`{% if (co` or
 * `{{ obj.` followed by the next tag), or a tag closed mid-expression
 * (`{% x = 1 + %}`, `{{ obj. }}`). Emit the delimiter token anyway, though it
 * is invalid here: tree-sitter then reports the error and recovers around the
 * tag boundary — typically by inserting the one missing token — instead of
 * re-lexing the characters as `{`, `%` and `}` operators and keeping the
 * error region open until some unrelated token happens to fit. Valid input
 * never reaches this: a delimiter that is valid has already been matched
 * above.
 */
static bool scan_stray_tag_delimiter(TSLexer *lexer) {
    if (lexer->lookahead == '{')
        return lookahead_is_tag_open(lexer) && finish_tag_open(lexer);
    return scan_tag_close(lexer, true, true) == TAG_CLOSE_MATCHED;
}

static bool ucode_scanner_scan(
    void *payload, TSLexer *lexer, const bool *valid_symbols
) {
    Scanner *state = (Scanner *)payload;

    /*
     * Error-recovery guard.
     *
     * During error recovery tree-sitter marks every external token valid at
     * once; ERROR_SENTINEL, which no grammar rule uses, is valid only then (the
     * pattern tree-sitter's external-scanner docs recommend). Return false so
     * the parser uses its own grammar tokens for recovery instead of this
     * scanner — e.g. consuming code as raw_text.
     */
    if (valid_symbols[ERROR_SENTINEL])
        return false;

    /*
     * The zero-width end of input that ends the root. (Also emitted below
     * when it is NOT valid — see the end of this function.) RAW_TEXT declines
     * at EOF, so nothing competes.
     */
    if (valid_symbols[TEXT_END] && lexer->eof(lexer)) {
        state->text_end_emitted = true;
        lexer->result_symbol = TEXT_END;
        lexer->mark_end(lexer);
        return true;
    }

    /* The zero-width end of input that ends a statement list. (Also emitted
       below when it is NOT valid.) */
    if (valid_symbols[BLOCK_END] && lexer->eof(lexer)) {
        lexer->result_symbol = BLOCK_END;
        lexer->mark_end(lexer);
        return true;
    }

    /*
     * String and template-literal bodies. Dispatched ahead of COMMENT, which
     * as an extra is offered even inside strings, so a `//` or slash-star in
     * a string stays content. They decline at a '\\', where OCTAL_ESCAPE is
     * valid too, so only a match returns.
     */
    if (valid_symbols[TEMPLATE_CHARS] && scan_template_chars(lexer))
        return true;

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
    if (valid_symbols[COMMENT_CONTENT])
        return scan_comment_chars(lexer);

    /* Raw text and tag openers. */
    if (valid_symbols[RAW_TEXT] ||
        valid_symbols[STATEMENT_TAG_OPEN] ||
        valid_symbols[STATEMENT_TAG_TRIM_OPEN] ||
        valid_symbols[STATEMENT_TAG_LSTRIP_OPEN] ||
        valid_symbols[EXPRESSION_TAG_OPEN] ||
        valid_symbols[EXPRESSION_TAG_TRIM_OPEN]) {
        if (scan_markup(lexer, valid_symbols)) return true;
    }

    /*
     * Comments, which also skip the whitespace before the tag-close and ASI
     * scans below.
     */
    bool crossed_newline = false;
    if (valid_symbols[COMMENT]) {
        switch (scan_comment(lexer, state, valid_symbols[AUTOMATIC_SEMICOLON], valid_symbols[ASI_GAP],
                             valid_symbols[RETURN_MARKER])) {
            case CMT_FOUND:        return true;
            case CMT_ABORT:        return false;
            case CMT_NONE_NEWLINE: crossed_newline = valid_symbols[AUTOMATIC_SEMICOLON]; break;
            case CMT_NONE:         break;
        }
    } else {
        /* scan_comment marks the entry position for the zero-width tokens
           below (ASI, TAG_SEMICOLON); COMMENT is an extra, so it is valid
           wherever they are — this is only a safety net. */
        lexer->mark_end(lexer);
    }

    /*
     * Template only: ucode's compiler reads every `%}` as `;`, so an unbraced
     * body (`{% if (a) %}`, `{% else %}`, `{% for (…) %}`) that runs straight
     * into a tag close is an empty statement. Emit it zero-width so the `%}`
     * is still lexed next, as the start of the following text_statement. Only
     * valid in unbraced-body positions, where neither the tag close nor ASI is
     * (so there is no competing decision); scan_comment has already skipped
     * the whitespace before the close. Not a close → return false, letting
     * tree-sitter re-lex the '-'/'%' that lookahead_is_stmt_close consumed.
     */
    if (valid_symbols[TAG_SEMICOLON]) {
        lexer->result_symbol = TAG_SEMICOLON;   /* at the entry mark_end */
        return lookahead_is_stmt_close(lexer);
    }

    /* A line break precedes the next token: decide ASI there. */
    if (crossed_newline) {
        lexer->result_symbol = AUTOMATIC_SEMICOLON;
        return asi_after_newline_decision(lexer, valid_symbols[RETURN_MARKER]);
    }

    /*
     * Tag close tokens.  Checked before ASI so that %} / -%} / }} / -}}
     * are preferred over a zero-length semicolon when both are valid.
     *
     * TAG_CLOSE_PARTIAL means a leading '-'/'%'/'}' was consumed and then
     * rejected (it is really an operator).  We must NOT fall through to the
     * scans below: the lexer is skewed past that operator.  Returning false
     * lets tree-sitter re-lex the operator from the original position with
     * the internal lexer.
     */
    if (valid_symbols[STATEMENT_TAG_CLOSE] || valid_symbols[STATEMENT_TAG_TRIM_CLOSE]) {
        switch (scan_tag_close(lexer, true, false)) {
            case TAG_CLOSE_MATCHED: return true;
            case TAG_CLOSE_PARTIAL: return false;
            case TAG_CLOSE_ABSENT:  break;
        }
    }
    if (valid_symbols[EXPRESSION_TAG_CLOSE] || valid_symbols[EXPRESSION_TAG_TRIM_CLOSE]) {
        switch (scan_tag_close(lexer, false, true)) {
            case TAG_CLOSE_MATCHED: return true;
            case TAG_CLOSE_PARTIAL: return false;
            case TAG_CLOSE_ABSENT:  break;
        }
    }

    /* Same line: scan_comment found no line break. */
    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        lexer->result_symbol = AUTOMATIC_SEMICOLON;
        return asi_same_line_decision(lexer);
    }

    if (UCODE_SCANNER_TEMPLATE && (lexer->lookahead == '{' || lexer->lookahead == '}' ||
                                   lexer->lookahead == '%' || lexer->lookahead == '-'))
        return scan_stray_tag_delimiter(lexer);

    /*
     * Error recovery: end of input inside a block or alt-syntax body that was
     * never closed (typically one still being typed). tree-sitter only
     * inserts a MISSING token if the lookahead can then be SHIFTED, and the
     * real end of input is accepted, never shifted, so no MISSING `}` could
     * ever be inserted before it: the whole open construct became an ERROR.
     *
     * Every statement list may end with a zero-width BLOCK_END, which the
     * scanner emits (above) at end of input. After it, the list's own closer
     * is due; emitting the (here invalid) BLOCK_END again gives the parser a
     * lookahead that the ENCLOSING list accepts, so it inserts the one
     * missing `}` / `endif` / … and shifts it there. Repeated, that closes
     * every open block from the innermost out, up to the root, which ends
     * with TEXT_END.
     *
     * Never after the root has shifted its TEXT_END, where the scanner is
     * called once more at end of input. During the error recovery this
     * starts, the ERROR_SENTINEL guard above keeps the scanner quiet.
     */
    if (lexer->eof(lexer) && !state->text_end_emitted) {
        lexer->result_symbol = BLOCK_END;
        lexer->mark_end(lexer);
        return true;
    }

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
    buffer[1] = state->text_end_emitted ? 1 : 0;
    return 2;
}

static void ucode_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *state = (Scanner *)payload;
    state->skip_asi_before_comment = (length > 0 && buffer[0] != 0);
    state->text_end_emitted = (length > 1 && buffer[1] != 0);
}

#endif /* UCODE_COMMON_SCANNER_H_ */
