# How to update a pinned GitHub Action

Every action in `.github/workflows/` is pinned to a commit SHA, with the
version it was resolved from in a comment:

```yaml
uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
```

Dependabot (`.github/dependabot.yml`) opens a weekly pull request that
moves every action to its latest release, updating the SHA and the version
comment together. It waits seven days after a release before proposing it.
The same configuration keeps `docs/requirements.txt` current.

To move an action by hand:

1. Resolve the tag to a commit:

    ```sh
    gh api repos/actions/checkout/commits/v6.2.0 --jq .sha
    ```

    The `commits/` endpoint dereferences annotated tags, so it always returns
    a commit SHA.

2. Replace both the SHA and the version comment, in every workflow that uses
   the action.
