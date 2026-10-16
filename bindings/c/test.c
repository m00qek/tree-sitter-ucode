// `make test-c`: against an installed copy, parse a sample per grammar and
// compile every installed query.
//
//   test <queries-dir>    e.g. $PREFIX/share/tree-sitter/queries
#include <dirent.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <tree_sitter/api.h>
#include <tree_sitter/tree-sitter-ucdocs.h>
#include <tree_sitter/tree-sitter-ucode-markup.h>
#include <tree_sitter/tree-sitter-ucode.h>

static int failures = 0;

static void check_parse(const char *name, const TSLanguage *language,
                        const char *source, const char *root) {
  TSParser *parser = ts_parser_new();
  if (!ts_parser_set_language(parser, language)) {
    printf("FAIL  %s: incompatible language (ABI %u)\n", name,
           ts_language_abi_version(language));
    failures++;
    ts_parser_delete(parser);
    return;
  }
  TSTree *tree = ts_parser_parse_string(parser, NULL, source, (uint32_t)strlen(source));
  TSNode node = ts_tree_root_node(tree);
  if (strcmp(ts_node_type(node), root) != 0 || ts_node_has_error(node)) {
    char *sexp = ts_node_string(node);
    printf("FAIL  %s: %s\n", name, sexp);
    free(sexp);
    failures++;
  } else {
    printf("ok    %s parses\n", name);
  }
  ts_tree_delete(tree);
  ts_parser_delete(parser);
}

static char *read_file(const char *path, uint32_t *length) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long size = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *data = malloc((size_t)size + 1);
  *length = (uint32_t)fread(data, 1, (size_t)size, f);
  data[*length] = '\0';
  fclose(f);
  return data;
}

static void check_queries(const char *dir, const char *name, const TSLanguage *language) {
  char path[4096];
  snprintf(path, sizeof path, "%s/%s", dir, name);
  DIR *d = opendir(path);
  if (!d) {
    printf("FAIL  %s: no queries installed\n", path);
    failures++;
    return;
  }
  struct dirent *entry;
  while ((entry = readdir(d))) {
    size_t len = strlen(entry->d_name);
    if (len < 4 || strcmp(entry->d_name + len - 4, ".scm") != 0) continue;
    char file[8192];
    snprintf(file, sizeof file, "%s/%s", path, entry->d_name);
    uint32_t length;
    char *source = read_file(file, &length);
    uint32_t offset;
    TSQueryError error;
    TSQuery *query = ts_query_new(language, source, length, &offset, &error);
    if (!query) {
      printf("FAIL  %s/%s: query error %d at byte %u\n", name, entry->d_name, error, offset);
      failures++;
    } else {
      printf("ok    %s/%s compiles\n", name, entry->d_name);
      ts_query_delete(query);
    }
    free(source);
  }
  closedir(d);
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: %s <queries-dir>\n", argv[0]);
    return 2;
  }
  check_parse("ucode", tree_sitter_ucode(), "let x = 1;\n", "program");
  check_parse("ucode_markup", tree_sitter_ucode_markup(),
              "{% if (a) { %}hi {{ b }}{% } %}\n", "markup");
  check_parse("ucdocs", tree_sitter_ucdocs(), "/** @param {int} [n=0] - Count. */", "document");
  check_queries(argv[1], "ucode", tree_sitter_ucode());
  check_queries(argv[1], "ucode_markup", tree_sitter_ucode_markup());
  check_queries(argv[1], "ucdocs", tree_sitter_ucdocs());
  return failures ? 1 : 0;
}
