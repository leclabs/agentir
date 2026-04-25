import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { opencodeAdapter } from '../../src/opencode/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['opencode'],
});

describe('opencodeAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-oc-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('detect() returns true when AGENTS.md or .opencode/ exists', async () => {
    expect(await opencodeAdapter.detect('project', cwd)).toBe(false);
    writeFileSync(join(cwd, 'AGENTS.md'), '# rules', 'utf8');
    expect(await opencodeAdapter.detect('project', cwd)).toBe(true);
  });

  it('writes AGENTS.md from rules', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: '# Rules\n\nBe terse.' }],
    };
    const report = await opencodeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings).toEqual([]);
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toContain('Be terse');
  });

  it('writes hooks as YAML manifest + JS shim', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        {
          id: 'fmt',
          events: ['tool.use.post'],
          matcher: 'Edit',
          command: './fmt.sh',
          timeout: 15,
        },
      ],
    };
    const report = await opencodeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings).toEqual([]);
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.yaml'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.ts'))).toBe(true);

    const shim = readFileSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.ts'), 'utf8');
    expect(shim).toContain('tool.execute.after'); // canonical → opencode mapping applied
    expect(shim).toContain('./fmt.sh');
  });

  it('warns + skips hooks that have no opencode equivalent', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        // Claude-only event; no opencode mapping
        { id: 'noisy', events: ['subagent.start'], command: 'echo' },
      ],
    };
    const report = await opencodeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.ts'))).toBe(false);
  });

  it('round-trips rules + hooks via the YAML sidecar', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: 'Be terse.' }],
      hooks: [
        {
          id: 'fmt',
          events: ['tool.use.post'],
          matcher: 'Edit',
          command: './fmt.sh',
          timeout: 15,
        },
      ],
    };
    await opencodeAdapter.write(ir, 'project', cwd, {});
    const re = await opencodeAdapter.read('project', cwd);
    expect(re.rules).toEqual(ir.rules);
    expect(re.hooks).toEqual(ir.hooks);
  });

  it('warns about commands + agents (which opencode does not support)', async () => {
    const ir: IR = {
      manifest: manifest(),
      commands: [{ name: 'c', body: 'b' }],
      agents: [{ name: 'a', body: 'b' }],
    };
    const report = await opencodeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.some((w) => w.includes('commands'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('agents'))).toBe(true);
  });

  it('writes skills, MCP servers, permissions, env (Phase 2)', async () => {
    const ir: IR = {
      manifest: manifest(),
      skills: [
        { name: 'review', description: 'Review code', body: '# steps', allowed_tools: ['Read'] },
      ],
      mcp_servers: [
        { name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] },
      ],
      permissions: { allow: ['Read(*)'] },
      env: { DEBUG: 'true' },
    };
    const report = await opencodeAdapter.write(ir, 'project', cwd, {});
    expect(existsSync(join(cwd, '.opencode', 'skills', 'review', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'mcp.json'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'permissions.json'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'env.json'))).toBe(true);
    // Skill with allowed_tools triggers a 'opencode ignores allowed_tools' warning.
    expect(report.warnings.some((w) => w.includes('allowed_tools'))).toBe(true);
    // Permissions trigger a "different DSL" warning.
    expect(report.warnings.some((w) => w.includes('permissions'))).toBe(true);
  });

  it('round-trips Phase-2 resources (skills, mcp, env)', async () => {
    const ir: IR = {
      manifest: manifest(),
      skills: [{ name: 'review', description: 'Review code', body: '# steps' }],
      mcp_servers: [{ name: 'github', transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] }],
      env: { DEBUG: 'true', NODE_ENV: 'development' },
    };
    await opencodeAdapter.write(ir, 'project', cwd, {});
    const re = await opencodeAdapter.read('project', cwd);
    expect(re.skills).toEqual(ir.skills);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.env).toEqual(ir.env);
  });
});
