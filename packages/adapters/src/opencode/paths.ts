import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface OpencodePaths {
  /** AGENTS.md location for rules */
  rulesFile: string;
  /** .opencode/ directory (project) or ~/.config/opencode/ (user) */
  opencodeDir: string;
  /** Plugins directory; agentir-hooks.{ts,yaml} live here */
  pluginsDir: string;
  /** Generated executable JS shim that delegates to shell */
  hooksShimFile: string;
  /** Sidecar canonical-form YAML, our source of truth on re-read */
  hooksManifestFile: string;
  /** Skills directory containing per-skill subdirs with SKILL.md */
  skillsDir: string;
  /** MCP server registration */
  mcpFile: string;
  /** Permissions config (best-effort; opencode has its own DSL) */
  permissionsFile: string;
  /** Environment variables */
  envFile: string;
}

/**
 * Resolve OpenCode config paths.
 *
 * - user:    ~/.config/opencode/{AGENTS.md,plugins/}
 * - project: <cwd>/{AGENTS.md, .opencode/plugins/}
 * - local:   N/A — opencode has no clean local-scope convention; defaults
 *            to project paths plus a warning at compile time.
 */
export function paths(scope: Scope, cwd: string): OpencodePaths {
  if (scope === 'user') {
    const opencodeDir = join(homedir(), '.config', 'opencode');
    const pluginsDir = join(opencodeDir, 'plugins');
    return {
      rulesFile: join(opencodeDir, 'AGENTS.md'),
      opencodeDir,
      pluginsDir,
      hooksShimFile: join(pluginsDir, 'agentir-hooks.ts'),
      hooksManifestFile: join(pluginsDir, 'agentir-hooks.yaml'),
      skillsDir: join(opencodeDir, 'skills'),
      mcpFile: join(opencodeDir, 'mcp.json'),
      permissionsFile: join(opencodeDir, 'permissions.json'),
      envFile: join(opencodeDir, 'env.json'),
    };
  }
  // project / local both go to the project tree
  const opencodeDir = join(cwd, '.opencode');
  const pluginsDir = join(opencodeDir, 'plugins');
  return {
    rulesFile: join(cwd, 'AGENTS.md'),
    opencodeDir,
    pluginsDir,
    hooksShimFile: join(pluginsDir, 'agentir-hooks.ts'),
    hooksManifestFile: join(pluginsDir, 'agentir-hooks.yaml'),
    skillsDir: join(opencodeDir, 'skills'),
    mcpFile: join(opencodeDir, 'mcp.json'),
    permissionsFile: join(opencodeDir, 'permissions.json'),
    envFile: join(opencodeDir, 'env.json'),
  };
}
