/*
 * External scanner shared by ucode and ucode_markup, included by each one's
 * src/scanner.c. Everything is static, so no ucode_* symbol leaks into the
 * markup library.
 *
 * Token order MUST match `externals` in common/define-grammar.js.
 */

#ifndef UCODE_COMMON_SCANNER_H_
#define UCODE_COMMON_SCANNER_H_

#include "tree_sitter/parser.h"
#include <wctype.h>
#include <stdlib.h>
#include <string.h>

/* 1 in the ucode_markup scanner (its shim defines it), 0 in ucode. */
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
    ASI_GAP,             /* zero-width no-op extra */
    TAG_SEMICOLON,       /* zero-width ';' before %} */
    TEXT_END,            /* zero-width end of input, ends the root */
    RETURN_MARKER,       /* never emitted; valid only right after `return` */
    BLOCK_END,           /* zero-width end of input, ends a statement list */
    DOC_COMMENT,
    ERROR_SENTINEL,      /* never emitted; valid only in error recovery */
};

/*
 * skip_asi_before_comment: set when an ASI marker was emitted before a
 * comment, so the next scan takes the comment instead of deciding ASI again.
 * text_end_emitted: no BLOCK_END after the root's TEXT_END.
 */
typedef struct {
    bool skip_asi_before_comment;
    bool text_end_emitted;
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer)    { lexer->advance(lexer, true);  }

typedef enum {
    TAG_CLOSE_MATCHED,   /* consumed; result_symbol set */
    TAG_CLOSE_ABSENT,    /* nothing consumed */
    TAG_CLOSE_PARTIAL,   /* a leading '-'/'%'/'}' consumed, then rejected */
} TagCloseResult;

/* ucode has no U+2028 / U+2029 line terminators. */
static inline bool is_line_terminator(int32_t c) {
    return c == '\n' || c == '\r';
}

/* The rest of C isspace(). Not iswspace(): it depends on the host's locale. */
static inline bool is_inline_ws(int32_t c) {
    return c == ' ' || c == '\t' || c == '\v' || c == '\f';
}

/* -------------------------------------------------------------------------
 * Markup-mode tokens
 * ---------------------------------------------------------------------- */

/*
 * Raw text up to a '{' that opens a tag or comment. has_content: the caller
 * already consumed a lone '{'.
 */
