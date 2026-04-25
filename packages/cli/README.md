# @leclabs/agentir

CLI for [agentir](../../README.md), the universal configuration translator for AI coding agents.

## Install

```bash
npm install -g @leclabs/agentir
```

## Quick start

```bash
cd ~/myproject
agentir init                  # creates .agentir/
agentir import claude         # lifts ~/.claude/ + ./.claude/ + ./CLAUDE.md into IR
agentir compile               # compiles to all targets in manifest
```

## Commands

### `agentir init`

Bootstraps a new `.agentir/` directory with empty resource folders and a stub manifest.

```
agentir init [--scope user|project|local]
```

### `agentir import <client>`

Reads an existing client's config and lifts it into the IR.

```
agentir import claude
agentir import opencode --merge       # preserve hand-edited IR resources
agentir import codex --from /other/repo
```

### `agentir compile [...clients]`

Compiles the IR to the listed clients (or all targets in `manifest.yaml` if none given).

```
agentir compile                       # all manifest targets
agentir compile claude opencode
agentir compile --dry-run --explain   # preview lossy translations
agentir compile --strict              # abort on any warning
```

### `agentir diff [...clients]`

Shows what would change on next compile, plus drift on already-emitted files.

```
agentir diff claude
```

### `agentir lint`

Validates the IR against schema and checks resource compatibility against declared targets.

```
agentir lint
agentir lint --strict                 # capability warnings → errors
```

### `agentir adapters`

Lists installed adapters and their per-resource capabilities.

### `agentir events [--client <id>]`

Lists the canonical event taxonomy. With `--client`, shows the per-adapter mapping (✓ supported, — absent).

```
agentir events                        # all 28 canonical events
agentir events --client cursor        # shows 17 cursor mappings + 11 absent
```

### `agentir doctor`

Diagnoses installation: IR presence, manifest validity, compile state, per-target detection, drift.

### `agentir watch [...clients]`

Auto-recompiles on IR changes (chokidar, ~300ms debounce). Ctrl-C to exit.

```
agentir watch
agentir watch --debounce 100
```

### `agentir migrate`

Applies IR schema migrations between versions.

```
agentir migrate                       # use manifest's current version → latest
agentir migrate --from 1 --to 2
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error |
| 2 | Validation/IO failure (lint, missing manifest) |
| 3 | Drift detected (when `drift_check: error`) |
| 4 | Lossy translation under `--strict` |

## Environment variables

| Variable | Effect |
|---|---|
| `AGENTIR_HOME` | Override `~/.agentir/` location |
| `AGENTIR_CONFIG` | Override per-invocation manifest path |
| `AGENTIR_LOG_LEVEL` | `error \| warn \| info \| debug` |

## License

MIT © leclabs
