# How to bump the version

The version appears nine times in eight files (listed in
[Version strings](../reference/versions.md)). Change them together. Choose the
new number by the rules in [Compatibility](../reference/compatibility.md).

From the repository root, with `X.Y.Z` the new version:

```sh
npx tree-sitter version X.Y.Z        # package.json, tree-sitter.json, Cargo.toml, pyproject.toml, CMakeLists.txt
sed -i 's/^VERSION := .*/VERSION := X.Y.Z/' Makefile
npm install --package-lock-only      # package-lock.json (both entries)
cargo update -p tree-sitter-ucode    # Cargo.lock
```

Then regenerate the parsers, which embed the version from `tree-sitter.json`:

```sh
for g in ucode ucode_markup ucdocs; do
  npx tree-sitter generate $g/grammar.js --output $g/src
done
```

On macOS, use `sed -i ''` instead of `sed -i`.

Check that all nine strings agree. These are the checks CI's `version` job
runs on a tag:

```sh
jq -r .version package.json
jq -r .version package-lock.json
jq -r '.packages[""].version' package-lock.json
jq -r .metadata.version tree-sitter.json
sed -n 's/^version = "\(.*\)"$/\1/p' Cargo.toml | head -1
grep -A1 '^name = "tree-sitter-ucode"$' Cargo.lock | sed -n 's/^version = "\(.*\)"$/\1/p'
sed -n 's/^version = "\(.*\)"$/\1/p' pyproject.toml
sed -n 's/^ *VERSION "\(.*\)"$/\1/p' CMakeLists.txt
sed -n 's/^VERSION := //p' Makefile
```

Every line should print `X.Y.Z`.

Then [cut the release](cut-release.md).
