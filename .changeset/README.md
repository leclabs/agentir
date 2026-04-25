# Changesets

This directory captures unreleased changes via [changesets](https://github.com/changesets/changesets).

## Adding a changeset

When you make a change worth releasing, run:

```bash
pnpm changeset
```

Follow the prompts: pick which packages changed, pick the bump (patch/minor/major), write a one-line summary. This creates a markdown file in `.changeset/` — commit it with your PR.

The 3 packages are linked under `fixed` in `config.json`, so they all bump together. Pick any one of them and the version applies to all three.

## Releasing

When PRs with changesets land on `main`, the release workflow opens a "Version Packages" PR that:

1. Consumes all pending `.changeset/*.md` files
2. Bumps versions in each `package.json`
3. Updates `CHANGELOG.md` per package

Merging that PR triggers the publish workflow which runs `changeset publish` against npm.
