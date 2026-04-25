/**
 * AUTO-GENERATED. Do not edit by hand.
 * Source: packages/core/schema/*.schema.json
 * Regenerate: pnpm --filter @leclabs/agentir-core gen
 */
/* eslint-disable */

export type Scope = 'user' | 'project' | 'local';
export type CanonicalEvent =
  | 'session.start'
  | 'session.resume'
  | 'session.end'
  | 'prompt.submit'
  | 'turn.end'
  | 'turn.fail'
  | 'agent.idle'
  | 'model.request.pre'
  | 'model.response.post'
  | 'tool.use.pre'
  | 'tool.use.post'
  | 'tool.use.fail'
  | 'file.edit.post'
  | 'file.read.pre'
  | 'file.change.external'
  | 'shell.exec.pre'
  | 'shell.exec.post'
  | 'mcp.exec.pre'
  | 'mcp.exec.post'
  | 'subagent.start'
  | 'subagent.end'
  | 'permission.request'
  | 'permission.deny'
  | 'notification'
  | 'context.compact.pre'
  | 'context.compact.post'
  | 'config.changed'
  | 'instructions.loaded';
/**
 * An MCP server registration. Stdio servers use command+args; remote servers use url. Discriminated by transport.
 */
export type McpServer = StdioMcpServer | RemoteMcpServer;

/**
 * The complete agentir intermediate representation. Top-level container of manifest plus all resource collections.
 */
export interface IR {
  manifest: Manifest;
  rules?: Rule[];
  skills?: Skill[];
  commands?: Command[];
  agents?: Agent[];
  hooks?: Hook[];
  mcp_servers?: McpServer[];
  permissions?: Permissions;
  env?: EnvVars;
}
/**
 * agentir manifest. Entry point of an IR directory; declares schema version, scope, and target clients.
 */
export interface Manifest {
  /**
   * IR schema version. Always 1 in v1.
   */
  agentir: 1;
  scope: Scope;
  /**
   * Adapter ids this manifest compiles to (e.g. claude, opencode, codex).
   */
  targets: string[];
  options?: {
    /**
     * Fail compile on any lossy translation.
     */
    strict?: boolean;
    drift_check?: 'warn' | 'error' | 'ignore';
    emit_warnings?: boolean;
  };
  /**
   * Per-adapter override knobs (paths, behavior). Adapter-defined.
   */
  overrides?: {
    [k: string]: {};
  };
}
/**
 * A rule fragment. Markdown body with optional frontmatter. Compiled to AGENTS.md/CLAUDE.md/.cursorrules etc.
 */
export interface Rule {
  /**
   * Stable identifier; usually the source filename without extension.
   */
  id: string;
  /**
   * Markdown content of the rule.
   */
  body: string;
  /**
   * If set, only emit to these adapter ids.
   */
  targets?: string[];
  /**
   * If set, do not emit to these adapter ids.
   */
  excludes?: string[];
  /**
   * Whether this rule is concatenated with siblings into one rules file (true) or kept as a separate file when the target supports it (false).
   */
  concat?: boolean;
  /**
   * Sort key for concatenation order. Lower values appear first.
   */
  order?: number;
}
/**
 * An Agent Skill — SKILL.md content plus optional adjacent files.
 */
export interface Skill {
  /**
   * Skill slug (kebab-case). Becomes the directory name in target client output.
   */
  name: string;
  /**
   * One-line description used by the agent to decide when to invoke the skill.
   */
  description: string;
  /**
   * SKILL.md markdown body.
   */
  body: string;
  /**
   * Tools the skill is permitted to invoke. May be dropped on adapters that lack the field.
   */
  allowed_tools?: string[];
  /**
   * Paths to additional files in the skill directory, relative to the skill root.
   */
  files?: string[];
  targets?: string[];
  excludes?: string[];
}
/**
 * A slash command. Markdown body becomes the prompt; frontmatter declares args, model, tools.
 */
export interface Command {
  name: string;
  body: string;
  description?: string;
  /**
   * Hint shown to user about expected arguments.
   */
  argument_hint?: string;
  /**
   * Model override for this command.
   */
  model?: string;
  allowed_tools?: string[];
  targets?: string[];
  excludes?: string[];
}
/**
 * A subagent definition. System prompt body plus frontmatter declaring tools, model, color.
 */
export interface Agent {
  name: string;
  /**
   * System prompt for the subagent.
   */
  body: string;
  description?: string;
  model?: string;
  tools?: string[];
  color?: string;
  targets?: string[];
  excludes?: string[];
}
/**
 * A lifecycle hook. Uses the canonical event taxonomy; per-adapter mapping translates to native event names at compile time.
 */
export interface Hook {
  /**
   * Stable identifier; usually the source filename without extension.
   */
  id?: string;
  /**
   * Canonical events that trigger this hook.
   *
   * @minItems 1
   */
  events: [CanonicalEvent, ...CanonicalEvent[]];
  /**
   * Glob (or literal, per adapter capability) matched against event subject — tool name for tool.use.*, file path for file.*, etc.
   */
  matcher?: string;
  /**
   * Shell command to execute when the hook fires.
   */
  command: string;
  /**
   * Timeout in seconds. Defaults to client default if omitted.
   */
  timeout?: number;
  targets?: string[];
  excludes?: string[];
}
export interface StdioMcpServer {
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: {
    [k: string]: string;
  };
  targets?: string[];
  excludes?: string[];
}
export interface RemoteMcpServer {
  name: string;
  transport: 'sse' | 'http';
  url: string;
  headers?: {
    [k: string]: string;
  };
  targets?: string[];
  excludes?: string[];
}
/**
 * Allow / deny / ask lists. Patterns are tool matchers in client-native syntax (e.g. 'Bash(git status)', 'Read(*)').
 */
export interface Permissions {
  allow?: string[];
  deny?: string[];
  ask?: string[];
}
/**
 * Environment variables as a flat string map. Values may use ${env:NAME} interpolation resolved at compile time.
 */
export interface EnvVars {
  [k: string]: string;
}