static bool scan_raw_text_from(TSLexer *lexer, bool has_content) {
    lexer->result_symbol = RAW_TEXT;
    while (true) {
        lexer->mark_end(lexer);
        /* A NUL byte is content: ucode accepts it in raw text. */
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

/* The rest of a tag opener; the lookahead is the '%' or '{' after the first '{'. */
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

/* Raw text and tag openers in one function: past a '{', a scanner can't step back. */
static bool scan_markup(TSLexer *lexer, const bool *valid_symbols) {
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

    /* `{#`: the internal lexer matches it. */
    if (lexer->lookahead == '#') return false;

    return valid_symbols[RAW_TEXT] ? scan_raw_text_from(lexer, true) : false;
}


/*
 * Advance past `%}` / `-%}` (statement) or `}}` / `-}}` (expression); mark_end
 * is the caller's. No whitespace skip: scan_comment, dispatched first, did it.
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
 * Body of {# ... #}, up to `#}` or `-#}`: a regex would eat the closing '#'.
 * mark_end at each iteration leaves the close marker for the internal lexer.
 * An empty body declines (comment_content is optional).
 */
static bool scan_comment_chars(TSLexer *lexer) {
    lexer->result_symbol = COMMENT_CONTENT;
    bool has_content = false;
    for (;;) {
        lexer->mark_end(lexer);
        if (lexer->eof(lexer)) return has_content;

        if (lexer->lookahead == '#') {
            advance(lexer);
            if (lexer->lookahead == '}') return has_content;
            has_content = true;
            continue;
        }
        if (lexer->lookahead == '-') {
            advance(lexer);
            if (lexer->lookahead == '#') {
                advance(lexer);
                if (lexer->lookahead == '}') return has_content;
                has_content = true;
                continue;
            }
            has_content = true;
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
        /* Unterminated at EOF: discard, as tree-sitter-javascript does. */
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
 * Body of a quoted string, up to the quote or a backslash. ucode strings may
 * span raw newlines; only EOF leaves one unterminated, and then the token is
 * discarded so the parser recovers instead of swallowing the file. Dispatched
 * before COMMENT, so `'/\*.uc'` stays a string.
 */
static bool scan_string_chars(TSLexer *lexer, int32_t quote, enum TokenType sym) {
    lexer->result_symbol = sym;
    bool has_content = false;
    for (;;) {
        /* The stop check precedes every advance, so mark_end is needed only at returns. */
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

/* Consume '\' and the escaped char; false on a trailing '\' at EOF. */
static inline bool regex_consume_escape(TSLexer *lexer) {
    advance(lexer);
    if (lexer->eof(lexer)) return false;
    advance(lexer);
    return true;
}

/*
 * Body of a regex literal, up to the closing '/'. ucode lexes regexes like
 * strings (raw newlines are content, EOF discards), plus bracket classes:
 * inside `[...]` a '/' is literal, a leading ']' (after an optional '^') is a
 * member, and [:name:] [.coll.] [=eq=] keep their ']' from closing the class.
 * Never empty: `//` is a comment.
 */
static bool scan_regex_content(TSLexer *lexer) {
    lexer->result_symbol = REGEX_CONTENT;
    bool has_content = false;
    for (;;) {
        /* As in scan_string_chars; the class loop's EOF returns discard. */
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
            if (lexer->lookahead == ']') advance(lexer);
            for (;;) {
                if (lexer->eof(lexer)) return false;
                int32_t d = lexer->lookahead;
                if (d == '\\') {
                    if (!regex_consume_escape(lexer)) return false;
                    continue;
                }
                advance(lexer);
                if (d == ']') break;
                if (d == '[') {
                    int32_t kind = lexer->lookahead;
                    if (kind == ':' || kind == '.' || kind == '=') {
                        advance(lexer);
                        for (;;) {
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
        advance(lexer);
        has_content = true;
    }
}

/*
 * '\' plus 1-3 octal digits, at most 255 as in ucode. A regex can't do this:
 * `\777` would match `\77` then '7'. Declining leaves an error. Aliased to
 * escape_sequence.
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
 * The lookahead_is_* helpers peek by advancing without mark_end, so a
 * zero-width token can still be emitted at the entry position.
 */
static bool lookahead_is_stmt_close(TSLexer *lexer) {
    enum TokenType symbol;
    return match_tag_close(lexer, true, false, &symbol) == TAG_CLOSE_MATCHED;
}

static bool lookahead_is_tag_open(TSLexer *lexer) {
    if (lexer->lookahead != '{') return false;
    advance(lexer);
    return lexer->lookahead == '%' || lexer->lookahead == '{';
}

/* `in`, ucode's only keyword operator, continues an expression across lines. */
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

/* A keyword that ends a statement list. */
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
 * Automatic semicolon insertion: true inserts a zero-width ';' at the entry
 * position, right after the statement, not after the skipped whitespace.
 * More lenient than ucode by design: a line break also ends a statement.
 */

static bool asi_same_line_decision(TSLexer *lexer) {
    /* A NUL in code is an error anyway; ending here keeps the statement intact. */
    if (lexer->lookahead == '}' || lexer->lookahead == 0)
        return true;

    /* A tag opener inside a tag is an error in ucode: end the statement so
       recovery only inserts the missing `%}`. */
    if (UCODE_SCANNER_TEMPLATE && lexer->lookahead == '{')
        return lookahead_is_tag_open(lexer);

    if (lexer->lookahead == '%' || lexer->lookahead == '-')
        return lookahead_is_stmt_close(lexer);

    return false;
}

/* The tokens that continue an expression on the next line. */
static bool asi_after_newline_decision(TSLexer *lexer, bool after_return) {
    /* ucode reads the line after `return` as its value, so only end it where
       no expression can follow. */
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
            return lookahead_is_stmt_close(lexer);
        default:
            return !lookahead_is_in_keyword(lexer);
    }
}

/*
 * A consumed '/' can't be un-consumed, hence:
 *   CMT_ABORT         the '/' is division or a regex; the scan fails and
 *                     tree-sitter re-lexes from the entry position.
 *   CMT_NONE_NEWLINE  no comment, but a line break was skipped.
 */
typedef enum { CMT_NONE, CMT_NONE_NEWLINE, CMT_FOUND, CMT_ABORT } CommentResult;

typedef enum { BODY_UNTERMINATED, BODY_COMMENT, BODY_DOC } CommentBody;

/*
 * The rest of a comment, from its second character. As in ucode, the
 * opening '*' counts towards the close (slash-star-slash is empty). A doc
 * comment opens with exactly two stars not followed by '/'.
 */
static CommentBody skip_comment_body(TSLexer *lexer) {
    if (lexer->lookahead == '/') {
        while (!lexer->eof(lexer) && !is_line_terminator(lexer->lookahead))
            advance(lexer);
        return BODY_COMMENT;
    }
    advance(lexer);
    if (lexer->lookahead == '/') {
        advance(lexer);
        return BODY_COMMENT;
    }
    bool doc = false;
    if (lexer->lookahead == '*') {
        advance(lexer);
        if (lexer->lookahead == '/') {
            advance(lexer);
            return BODY_COMMENT;
        }
        doc = lexer->lookahead != '*';
    }
    while (!lexer->eof(lexer)) {
        if (lexer->lookahead == '*') {
            advance(lexer);
            if (lexer->lookahead == '/') {
                advance(lexer);
                return doc ? BODY_DOC : BODY_COMMENT;
            }
        } else {
            advance(lexer);
        }
    }
    return BODY_UNTERMINATED;
}

/*
 * Decide ASI before emitting an own-line comment; otherwise the comment would
 * land inside the still-open statement. Peeks past the comments to the next
 * token and emits AUTOMATIC_SEMICOLON (returns true) or a no-op ASI_GAP at the
 * entry position; the comment comes on the next scan. Only ASI_GAP needs
 * skip_asi_before_comment: after it ASI is still valid and this would loop.
 * The caller has consumed the '/'; mark_end stays at the entry.
 */
static bool scan_asi_before_comment(TSLexer *lexer, bool after_return) {
    bool newline_before_next;

    for (;;) {
        if (skip_comment_body(lexer) == BODY_UNTERMINATED) {
            /* The next scan aborts on it. */
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

        if (lexer->lookahead != '/') break;
        advance(lexer);
        if (lexer->lookahead == '/' || lexer->lookahead == '*')
            continue;
        /* Division or a regex continues the expression. */
        lexer->result_symbol = ASI_GAP;
        return false;
    }

    /* Same line as a block comment's end: same-line rules. */
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

    bool suppress_asi_before_comment = state->skip_asi_before_comment;
    state->skip_asi_before_comment = false;

    /* The entry position, where zero-width tokens are emitted. */
    lexer->mark_end(lexer);

    /* tree-sitter won't call the scanner again after skipping whitespace
       itself, so skip it here; line breaks are reported for ASI. */
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

    /* ucode rejects an unterminated block comment. */
    CommentBody body = skip_comment_body(lexer);
    if (body == BODY_UNTERMINATED) return CMT_ABORT;
    lexer->result_symbol = body == BODY_DOC ? DOC_COMMENT : COMMENT;
    lexer->mark_end(lexer);
    return CMT_FOUND;
}

/* -------------------------------------------------------------------------
 * Main dispatch
 * ---------------------------------------------------------------------- */

/*
 * Template only: a tag delimiter where none is valid. ucode reads one as a
 * delimiter anywhere in code, so it is an error there; emitting it anyway,
 * though invalid, lets recovery work at the tag boundary instead of lexing
 * `{`, `%`, `}` as operators.
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

    /* Error recovery marks every external valid; let the grammar's own tokens
       recover (the pattern tree-sitter's docs recommend). */
    if (valid_symbols[ERROR_SENTINEL])
        return false;

    if (valid_symbols[TEXT_END] && lexer->eof(lexer)) {
        state->text_end_emitted = true;
        lexer->result_symbol = TEXT_END;
        lexer->mark_end(lexer);
        return true;
    }

    if (valid_symbols[BLOCK_END] && lexer->eof(lexer)) {
        lexer->result_symbol = BLOCK_END;
        lexer->mark_end(lexer);
        return true;
    }

    /* Before COMMENT, an extra offered even inside strings. At a '\' they
       decline so OCTAL_ESCAPE can match. */
    if (valid_symbols[TEMPLATE_CHARS] && scan_template_chars(lexer))
        return true;

    if (valid_symbols[SINGLE_QUOTE_STRING_CONTENT] &&
        scan_string_chars(lexer, '\'', SINGLE_QUOTE_STRING_CONTENT))
        return true;
    if (valid_symbols[DOUBLE_QUOTE_STRING_CONTENT] &&
        scan_string_chars(lexer, '"', DOUBLE_QUOTE_STRING_CONTENT))
        return true;

    if (valid_symbols[OCTAL_ESCAPE] && scan_octal_escape(lexer))
        return true;

    if (valid_symbols[REGEX_CONTENT])
        return scan_regex_content(lexer);

    if (valid_symbols[COMMENT_CONTENT])
        return scan_comment_chars(lexer);

    if (valid_symbols[RAW_TEXT] ||
        valid_symbols[STATEMENT_TAG_OPEN] ||
        valid_symbols[STATEMENT_TAG_TRIM_OPEN] ||
        valid_symbols[STATEMENT_TAG_LSTRIP_OPEN] ||
        valid_symbols[EXPRESSION_TAG_OPEN] ||
        valid_symbols[EXPRESSION_TAG_TRIM_OPEN]) {
        if (scan_markup(lexer, valid_symbols)) return true;
    }

    /* Also skips the whitespace before the scans below. */
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
        /* Safety net: COMMENT is an extra, so valid wherever the tokens below are. */
        lexer->mark_end(lexer);
    }

    /* Template only: ucode reads `%}` as `;`, so an unbraced body that runs
       into a tag close is an empty statement. */
    if (valid_symbols[TAG_SEMICOLON]) {
        lexer->result_symbol = TAG_SEMICOLON;
        return lookahead_is_stmt_close(lexer);
    }

    if (crossed_newline) {
        lexer->result_symbol = AUTOMATIC_SEMICOLON;
        return asi_after_newline_decision(lexer, valid_symbols[RETURN_MARKER]);
    }

    /* Tag closes win over ASI. On TAG_CLOSE_PARTIAL the lexer is past an
       operator, so fail and let tree-sitter re-lex it. */
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

    if (valid_symbols[AUTOMATIC_SEMICOLON]) {
        lexer->result_symbol = AUTOMATIC_SEMICOLON;
        return asi_same_line_decision(lexer);
    }

    if (UCODE_SCANNER_TEMPLATE && (lexer->lookahead == '{' || lexer->lookahead == '}' ||
                                   lexer->lookahead == '%' || lexer->lookahead == '-'))
        return scan_stray_tag_delimiter(lexer);

    /*
     * End of input inside an unclosed block. tree-sitter only inserts a
     * MISSING token before a lookahead it can shift, and EOF is never shifted.
     * An (invalid) BLOCK_END is one the enclosing list accepts, so each open
     * block gets its MISSING closer, innermost first, up to the root's
     * TEXT_END.
     */
    if (lexer->eof(lexer) && !state->text_end_emitted) {
        lexer->result_symbol = BLOCK_END;
        lexer->mark_end(lexer);
        return true;
    }

    return false;
}

/* -------------------------------------------------------------------------
 * Lifecycle
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
