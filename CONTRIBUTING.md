# Contributing to agentir

## Development setup

```bash
git clone https://github.com/leclabs/agentir.git
cd agentir
pnpm install
pnpm gen        # generate IR TypeScript types from JSON Schema
pnpm build
pnpm test
```

Requires Node ≥ 20 and pnpm 9. The repo uses pnpm via corepack — a fresh `node` install will pick up the right pnpm version automatically from the `packageManager` field.

## Repo layout

```
agentir/
  packages/
    core/         # @leclabs/agentir-core    — IR, engine, validator, Adapter contract
    adapters/     # @leclabs/agentir-adapters — 10 adapters with subpath exports
    cli/          # @leclabs/agentir          — CLI binary
  .changeset/     # release notes (one per change)
  .github/        # CI + release workflows
  DESIGN.md       # architecture reference
  README.md
```

## Common workflows

### Make a change

1. Branch from `main`
2. Edit code, add tests
3. Run `pnpm typecheck && pnpm test` locally
4. Add a changeset: `pnpm changeset` (pick the bump, write a one-line summary)
5. Commit + open PR

### Add a new adapter

See [`packages/core/docs/writing-an-adapter.md`](packages/core/docs/writing-an-adapter.md). For an *official* adapter (lives in this repo):

1. Create `packages/adapters/src/<id>/{paths,events,read,write,index}.ts`
2. Add the subpath to `packages/adapters/package.json` `exports`
3. Add round-trip tests under `packages/adapters/test/<id>/`
4. Register the adapter in `packages/cli/src/index.ts`
5. Update the capability matrix in `README.md`
6. Add a changeset

### Update the IR schema

The IR is defined in `packages/core/schema/*.schema.json`. After editing:

```bash
pnpm --filter @leclabs/agentir-core gen
```

This regenerates `packages/core/src/ir/generated.ts`. Commit both the schema change and the regenerated types — CI verifies they're in sync.

## Releasing

The release flow uses [changesets](https://github.com/changesets/changesets):

1. Open PRs with `.changeset/*.md` files included
2. PRs merge to `main`
3. The release workflow opens a "Version Packages" PR that bumps versions and updates CHANGELOGs
4. Maintainer reviews + merges that PR
5. The release workflow then runs `changeset publish` and pushes to npm

The 3 packages are linked under `fixed` in `.changeset/config.json` — they always release together with the same version.

### One-time setup (maintainer)

The release workflow needs:

- `NPM_TOKEN` repository secret — npm automation token with publish access to `@leclabs/*`
- npm provenance is enabled by default (no extra setup beyond `id-token: write` permission, already in the workflow)

To create the npm token:

```bash
npm login
npm token create --type=automation
# Add the token as NPM_TOKEN in repo secrets
```

## Code style

- TypeScript strict mode, ESM-only
- No emojis in source unless the user requests
- Don't add comments that re-state what the code does
- Prefer existing serializers (`parseRule`, `serializeHook`, etc.) from `@leclabs/agentir-core` over hand-rolled YAML/JSON in adapters

## Reporting issues

Open an issue on [leclabs/agentir](https://github.com/leclabs/agentir). For bugs include: the adapter, the canonical event/resource type involved, and a minimal `.agentir/` repro if possible.
