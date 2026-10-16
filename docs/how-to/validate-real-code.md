# How to validate against real code

CI parses three bodies of real ucode with the grammars: ucode's own test
suite, the doc comments of ucode's standard library, and the firewall4
project. To reproduce those runs locally:

## 1. Build the parsers

```sh
node scripts/run-tests.js --build-only
```

## 2. Validate against ucode's test suite

Check out ucode at the commit this grammar targets (see
[Known deviations](../reference/deviations.md#targeted-ucode-version)):

```sh
git clone https://github.com/jow-/ucode /tmp/ucode
git -C /tmp/ucode checkout 85922056ef7abeace3cca3ab28bc1ac2d88e31b1
node scripts/validate-corpus.js corpus /tmp/ucode/tests/custom
```

## 3. Validate ucdocs against the standard library's doc comments

```sh
node scripts/validate-docs.js /tmp/ucode /tmp/ucode/lib /tmp/ucode/include/ucode
```

## 4. Validate against firewall4

CI pins firewall4 to a commit (see `.github/workflows/ci.yml`); a fresh clone
may be newer:

```sh
git clone --depth 1 https://github.com/openwrt/firewall4 /tmp/firewall4
node scripts/validate-corpus.js project /tmp/firewall4
```

## Reading the result

Any ERROR or MISSING node in a file or testcase counts as a failure.

If a ucode testcase fails because ucode itself rejects the code, add it to
`EXPECTED_INVALID` in `scripts/validate-corpus.js`. If it is valid ucode that
the grammar does not parse yet, add it to `KNOWN_GRAMMAR_GAPS`. Both lists
are checked: an entry that parses clean, or that names no testcase, fails the
run, so remove an entry once its case is fixed.

If a doc comment is malformed upstream, add it to `KNOWN_INVALID` in
`scripts/validate-docs.js`.

The exit codes and the key format are in
[Build files and scripts](../reference/scripts.md#validate-corpusjs).
