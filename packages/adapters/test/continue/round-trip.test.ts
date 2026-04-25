import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { continueAdapter } from '../../src/continue/index.js';

const manifest = (): Manifest => ({ agentir: 1, scope: 'project', targets: ['continue'] });

describe('continueAdapter', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'agentir-continue-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

  it('writes AGENTS.md and .continue/config.yaml', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await continueAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.continue', 'config.yaml'))).toBe(true);
  });

  it('round-trips rules + mcp', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await continueAdapter.write(ir, 'project', cwd, {});
    const re = await continueAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
  });

  it('warns about hooks/skills/commands/agents (unsupported)', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [{ id: 'h', events: ['turn.end'], command: 'x' }],
      skills: [{ name: 's', description: 'x', body: 'y' }],
      commands: [{ name: 'c', body: 'b' }],
    };
    const report = await continueAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
