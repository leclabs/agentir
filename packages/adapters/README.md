# @leclabs/agentir-adapters

Official adapters for [agentir](../../README.md). Bundles 10 adapters as subpath exports — install one package, import only the adapters you use.

## Install

```bash
npm install @leclabs/agentir-adapters @leclabs/agentir-core
```

## Usage

Each adapter is a separate subpath export:

```ts
import { claudeAdapter } from '@leclabs/agentir-adapters/claude';
import { opencodeAdapter } from '@leclabs/agentir-adapters/opencode';
import { compile } from '@leclabs/agentir-core';

await compile(ir, [claudeAdapter, opencodeAdapter], 'project', cwd, { explain: true });
```

Tree-shaking by your bundler (esbuild/rollup/webpack) only includes the adapters you actually import.

## Adapters

| Subpath | Adapter | Hooks (of 28) | Notes |
|---|---|---|---|
| `/claude`   | claudeAdapter   | 19 | Reference adapter; full coverage of all 8 resource types. |
| `/opencode` | opencodeAdapter | 13 | Hooks via JS shim plugin + canonical YAML sidecar. |
| `/codex`    | codexAdapter    | 6  | TOML-based config; experimental hook system; Bash-only matchers in practice. |
| `/gemini`   | geminiAdapter   | 10 | `BeforeAgent`/`AfterAgent`/`BeforeModel`/`AfterModel` event flavor. |
| `/copilot`  | copilotAdapter  | 8  | Reads `.claude/settings.json` natively for hooks. |
| `/cursor`   | cursorAdapter   | 17 | Richest non-Claude hook surface; camelCase verb names. |
| `/cline`    | clineAdapter    | 8  | Multi-file rules in `.clinerules/`. |
| `/crush`    | crushAdapter    | 0  | Rules + skills + MCP only. |
| `/aider`    | aiderAdapter    | 0  | Rules only. Smallest adapter; good tutorial example. |
| `/continue` | continueAdapter | 0  | Rules + MCP via `.continue/config.yaml`. |

## Per-adapter capabilities

Run `agentir adapters` to see the live capability matrix, or `agentir events --client <id>` to see the canonical-event mapping for a specific adapter.

## Lossy translation

Adapters explicitly declare per-resource support level (`'full'`/`'partial'`/`'none'`) and per-event support. The engine surfaces lossy translations through `WriteReport.warnings` and `WriteReport.skipped`. The CLI's `--explain` flag pretty-prints them.

## Writing your own adapter

See [`packages/core/docs/writing-an-adapter.md`](../core/docs/writing-an-adapter.md). The aider adapter (~70 lines) is the recommended worked example.

## License

MIT © leclabs
