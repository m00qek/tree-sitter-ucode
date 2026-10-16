# Compatibility

## Versioning policy

The grammars have their own semantic version, shared by all three grammars,
the queries and every binding.

| Change | Version part |
| --- | --- |
| a node type, field or query capture renamed or removed | major (minor while the version is 0.x) |
| support for new ucode syntax | minor |
| a fix | patch |

What counts as a node type, field or capture for these rules, and what is
not covered, is discussed in
[About the public API and stability](../explanation/public-api.md).

ucode has no version numbers of its own. OpenWrt packages it as dated git
snapshots: the package Makefile (`package/utils/ucode/Makefile`) records a
source date and commit (`PKG_SOURCE_DATE`, `PKG_SOURCE_VERSION`), and the
installed package's version is built from them, for example
`2026.01.16~85922056-r1`. Stable OpenWrt branches move to newer snapshots in
point releases: OpenWrt 24.10.0 shipped the 2024-07-22 snapshot
(`b610860d`), and 24.10.8 the 2025-07-18 one (`3f64c808`). So an OpenWrt
version alone does not pin the ucode syntax, and the grammar's version does
not follow OpenWrt's.

## Targeted ucode per grammar version

| Grammar version | Targeted ucode commit (date) | OpenWrt releases that ship that ucode |
| --- | --- | --- |
| Unreleased (0.9.0) | [`85922056`](https://github.com/jow-/ucode/commit/85922056ef7abeace3cca3ab28bc1ac2d88e31b1) (2026-01-16) | 25.12.0, 25.12.1, 25.12.2, 25.12.3, 25.12.4, 25.12.5 |
| 0.8.0 | [`85922056`](https://github.com/jow-/ucode/commit/85922056ef7abeace3cca3ab28bc1ac2d88e31b1) (2026-01-16) | 25.12.0, 25.12.1, 25.12.2, 25.12.3, 25.12.4, 25.12.5 |
| 0.1.0 to 0.7.0 | not recorded: CI validated against ucode's `master` branch at the time of each run | not recorded |

Sources: the `ref:` of the ucode checkout in `.github/workflows/ci.yml` at
each tag, the "Targeted ucode version" section of the README at v0.8.0, and
`PKG_SOURCE_VERSION` in OpenWrt's `package/utils/ucode/Makefile` at the tags
v25.12.0 to v25.12.5.

## Known upstream changes not yet supported

These changes landed on ucode's `master` branch after `85922056`. No OpenWrt
release ships them yet, and the grammar rejects the syntax they add:

| Syntax | Example | ucode commit | Merged in |
| --- | --- | --- | --- |
| dynamic `import()` expressions | `let m = import("fs");` | `926f20b` | PR #338 |
| function forward declarations | `function f;` | `d9e24e4` | PR #373 |
| `export function` without a trailing `;` | `export function f() {}` | `552ca3c` | PR #373 |
| method shorthand in object literals | `obj = { foo() { … } }` | `8d7d15e` | PR #387 |

If your ucode is built from a newer `master` checkout, expect ERROR nodes on
these constructs until the grammar retargets. See
[Retarget a newer ucode release](../how-to/retarget-ucode.md).
