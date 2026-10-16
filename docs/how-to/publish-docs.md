# How to build and publish this site

The site is built with [MkDocs](https://www.mkdocs.org/) and the
[Material](https://squidfunk.github.io/mkdocs-material/) theme. The
configuration is `mkdocs.yml` at the repository root, the pages are in
`docs/`, and the pinned tool versions are in `docs/requirements.txt`.

## Preview locally

With [uv](https://docs.astral.sh/uv/):

```sh
uvx --with-requirements docs/requirements.txt mkdocs serve
```

Or in a virtual environment:

```sh
python3 -m venv .venv
.venv/bin/pip install -r docs/requirements.txt
.venv/bin/mkdocs serve
```

Open <http://127.0.0.1:8000/>. The page reloads when you save a file.

## Check before you push

```sh
uvx --with-requirements docs/requirements.txt mkdocs build --strict
```

`--strict` turns every warning into an error, including links to pages or
anchors that do not exist. The output goes to `site/`, which is ignored by
git.

## Publish

`.github/workflows/docs.yml` builds the site with `--strict` on every pull
request that changes `docs/`, `mkdocs.yml` or the workflow, and on pushes to
`main` it also deploys the site to GitHub Pages at
<https://m00qek.github.io/tree-sitter-ucode/>. To redeploy without a change,
run the workflow by hand from the Actions tab.

The repository's Pages source must be set to **GitHub Actions**
(Settings → Pages).
