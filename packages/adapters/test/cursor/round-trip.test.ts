import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { cursorAdapter } from '../../src/cursor/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['cursor'],
});

describe('cursorAdapter', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-cursor-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes AGENTS.md, skills, hooks, MCP', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      hooks: [
        { id: 'pre-tool', events: ['tool.use.pre'], matcher: 'Edit', command: './pre.sh' },
        { id: 'shell-pre', events: ['shell.exec.pre'], command: './shell-pre.sh' },
      ],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    const report = await cursorAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor', 'skills', 'review', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor', 'hooks.json'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor', 'mcp.json'))).toBe(true);

    const hooks = JSON.parse(readFileSync(join(cwd, '.cursor', 'hooks.json'), 'utf8'));
    expect(hooks.hooks.preToolUse).toBeDefined();             // tool.use.pre → preToolUse
    expect(hooks.hooks.beforeShellExecution).toBeDefined();   // shell.exec.pre → beforeShellExecution
    expect(report.warnings).toEqual([]);
  });

  it('round-trips rules + skills + mcp + hooks', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      hooks: [
        { id: 'fmt', events: ['tool.use.post'], matcher: 'Edit', command: './fmt.sh', timeout: 30 },
      ],
    };
    await cursorAdapter.write(ir, 'project', cwd, {});
    const re = await cursorAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.hooks?.[0]?.events).toEqual(['tool.use.post']);
    expect(re.hooks?.[0]?.command).toBe('./fmt.sh');
  });

  it('warns about commands and unsupported features', async () => {
    const ir: IR = {
      manifest: manifest(),
      commands: [{ name: 'c', body: 'b' }],
      env: { X: 'y' },
    };
    const report = await cursorAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('env'))).toBe(true);
  });
});
