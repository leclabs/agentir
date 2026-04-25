import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface CopilotPaths {
  rulesFile: string;
  /** Skills directory (Agent Skills spec) */
  skillsDir: string;
  /**
   * Where Copilot reads hooks from. Per VS Copilot docs, the agent hooks
   * preview natively parses `.claude/settings.json`. We collide intentionally:
   * if Claude is also a target it owns this file; otherwise we write a minimal
   * version covering Copilot's 8-event subset.
   */
  hooksFile: string;
  /** MCP server registration for VS Code */
  mcpFile: string;
}

/**
 * Resolve Copilot config paths.
 *
 * - user:    ~/.config/github-copilot/{AGENTS.md, skills/, mcp.json}
 * - project: <cwd>/{AGENTS.md, .copilot/skills/, .vscode/mcp.json, .claude/settings.json}
 */
export function paths(scope: Scope, cwd: string): CopilotPaths {
  if (scope === 'user') {
    const root = join(homedir(), '.config', 'github-copilot');
    return {
      rulesFile: join(root, 'AGENTS.md'),
      skillsDir: join(root, 'skills'),
      hooksFile: join(homedir(), '.claude', 'settings.json'),
      mcpFile: join(root, 'mcp.json'),
    };
  }
  return {
    rulesFile: join(cwd, 'AGENTS.md'),
    skillsDir: join(cwd, '.copilot', 'skills'),
    hooksFile: join(cwd, '.claude', 'settings.json'),
    mcpFile: join(cwd, '.vscode', 'mcp.json'),
  };
}
