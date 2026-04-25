import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { clineAdapter } from '../../src/cline/index.js';

const manifest = (): Manifest => ({ agentir: 1, scope: 'project', targets: ['cline'] });

describe('clineAdapter', () => {
  let cwd: string;
  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'agentir-cline-')); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

  it('writes multi-file rules in .clinerules/', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }, { id: 'style', body: 'Two-space indent.' }],
    };
    await clineAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, '.clinerules', 'main.md'))).toBe(true);
    expect(existsSync(join(cwd, '.clinerules', 'style.md'))).toBe(true);
  });

  it('writes hooks with Cline TaskStart/PreToolUse names', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        { id: 'pre-tool', events: ['tool.use.pre'], command: './pre.sh' },
        { id: 'on-start', events: ['session.start'], command: './start.sh' },
      ],
    };
    await clineAdapter.write(ir, 'project', cwd, {});
    const hooks = JSON.parse(readFileSync(join(cwd, '.cline', 'hooks.json'), 'utf8'));
    expect(hooks.hooks.PreToolUse).toBeDefined();
    expect(hooks.hooks.TaskStart).toBeDefined();
  });

  it('round-trips rules + hooks + mcp', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      hooks: [{ id: 'fmt', events: ['tool.use.post'], matcher: 'Edit', command: './fmt.sh', timeout: 30 }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await clineAdapter.write(ir, 'project', cwd, {});
    const re = await clineAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.hooks?.[0]?.command).toBe('./fmt.sh');
  });

  it('warns about unsupported resource types', async () => {
    const ir: IR = {
      manifest: manifest(),
      skills: [{ name: 's', description: 'x', body: 'y' }],
      commands: [{ name: 'c', body: 'b' }],
      agents: [{ name: 'a', body: 'b' }],
    };
    const report = await clineAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('skills'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('agents'))).toBe(true);
  });
});
