# @leclabs/agentir-core

Core types, schema, engine, validator, serializers, and the Adapter contract for [agentir](../../README.md).

If you're building a community adapter, **this is the only package you need**.

## Install

```bash
npm install @leclabs/agentir-core
```

## Public API

```ts
import {
  // IR types (auto-generated from JSON Schema)
  IR, Manifest, Rule, Skill, Command, Agent, Hook,
  McpServer, StdioMcpServer, RemoteMcpServer,
  Permissions, EnvVars, Scope, CanonicalEvent,

  // Adapter contract
  Adapter, AdapterCapabilities, EventMap,
  ResourceType, Support, WriteOpts, WriteReport,

  // Runtime validation
  validateIR, validateHook, validateMcpServer,
  formatErrors,

  // JSON schemas (for tooling)
  irSchema, manifestSchema, hookSchema, allSchemas,

  // Engine
  readIR, writeIR, defaultIRRoot, findIRRoot,
  mergeIR, compile,
  recordCompileState, detectDrift, hashFile,
  parseFrontmatter, serializeFrontmatter,
  migrate, registerMigration, listMigrations,

  // Resource serializers (markdown + frontmatter)
  parseRule, serializeRule,
  parseSkill, serializeSkill,
  parseCommand, serializeCommand,
  parseAgent, serializeAgent,
  parseHook, serializeHook,
} from '@leclabs/agentir-core';
```

## The IR

The intermediate representation is the canonical superset of every supported client's configuration surface. Resources:

| Type | What |
|---|---|
| `Rule` | Markdown rules (CLAUDE.md / AGENTS.md / .clinerules/*) |
| `Skill` | Agent Skills spec (SKILL.md + frontmatter) |
| `Command` | Slash commands |
| `Agent` | Subagents |
| `Hook` | Lifecycle hooks (canonical event taxonomy) |
| `McpServer` | MCP server registration (stdio or remote, discriminated union) |
| `Permissions` | allow / deny / ask lists |
| `EnvVars` | Flat string map |

Full schema in `schema/*.schema.json`. TypeScript types are generated via `pnpm gen`.

## Canonical event taxonomy

agentir publishes a vendor-neutral event taxonomy (`CanonicalEvent`); each adapter maps its native events to/from this set. Includes 28 events across session/turn/model/tool/file/shell/mcp/subagent/permission/notification/context/config phases.

See [DESIGN.md §7](../../DESIGN.md) for the full table or run `agentir events`.

## The Adapter contract

```ts
interface Adapter {
  id: string;
  capabilities: AdapterCapabilities;
  eventMap?: EventMap;
  detect(scope: Scope, cwd: string): Promise<boolean>;
  read(scope: Scope, cwd: string): Promise<Partial<IR>>;
  write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport>;
}
```

Adapters are pure: given the same input, they produce the same output. State lives in the filesystem.

## Engine

The engine is the orchestration layer that consumes adapters:

```ts
import { readIR, compile } from '@leclabs/agentir-core';
import { claudeAdapter } from '@leclabs/agentir-adapters/claude';

const ir = await readIR('project', process.cwd());
const report = await compile(ir, [claudeAdapter], 'project', process.cwd(), {
  dryRun: false,
  strict: false,
  explain: true,
  stateDir: '.agentir',
});

console.log(report.totalWritten, 'files written');
```

## Writing an adapter

See [docs/writing-an-adapter.md](docs/writing-an-adapter.md). The aider adapter (~70 lines) is the recommended worked example.

## License

MIT © leclabs
