import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { crushAdapter } from '../../src/crush/index.js';

const manifest = (): Manifest => ({ agentir: 1, scope: 'project', targets: ['crush'] });

describe('crushAdapter', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'agentir-crush-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

  it('writes AGENTS.md, skills, mcp', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await crushAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.crush', 'skills', 'review', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.crush', 'mcp.json'))).toBe(true);
  });

  it('round-trips rules + skills + mcp', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await crushAdapter.write(ir, 'project', cwd, {});
    const re = await crushAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
  });

  it('warns about hooks/commands/agents (unsupported)', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [{ id: 'h', events: ['turn.end'], command: 'echo' }],
      commands: [{ name: 'c', body: 'b' }],
      agents: [{ name: 'a', body: 'b' }],
    };
    const report = await crushAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('hooks'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('agents'))).toBe(true);
  });
});
