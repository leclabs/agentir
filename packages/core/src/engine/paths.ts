import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Scope } from '../ir/types.js';

export const IR_DIRNAME = '.agentir';
export const LOCAL_SUBDIR = 'local';

/**
 * Locate the IR directory for the given scope.
 *
 * - `user`   → `~/.agentir/` (returned even if it does not exist; init creates it)
 * - `project`→ walks up from `cwd` until it finds a directory containing `.agentir/`
 * - `local`  → same as `project`, but returns `<root>/.agentir/local/`
 *
 * Returns `null` for project/local scopes when no `.agentir/` is found between
 * `cwd` and the filesystem root.
 */
export function findIRRoot(scope: Scope, cwd: string): string | null {
  if (scope === 'user') {
    return join(homedir(), IR_DIRNAME);
  }

  const projectRoot = findProjectIRRoot(cwd);
  if (!projectRoot) return null;

  if (scope === 'project') return projectRoot;
  return join(projectRoot, LOCAL_SUBDIR);
}

function findProjectIRRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, IR_DIRNAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}
