import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { codexAdapter } from '../../src/codex/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['codex'],
});

describe('codexAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-codex-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes AGENTS.md, .codex/config.toml, prompts, agents, skills', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: '# Rules\n\nBe terse.' }],
      commands: [{ name: 'plan', body: 'Plan tasks' }],
      agents: [{ name: 'planner', body: 'You are the planner.', model: 'gpt-5' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      hooks: [{ id: 'pre-bash', events: ['tool.use.pre'], matcher: 'Bash', command: './pre.sh' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      env: { DEBUG: 'true' },
    };
    const report = await codexAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.codex', 'config.toml'))).toBe(true);
    expect(existsSync(join(cwd, '.codex', 'prompts', 'plan.md'))).toBe(true);
    expect(existsSync(join(cwd, '.codex', 'agents', 'planner.toml'))).toBe(true);
    expect(existsSync(join(cwd, '.codex', 'skills', 'review', 'SKILL.md'))).toBe(true);

    const toml = readFileSync(join(cwd, '.codex', 'config.toml'), 'utf8');
    expect(toml).toContain('codex_hooks = true');
    expect(toml).toContain('Bash');
    expect(toml).toContain('DEBUG');
    expect(report.warnings).toEqual([]);
  });

  it('warns when a tool.use.* hook uses a non-Bash matcher', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        { id: 'edit', events: ['tool.use.post'], matcher: 'Edit|Write', command: './fmt.sh' },
      ],
    };
    const report = await codexAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('ineffective'))).toBe(true);
  });

  it('drops hooks with no Codex event equivalent', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [{ id: 'idle', events: ['agent.idle'], command: 'echo' }],
    };
    const report = await codexAdapter.write(ir, 'project', cwd, {});
    expect(report.skipped.length).toBe(1);
    expect(report.warnings.some((w) => w.includes('agent.idle'))).toBe(true);
  });

  it('round-trips rules + commands + skills + mcp + env', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      commands: [{ name: 'plan', body: 'Plan tasks', description: 'planning' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      env: { DEBUG: 'true' },
    };
    await codexAdapter.write(ir, 'project', cwd, {});
    const re = await codexAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.commands).toEqual(ir.commands);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.env).toEqual(ir.env);
  });

  it('round-trips agents through TOML', async () => {
    const ir: IR = {
      manifest: manifest(),
      agents: [
        {
          name: 'planner',
          body: 'You plan.',
          description: 'plans',
          model: 'gpt-5',
          tools: ['Read', 'Grep'],
        },
      ],
    };
    await codexAdapter.write(ir, 'project', cwd, {});
    const re = await codexAdapter.read('project', cwd);
    expect(re.agents).toEqual(ir.agents);
  });
});
