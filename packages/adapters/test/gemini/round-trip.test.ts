import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { geminiAdapter } from '../../src/gemini/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['gemini'],
});

describe('geminiAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-gemini-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes AGENTS.md, settings.json, agents, skills', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: '# Rules\n\nBe terse.' }],
      agents: [{ name: 'planner', body: 'You plan.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      hooks: [
        { id: 'pre-tool', events: ['tool.use.pre'], matcher: 'Bash', command: './pre.sh' },
        { id: 'after-model', events: ['model.response.post'], command: './log-model.sh' },
      ],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      env: { DEBUG: 'true' },
    };
    const report = await geminiAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.gemini', 'settings.json'))).toBe(true);
    expect(existsSync(join(cwd, '.gemini', 'agents', 'planner.md'))).toBe(true);
    expect(existsSync(join(cwd, '.gemini', 'skills', 'review', 'SKILL.md'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(cwd, '.gemini', 'settings.json'), 'utf8'));
    expect(settings.hooks.BeforeTool).toBeDefined();   // tool.use.pre → BeforeTool
    expect(settings.hooks.AfterModel).toBeDefined();   // model.response.post → AfterModel
    expect(settings.mcpServers.gh).toBeDefined();
    expect(settings.env.DEBUG).toBe('true');
    expect(report.warnings).toEqual([]);
  });

  it('drops hooks with no Gemini event equivalent', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [{ id: 'idle', events: ['agent.idle'], command: 'echo' }],
    };
    const report = await geminiAdapter.write(ir, 'project', cwd, {});
    expect(report.skipped.length).toBe(1);
  });

  it('round-trips rules + agents + skills + mcp + env + hooks', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      agents: [{ name: 'planner', body: 'You plan.', model: 'gemini-2.5-pro' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'gh', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      env: { DEBUG: 'true' },
      hooks: [
        { id: 'fmt', events: ['tool.use.post'], matcher: 'Edit', command: './fmt.sh' },
      ],
    };
    await geminiAdapter.write(ir, 'project', cwd, {});
    const re = await geminiAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.agents).toEqual(ir.agents);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.env).toEqual(ir.env);
    expect(re.hooks?.length).toBe(1);
    expect(re.hooks?.[0]?.events).toEqual(['tool.use.post']);
  });

  it('warns about commands and permissions DSL', async () => {
    const ir: IR = {
      manifest: manifest(),
      commands: [{ name: 'c', body: 'b' }],
      permissions: { allow: ['Read(*)'] },
    };
    const report = await geminiAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('permissions'))).toBe(true);
  });
});
