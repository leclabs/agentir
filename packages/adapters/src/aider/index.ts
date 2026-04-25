import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  parseRule,
  type Adapter,
  type AdapterCapabilities,
  type IR,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';

/**
 * Aider — minimal adapter. Aider has no agent-lifecycle hooks, skills,
 * commands, subagents, or MCP. Only AGENTS.md (or CONVENTIONS.md by Aider's
 * own convention) for rules. Demonstrates the minimum-viable adapter shape.
 */

function rulesPath(scope: Scope, cwd: string): string {
  if (scope === 'user') return join(process.env.HOME ?? '/', 'AGENTS.md');
  return join(cwd, 'AGENTS.md');
}

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'none',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'none',
    permissions: 'none',
    env: 'none',
  },
  hooks: { supported: [], matchers: 'none', payload: 'native' },
  scopes: ['user', 'project'],
};

export const aiderAdapter: Adapter = {
  id: 'aider',
  capabilities,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    return existsSync(rulesPath(scope, cwd));
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    const path = rulesPath(scope, cwd);
    if (!existsSync(path)) return {};
    return { rules: [parseRule(await readFile(path, 'utf8'), 'main')] };
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts = {}): Promise<WriteReport> {
    const path = rulesPath(scope, cwd);
    const written: string[] = [];
    const skipped: { path: string; reason: string }[] = [];
    const warnings: string[] = [];

    if (ir.rules?.length) {
      const body = ir.rules.map((r: { body: string }) => r.body).join('\n\n');
      if (!opts.dryRun) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${body}\n`, 'utf8');
      }
      written.push(path);
    }

    for (const [field, label] of [
      ['skills', 'skills'], ['commands', 'commands'], ['agents', 'agents'], ['hooks', 'hooks'],
    ] as const) {
      const items = ir[field];
      if (items && items.length) {
        warnings.push(`${label}: Aider has no ${label} support (${items.length} skipped)`);
        for (const i of items) {
          const id = (i as { name?: string; id?: string }).name ?? (i as { id?: string }).id ?? '?';
          skipped.push({ path: `${label}/${id}`, reason: 'unsupported' });
        }
      }
    }
    if (ir.mcp_servers?.length) {
      warnings.push(`mcp: Aider has no MCP support (${ir.mcp_servers.length} skipped)`);
    }

    return { written, skipped, warnings };
  },
};
export default aiderAdapter;
