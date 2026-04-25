import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { aiderAdapter } from '../../src/aider/index.js';

const manifest = (): Manifest => ({ agentir: 1, scope: 'project', targets: ['aider'] });

describe('aiderAdapter', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'agentir-aider-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

  it('writes AGENTS.md', async () => {
    const ir: IR = { manifest: manifest(), rules: [{ id: 'main', body: 'Be terse.' }] };
    await aiderAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
  });

  it('round-trips rules', async () => {
    const ir: IR = { manifest: manifest(), rules: [{ id: 'main', body: 'Be terse.' }] };
    await aiderAdapter.write(ir, 'project', cwd, {});
    const re = await aiderAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
  });

  it('warns about every other resource type (Aider supports nothing else)', async () => {
    const ir: IR = {
      manifest: manifest(),
      skills: [{ name: 's', description: 'x', body: 'y' }],
      hooks: [{ id: 'h', events: ['turn.end'], command: 'x' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'x' }],
    };
    const report = await aiderAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
