#!/usr/bin/env bash
# Drive a real Helix through the indent cases below and check the indentation
# it gives a new line — the only way to test editors/helix/queries/*/indents.scm
# (Helix silently ignores an indents.scm it cannot compile, and `hx --health`
# still shows it as found). CI runs it (the helix job); locally it needs tmux,
# a C compiler and a Helix release, e.g. the x86_64-linux tarball from
# https://github.com/helix-editor/helix/releases.
#
#   scripts/check-helix-indents.sh <helix-release-dir>
#
# <helix-release-dir> holds the `hx` binary and its `runtime/`. Helix runs in a
# throwaway config/cache/data directory, with grammars built from this checkout
# (`npm run build` first) and the queries from editors/helix/queries/.
# Each case opens a file, presses `o` on a line, types X and saves; the
# indentation of the X line must match. Exits 1 if any case fails.
set -euo pipefail

HX_DIR=$(cd "${1:?usage: $0 <helix-release-dir>}" && pwd)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
command -v tmux >/dev/null || { echo "tmux is required" >&2; exit 2; }

ENV=$(mktemp -d)
SESSION=helix-indents-$$
trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true; rm -rf "$ENV"' EXIT
CONF=$ENV/config/helix
mkdir -p "$CONF/runtime/queries" "$CONF/runtime/grammars" "$ENV/files"
cp -r "$ROOT"/editors/helix/queries/* "$CONF/runtime/queries/"
cat > "$CONF/languages.toml" <<EOF
use-grammars = { only = ["ucode", "ucode_markup", "ucdocs"] }

[[language]]
name           = "ucode"
scope          = "source.uc"
file-types     = [{ glob = "*.uc" }]
comment-tokens = "//"
indent         = { tab-width = 2, unit = "  " }
grammar        = "ucode"

[[language]]
name                 = "ucode-markup"
scope                = "source.ucode.markup"
file-types           = [{ glob = "*.uc.tmpl" }]
block-comment-tokens = { start = "{#", end = "#}" }
indent               = { tab-width = 2, unit = "  " }
grammar              = "ucode_markup"

[[language]]
name            = "ucdocs"
scope           = "source.ucdocs"
injection-regex = "^ucdocs$"
file-types      = ["ucdocs"]
grammar         = "ucdocs"

[[grammar]]
name   = "ucode"
source = { path = "$ROOT/ucode" }

[[grammar]]
name   = "ucode_markup"
source = { path = "$ROOT/ucode_markup" }

[[grammar]]
name   = "ucdocs"
source = { path = "$ROOT/ucdocs" }
EOF

# A wrapper script, not a shell function: tmux runs commands in its server's
# environment, not this shell's.
HX=$ENV/hx
cat > "$HX" <<EOF
#!/bin/sh
XDG_CONFIG_HOME='$ENV/config' XDG_CACHE_HOME='$ENV/cache' XDG_DATA_HOME='$ENV/data' \\
  HELIX_RUNTIME='$HX_DIR/runtime' exec '$HX_DIR/hx' "\$@"
EOF
chmod +x "$HX"
# Always a fresh build: Helix's own up-to-date check does not see edits to
# common/scanner.h (it is #included, not listed in the grammar's src/).
"$HX" --grammar build >/dev/null
"$HX" --version

failed=0
# check <file extension> <line to press `o` on> <expected spaces> <name> <content>
check() {
  local ext=$1 line=$2 want=$3 name=$4 file=$ENV/files/case.$1 got next
  printf "$5" > "$file"
  tmux new-session -d -s "$SESSION" -x 120 -y 40 "$HX $file"
  sleep 1.2
  tmux send-keys -t "$SESSION" ":$line" Enter; sleep 0.3
  tmux send-keys -t "$SESSION" o; sleep 0.3
  tmux send-keys -t "$SESSION" X Escape; sleep 0.3
  tmux send-keys -t "$SESSION" ":wq!" Enter; sleep 0.8
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  next=$(sed -n "$((line + 1))p" "$file")
  if [ "${next//[[:space:]]/}" = X ]; then
    got=$(( ${#next} - 1 ))
  else
    got="? (line $((line + 1)) is '$next')"
  fi
  if [ "$got" = "$want" ]; then
    printf "ok    %-46s %s\n" "$name" "$want"
  else
    printf "FAIL  %-46s expected %s, got %s\n" "$name" "$want" "$got"
    failed=1
  fi
}

check uc 1 2 "brace block body"             'if (a) {\n}\n'
check uc 1 2 "object literal"               'let o = {\n};\n'
check uc 1 2 "call arguments"               'foo(\n);\n'
check uc 2 4 "nested brace block"           'if (a) {\n  if (b) {\n  }\n}\n'
check uc 3 0 "after a closing brace"        'if (a) {\n  x();\n}\n'
check uc 2 0 "after a statement"            'x = 1\ny = 2\n'
check uc 1 2 "alt-syntax if body"           'if (a):\nendif\n'
check uc 3 2 "alt-syntax elif body"         'if (a):\n  x();\nelif (b):\n  y();\nendif\n'
check uc 1 2 "alt-syntax function body"     'function f():\nendfunction\n'
check uc 3 4 "switch case body"             'switch (x) {\ncase 1:\n    a();\n}\n'
check uc 2 4 "empty switch case"            'switch (x) {\n  case 1:\n}\n'
check uc 1 2 "braceless if, end of file"    'if (a)\n'
check uc 1 2 "braceless if, code below"     'if (a)\nfoo();\n'
check uc 3 2 "braceless else, end of file"  'if (a)\n  x();\nelse\n'
check uc 1 2 "braceless while"              'while (a)\n'
check uc 1 2 "braceless for-in"             'for (x in xs)\n'
check uc 1 0 "after a one-line if"          'if (a) x();\n'
check uc 2 0 "after a braceless if body"    'if (a)\n  x();\n'
check uc 4 0 "after a braceless else body"  'if (a)\n  x();\nelse\n  y();\n'
check uc.tmpl 1 2 "template: spanning brace block" '{%% if (a) { %%}\n{%% } %%}\n'
check uc.tmpl 1 2 "template: alt-syntax block"     '{%% for (x in xs): %%}\n{%% endfor %%}\n'
check uc.tmpl 3 0 "template: after a closed block" '{%% if (a) { %%}\n  x\n{%% } %%}\n'
check uc.tmpl 1 0 "template: top-level text"       'hello\n'
check uc.tmpl 1 0 "template: after an unbraced if" '{%% if (a) %%}\n'

if grep -i "failed to compile" "$ENV"/cache/helix/helix.log 2>/dev/null; then failed=1; fi
exit $failed
