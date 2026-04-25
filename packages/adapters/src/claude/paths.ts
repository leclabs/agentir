import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface ClaudePaths {
  /** The .claude/ directory itself */
  claudeDir: string;
  /** CLAUDE.md location (null for local scope) */
  rulesFile: string | null;
  /** settings.json or settings.local.json */
  settingsFile: string;
  commandsDir: string | null;
  agentsDir: string | null;
  skillsDir: string | null;
  /** .mcp.json at repo root (project scope only) */
  mcpFile: string | null;
}

/**
 * Resolve Claude Code config paths for a given scope.
 *
 * - user:    `~/.claude/...` + `~/.claude/CLAUDE.md`
 * - project: `<repo>/.claude/...` + `<repo>/CLAUDE.md` + `<repo>/.mcp.json`
 * - local:   only `<repo>/.claude/settings.local.json` (no separate rules/commands/agents)
 */
export function paths(scope: Scope, cwd: string): ClaudePaths {
  if (scope === 'user') {
    const claudeDir = join(homedir(), '.claude');
    return {
      claudeDir,
      rulesFile: join(claudeDir, 'CLAUDE.md'),
      settingsFile: join(claudeDir, 'settings.json'),
      commandsDir: join(claudeDir, 'commands'),
      agentsDir: join(claudeDir, 'agents'),
      skillsDir: join(claudeDir, 'skills'),
      mcpFile: null,
    };
  }
  const claudeDir = join(cwd, '.claude');
  if (scope === 'local') {
    return {
      claudeDir,
      rulesFile: null,
      settingsFile: join(claudeDir, 'settings.local.json'),
      commandsDir: null,
      agentsDir: null,
      skillsDir: null,
      mcpFile: null,
    };
  }
  // project
  return {
    claudeDir,
    rulesFile: join(cwd, 'CLAUDE.md'),
    settingsFile: join(claudeDir, 'settings.json'),
    commandsDir: join(claudeDir, 'commands'),
    agentsDir: join(claudeDir, 'agents'),
    skillsDir: join(claudeDir, 'skills'),
    mcpFile: join(cwd, '.mcp.json'),
  };
}
