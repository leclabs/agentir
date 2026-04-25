import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface GeminiPaths {
  rulesFile: string;     // AGENTS.md
  settingsFile: string;  // settings.json (hooks, mcp, permissions, env)
  agentsDir: string;     // subagent extensions
  skillsDir: string;     // skill directories
  geminiDir: string;
}

/**
 * Resolve Gemini CLI config paths.
 *
 * - user:    ~/.gemini/{AGENTS.md, settings.json, agents/, skills/}
 * - project: <cwd>/{AGENTS.md, .gemini/settings.json, .gemini/agents/, .gemini/skills/}
 */
export function paths(scope: Scope, cwd: string): GeminiPaths {
  if (scope === 'user') {
    const geminiDir = join(homedir(), '.gemini');
    return {
      geminiDir,
      rulesFile: join(geminiDir, 'AGENTS.md'),
      settingsFile: join(geminiDir, 'settings.json'),
      agentsDir: join(geminiDir, 'agents'),
      skillsDir: join(geminiDir, 'skills'),
    };
  }
  const geminiDir = join(cwd, '.gemini');
  return {
    geminiDir,
    rulesFile: join(cwd, 'AGENTS.md'),
    settingsFile: join(geminiDir, 'settings.json'),
    agentsDir: join(geminiDir, 'agents'),
    skillsDir: join(geminiDir, 'skills'),
  };
}
