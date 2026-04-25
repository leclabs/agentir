import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { copilotAdapter } from '../../src/copilot/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['copilot'],
});

describe('copilotAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-copilot-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes AGENTS.md, skills, MCP, and hooks to Copilot-readable locations', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: '# Rules\n\nBe terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      hooks: [
        {
          id: 'fmt',
          events: ['tool.use.post'],
          matcher: 'Edit',
          command: './fmt.sh',
          timeout: 15,
        },
      ],
      mcp_servers: [{ name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    const report = await copilotAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.copilot', 'skills', 'review', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.vscode', 'mcp.json'))).toBe(true);
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Edit');
    expect(report.warnings).toEqual([]);
  });

  it('drops hooks that have no Copilot event equivalent', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        // notification has no copilot equivalent (only 8 events supported)
        { id: 'notify', events: ['notification'], command: 'echo' },
      ],
    };
    const report = await copilotAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(false);
  });

  it('merges into an existing .claude/settings.json (does not clobber Claude-only fields)', async () => {
    mkdirSync(join(cwd, '.claude'));
    writeFileSync(
      join(cwd, '.claude', 'settings.json'),
      JSON.stringify({
        permissions: { allow: ['Read(*)'] },
        env: { CLAUDE_OWNED: 'yes' },
        hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo claude-stop' }] }] },
      }),
      'utf8',
    );
    const ir: IR = {
      manifest: manifest(),
      hooks: [{ id: 'fmt', events: ['tool.use.post'], command: './fmt.sh' }],
    };
    await copilotAdapter.write(ir, 'project', cwd, {});
    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.permissions).toEqual({ allow: ['Read(*)'] });
    expect(settings.env).toEqual({ CLAUDE_OWNED: 'yes' });
    expect(settings.hooks.Stop).toBeDefined();        // pre-existing
    expect(settings.hooks.PostToolUse).toBeDefined(); // newly added
  });

  it('round-trips rules + skills + mcp', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
    };
    await copilotAdapter.write(ir, 'project', cwd, {});
    const re = await copilotAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
  });

  it('warns about unsupported resource types', async () => {
    const ir: IR = {
      manifest: manifest(),
      commands: [{ name: 'c', body: 'b' }],
      agents: [{ name: 'a', body: 'b' }],
      permissions: { allow: ['Read(*)'] },
      env: { X: 'y' },
    };
    const report = await copilotAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('agents'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('permissions'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('env'))).toBe(true);
  });
});
