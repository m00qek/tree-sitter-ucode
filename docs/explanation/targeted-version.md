# About the targeted ucode version

## One release, not `master`

ucode's `master` branch moves independently of OpenWrt and can be well ahead
of what any released OpenWrt runs. A grammar that tracked `master` would
accept syntax that the routers its users deploy to reject, and an editor
would show no error on code that then fails on the device.

So the grammar targets the ucode commit that one OpenWrt release ships,
currently OpenWrt 25.12's. CI checks out exactly that commit to validate
against ucode's test suite and its standard library's doc comments.

## Why the grammar has its own version numbers

ucode has no release numbers; OpenWrt packages dated snapshots of it, and
stable OpenWrt branches move to newer snapshots in point releases. OpenWrt's
version therefore does not pin the syntax either, and the grammar cannot
borrow it. The grammar has its own semantic version, and
[Compatibility](../reference/compatibility.md) maps each version to the
ucode commit it targets and the OpenWrt releases that ship that commit.

## The cost

Syntax that lands on `master` after the targeted commit is rejected until
the grammar moves to a newer release, even though the ucode developers have
accepted it. If you build ucode from a recent `master` checkout, you will see
ERROR nodes on those constructs. The list is in
[Compatibility](../reference/compatibility.md#known-upstream-changes-not-yet-supported).

Moving the target is deliberate work: the validators are rerun against the
new commit, and every new failure is sorted into "ucode rejects this" or "the
grammar does not support this yet" before the grammar catches up (see
[Retarget a newer ucode release](../how-to/retarget-ucode.md)).

## Why the test suite is pinned too

Validating against an unpinned `master` would let an upstream commit turn CI
red without any change here, and would mix the question "is the grammar
right?" with "has ucode changed?". The same reasoning pins firewall4, the
other real-world project CI parses.
