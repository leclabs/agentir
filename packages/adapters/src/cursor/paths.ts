import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from '@leclabs/agentir-core';

export interface CursorPaths {
  rulesFile: string;     // AGENTS.md (or first .cursor/rules/*.mdc)
  rulesDir: string;      // .cursor/rules/ for multi-file rules
  skillsDir: string;
  hooksFile: string;     // .cursor/hooks.json
  mcpFile: string;       // .cursor/mcp.json
  cursorDir: string;
}

export function paths(scope: Scope, cwd: string): CursorPaths {
  if (scope === 'user') {
    const cursorDir = join(homedir(), '.cursor');
    return {
      cursorDir,
      rulesFile: join(cursorDir, 'AGENTS.md'),
      rulesDir: join(cursorDir, 'rules'),
      skillsDir: join(cursorDir, 'skills'),
      hooksFile: join(cursorDir, 'hooks.json'),
      mcpFile: join(cursorDir, 'mcp.json'),
    };
  }
  const cursorDir = join(cwd, '.cursor');
  return {
    cursorDir,
    rulesFile: join(cwd, 'AGENTS.md'),
    rulesDir: join(cursorDir, 'rules'),
    skillsDir: join(cursorDir, 'skills'),
    hooksFile: join(cursorDir, 'hooks.json'),
    mcpFile: join(cursorDir, 'mcp.json'),
  };
}
