# How to retarget a newer ucode release

The grammar targets the ucode commit that one OpenWrt release ships (see
[Compatibility](../reference/compatibility.md)). To move to a newer release:

1. Find the ucode commit the release ships. The OpenWrt source tree records
   it in `package/utils/ucode/Makefile` as `PKG_SOURCE_VERSION` (and
   `PKG_SOURCE_DATE`). On a running system, the package version embeds the
   short hash (`apk info -a ucode` or `opkg info ucode`, for example
   `2026.01.16~85922056-r1`); resolve it against
   [jow-/ucode](https://github.com/jow-/ucode) to get the full commit.
2. Update the `ref:` of the "Checkout ucode language test suite" step in
   `.github/workflows/ci.yml`.
3. Validate against that commit's test suite:

    ```sh
    node scripts/run-tests.js --build-only
    git clone https://github.com/jow-/ucode /tmp/ucode
    git -C /tmp/ucode checkout <commit>
    node scripts/validate-corpus.js corpus /tmp/ucode/tests/custom
    ```

4. Sort every failure into `KNOWN_GRAMMAR_GAPS` (valid ucode the grammar does
   not parse yet) or `EXPECTED_INVALID` (code ucode rejects) in
   `scripts/validate-corpus.js`. Testcases that now parse but are listed fail
   the run too; remove those entries.
5. Implement the new syntax, removing each `KNOWN_GRAMMAR_GAPS` entry as its
   case starts to parse. See [Change the grammar](change-grammar.md).
6. Update the compatibility table, the targeted version in
   [Known deviations](../reference/deviations.md#targeted-ucode-version), and
   the changelog.
