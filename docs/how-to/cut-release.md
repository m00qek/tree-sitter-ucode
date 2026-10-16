# How to cut a release

A release is a `vX.Y.Z` tag pushed to GitHub. The CI workflow publishes the
npm package from it; nothing else is published.

1. Pick the version number by the rules in
   [Compatibility](../reference/compatibility.md).
2. In [`docs/changelog.md`](../changelog.md), rename the "Unreleased" heading
   to the version, and start a new, empty "Unreleased" section above
   it.
3. Turn the unreleased row of the table in
   [Compatibility](../reference/compatibility.md) into the new version.
4. [Bump the version](bump-version.md) in all nine places.
5. Commit, then tag and push:

    ```sh
    git tag vX.Y.Z
    git push origin main vX.Y.Z
    ```

6. Watch the CI run for the tag. On a `v*` tag:
    - the `version` job fails unless every version string equals the tag
      without its `v`;
    - `wasm` builds the three `.wasm` parsers and `prebuild` builds the Node.js
      prebuilds for linux-x64, linux-arm64, darwin-arm64, darwin-x64,
      win32-x64 and win32-arm64;
    - `publish` waits for `version`, `wasm`, `prebuild`, `bindings`,
      `bindings-swift`, `helix` and `neovim`, then runs
      `npm publish --provenance` with the downloaded `.wasm` files and
      prebuilds.

    If any of these jobs fails, nothing is published.

The workflow does not create a GitHub release. Releases up to v0.8.0 have
release notes on the
[GitHub releases page](https://github.com/m00qek/tree-sitter-ucode/releases).

## Related

- [CI workflows](../reference/ci.md)
- [Version strings](../reference/versions.md)
