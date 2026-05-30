#!/usr/bin/env python3
"""
Validate the ucode tree-sitter grammar against real ucode code.

Two modes:

  corpus   -- Extract testcase blocks from the jow-/ucode test suite format
              and parse each one.  Pass the path to the tests/custom/ directory.

               python3 scripts/validate-corpus.py corpus <path/to/tests/custom>

  project  -- Find every .uc / .utpl file under a directory and parse it.
               Auto-detects template vs raw mode from file content.

               python3 scripts/validate-corpus.py project <path/to/project>

In both modes the script exits 0 when every file/testcase parses without ERROR
or unexpected MISSING nodes (known-invalid cases are skipped).
"""

import os
import re
import subprocess
import sys
import tempfile

# ---------------------------------------------------------------------------
# Grammar paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TS_ROOT    = os.path.dirname(SCRIPT_DIR)
TS_RAW     = TS_ROOT
TS_TMPL    = os.path.join(TS_ROOT, "tmpl")

# Prefer the devDependency binary so the script works without a global install.
_ts_local = os.path.join(TS_ROOT, "node_modules", ".bin", "tree-sitter")
TREE_SITTER = _ts_local if os.path.isfile(_ts_local) else "tree-sitter"

# ---------------------------------------------------------------------------
# Known-invalid testcases in the jow-/ucode corpus.
# These are intentionally broken snippets (error-handling regression tests,
# unclosed template blocks, or stubs that are never actually executed).
# Key format: "<relative-path>#<testcase-index>"  (1-based)
# ---------------------------------------------------------------------------

EXPECTED_INVALID = {
    # ucode syntax errors by design (compiler rejects these too)
    "04_modules/07_import_default#4",    # `import { default }` without `as` is invalid
    "04_modules/09_import_wildcard#2",   # `import *` without `as ns` is invalid
    # "not reached" — stub body, test exercises C API via -L/-l, never runs
    "99_bugs/35_vm_callframe_double_free#1",
    # `1~1` — ~ is unary-only; no binary ~ operator in ucode
    "99_bugs/37_compiler_unexpected_unary_op#1",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_template(code: str) -> bool:
    return bool(re.search(r'\{[%{#]', code))


def parse(code: str, tmpl: bool) -> tuple[bool, str]:
    """Parse `code` with the raw or template grammar.

    Returns (has_error, output) where has_error is True only when the tree
    contains ERROR nodes (genuine parse failures).  MISSING nodes mean the
    parser error-recovered by inserting a synthetic token — this is expected
    for files that intentionally omit a closing %} / }} at EOF.
    """
    suffix      = ".utpl" if tmpl else ".uc"
    grammar_dir = TS_TMPL  if tmpl else TS_RAW
    with tempfile.NamedTemporaryFile(suffix=suffix, mode='w',
                                     delete=False, encoding='utf-8') as f:
        f.write(code)
        fname = f.name
    try:
        result = subprocess.run(
            [TREE_SITTER, "parse", "--quiet", "-p", grammar_dir, fname],
            capture_output=True, text=True, cwd=TS_ROOT,
        )
        output    = result.stdout + result.stderr
        has_error = bool(re.search(r'\bERROR\b', output))
        return has_error, output.strip()
    finally:
        os.unlink(fname)


def report(ok: list, fail: list, skip: list, mode: str) -> int:
    total = len(ok) + len(fail) + len(skip)
    print(f"\n{len(ok)}/{total} passed"
          + (f", {len(skip)} skipped (expected-invalid)" if skip else "")
          + (f", {len(fail)} FAILED" if fail else "")
          + f"  [{mode}]")

    if fail:
        print("\n--- Failures ---")
        for label, code, output in fail:
            print(f"\n=== {label} ===")
            print(code[:400].rstrip())
            print("---")
            print(output[:300])
    return 1 if fail else 0

# ---------------------------------------------------------------------------
# Mode: corpus  (jow-/ucode test suite)
# ---------------------------------------------------------------------------

def run_corpus(tests_dir: str) -> int:
    ok, fail, skip = [], [], []

    for root, dirs, files in os.walk(tests_dir):
        dirs.sort()
        for name in sorted(files):
            if name in ("CMakeLists.txt", "run_tests.uc"):
                continue
            path = os.path.join(root, name)
            rel  = os.path.relpath(path, tests_dir)

            try:
                text = open(path, errors='replace').read()
            except OSError:
                continue

            cases = re.findall(
                r'-- Testcase --\n(.*?)-- End --', text, re.DOTALL)

            for i, code in enumerate(cases, 1):
                key   = f"{rel}#{i}"
                tmpl  = is_template(code)
                label = f"{rel} #{i} [{'tmpl' if tmpl else 'raw'}]"

                if key in EXPECTED_INVALID:
                    skip.append(label)
                    print(f"  skip  {label}")
                    continue

                has_error, output = parse(code, tmpl)
                if has_error:
                    fail.append((label, code.strip(), output))
                    print(f"  FAIL  {label}")
                else:
                    ok.append(label)
                    print(f"  ok    {label}")

    return report(ok, fail, skip, "corpus")

# ---------------------------------------------------------------------------
# Mode: project  (real ucode project — parse .uc / .utpl files directly)
# ---------------------------------------------------------------------------

def run_project(project_dir: str) -> int:
    ok, fail = [], []

    for root, dirs, files in os.walk(project_dir):
        dirs.sort()
        for name in sorted(files):
            if not (name.endswith('.uc') or name.endswith('.utpl')):
                continue
            path = os.path.join(root, name)
            rel  = os.path.relpath(path, project_dir)

            try:
                code = open(path, errors='replace').read()
            except OSError:
                continue

            tmpl  = is_template(code)
            label = f"{rel} [{'tmpl' if tmpl else 'raw'}]"

            has_error, output = parse(code, tmpl)
            if has_error:
                fail.append((label, code[:400], output))
                print(f"  FAIL  {label}")
            else:
                ok.append(label)
                print(f"  ok    {label}")

    return report(ok, fail, [], "project")

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def usage():
    print(__doc__)
    sys.exit(2)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        usage()
    mode, target = sys.argv[1], sys.argv[2]
    if mode == "corpus":
        sys.exit(run_corpus(target))
    elif mode == "project":
        sys.exit(run_project(target))
    else:
        usage()
