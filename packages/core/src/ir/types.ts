// Re-export the auto-generated IR types as the public surface.
// Source of truth: packages/core/schema/*.schema.json
// Regenerate via: pnpm --filter @leclabs/agentir-core gen
export type {
  Agent,
  CanonicalEvent,
  Command,
  EnvVars,
  Hook,
  IR,
  Manifest,
  McpServer,
  Permissions,
  RemoteMcpServer,
  Rule,
  Scope,
  Skill,
  StdioMcpServer,
} from './generated.js';
