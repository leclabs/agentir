import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface CodexPaths {
  rulesFile: string;        // AGENTS.md
  configFile: string;       // ~/.codex/config.toml or <repo>/.codex/config.toml
  promptsDir: string;       // commands as .md prompts
  agentsDir: string;        // .toml subagent files
  skillsDir: string;        // skills/<name>/SKILL.md
  codexDir: string;         // .codex/ root
}

/**
 * Resolve Codex CLI config paths.
 *
 * - user:    ~/.codex/{config.toml, prompts/, agents/, skills/} + ~/AGENTS.md (or per-project AGENTS.md)
 * - project: <cwd>/{AGENTS.md, .codex/config.toml, .codex/prompts/, .codex/agents/, .codex/skills/}
 */
export function paths(scope: Scope, cwd: string): CodexPaths {
  if (scope === 'user') {
    const codexDir = join(homedir(), '.codex');
    return {
      codexDir,
      rulesFile: join(codexDir, 'AGENTS.md'),
      configFile: join(codexDir, 'config.toml'),
      promptsDir: join(codexDir, 'prompts'),
      agentsDir: join(codexDir, 'agents'),
      skillsDir: join(codexDir, 'skills'),
    };
  }
  const codexDir = join(cwd, '.codex');
  return {
    codexDir,
    rulesFile: join(cwd, 'AGENTS.md'),
    configFile: join(codexDir, 'config.toml'),
    promptsDir: join(codexDir, 'prompts'),
    agentsDir: join(codexDir, 'agents'),
    skillsDir: join(codexDir, 'skills'),
  };
}
