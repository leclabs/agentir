import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IR, Manifest } from '@leclabs/agentir-core';
import { claudeAdapter } from '../../src/claude/index.js';

const manifest = (): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['claude'],
});

function buildFixture(cwd: string): void {
  // CLAUDE.md at repo root
  writeFileSync(
    join(cwd, 'CLAUDE.md'),
    '# Project rules\n\nBe terse. Avoid emoji.',
    'utf8',
  );
  // .claude/ tree
  const claude = join(cwd, '.claude');
  mkdirSync(claude, { recursive: true });
  writeFileSync(
    join(claude, 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: 'Edit|Write',
              hooks: [{ type: 'command', command: './scripts/format.sh', timeout: 30 }],
            },
          ],
          Stop: [{ hooks: [{ type: 'command', command: 'notify-send done' }] }],
        },
        permissions: { allow: ['Read(*)'], deny: ['Bash(rm -rf:*)'] },
        env: { DEBUG: 'true' },
        mcpServers: {
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: 'xxx' },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  // Commands
  mkdirSync(join(claude, 'commands'));
  writeFileSync(
    join(claude, 'commands', 'plan.md'),
    '---\ndescription: Trigger planning\n---\nMake a plan.',
    'utf8',
  );
  // Agents
  mkdirSync(join(claude, 'agents'));
  writeFileSync(
    join(claude, 'agents', 'planner.md'),
    '---\ndescription: Plans tasks\nmodel: claude-sonnet-4-6\n---\nYou are the planner.',
    'utf8',
  );
  // Skills
  const skill = join(claude, 'skills', 'review');
  mkdirSync(skill, { recursive: true });
  writeFileSync(
    join(skill, 'SKILL.md'),
    '---\nname: review\ndescription: Review code\n---\n# How to review\n\n1. read\n2. comment',
    'utf8',
  );
}

describe('claudeAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-claude-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('detect() returns true when .claude/ exists', async () => {
    expect(await claudeAdapter.detect('project', cwd)).toBe(false);
    buildFixture(cwd);
    expect(await claudeAdapter.detect('project', cwd)).toBe(true);
  });

  it('read() lifts a .claude/ tree into IR', async () => {
    buildFixture(cwd);
    const ir = await claudeAdapter.read('project', cwd);
    expect(ir.rules?.[0]?.body).toContain('Be terse');
    expect(ir.hooks).toHaveLength(2);

    const editHook = ir.hooks?.find((h) => h.matcher === 'Edit|Write');
    expect(editHook?.events).toEqual(['tool.use.pre']);
    expect(editHook?.command).toBe('./scripts/format.sh');
    expect(editHook?.timeout).toBe(30);

    const stopHook = ir.hooks?.find((h) => h.events.includes('turn.end'));
    expect(stopHook?.command).toBe('notify-send done');

    expect(ir.permissions?.allow).toEqual(['Read(*)']);
    expect(ir.env).toEqual({ DEBUG: 'true' });

    expect(ir.mcp_servers).toHaveLength(1);
    expect(ir.mcp_servers?.[0]).toMatchObject({
      name: 'github',
      transport: 'stdio',
      command: 'npx',
    });

    expect(ir.commands?.[0]?.name).toBe('plan');
    expect(ir.agents?.[0]?.name).toBe('planner');
    expect(ir.skills?.[0]?.name).toBe('review');
    expect(ir.skills?.[0]?.description).toBe('Review code');
  });

  it('write() emits a valid .claude/ tree', async () => {
    const ir: IR = {
      manifest: manifest(),
      rules: [{ id: 'main', body: '# Rules\n\nBe terse.' }],
      hooks: [
        {
          id: 'fmt',
          events: ['tool.use.post'],
          matcher: 'Edit',
          command: './fmt.sh',
          timeout: 15,
        },
      ],
      commands: [{ name: 'review', body: 'Review the diff.' }],
    };
    const report = await claudeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.written.some((p) => p.endsWith('CLAUDE.md'))).toBe(true);
    expect(report.written.some((p) => p.endsWith('settings.json'))).toBe(true);

    expect(existsSync(join(cwd, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(cwd, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(cwd, '.claude', 'commands', 'review.md'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(cwd, '.claude', 'settings.json'), 'utf8'));
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse[0]).toMatchObject({
      matcher: 'Edit',
      hooks: [{ type: 'command', command: './fmt.sh', timeout: 15 }],
    });
  });

  it('round-trips: read(write(read(fixture))) === read(fixture)', async () => {
    buildFixture(cwd);
    const ir1 = await claudeAdapter.read('project', cwd);

    // Write to a fresh dir, then read back
    const cwd2 = mkdtempSync(join(tmpdir(), 'agentir-claude-rt-'));
    try {
      await claudeAdapter.write({ manifest: manifest(), ...ir1 }, 'project', cwd2, {});
      const ir2 = await claudeAdapter.read('project', cwd2);
      // Compare resource fields (manifest is added by caller, not by read)
      expect(ir2.rules).toEqual(ir1.rules);
      expect(ir2.commands).toEqual(ir1.commands);
      expect(ir2.agents).toEqual(ir1.agents);
      expect(ir2.skills).toEqual(ir1.skills);
      expect(ir2.permissions).toEqual(ir1.permissions);
      expect(ir2.env).toEqual(ir1.env);
      expect(ir2.mcp_servers).toEqual(ir1.mcp_servers);
      // Hooks: ids regenerate via counter so compare structurally
      expect(ir2.hooks?.length).toBe(ir1.hooks?.length);
      for (let i = 0; i < (ir1.hooks?.length ?? 0); i++) {
        const a = ir1.hooks![i]!;
        const b = ir2.hooks![i]!;
        expect(b.events).toEqual(a.events);
        expect(b.matcher).toBe(a.matcher);
        expect(b.command).toBe(a.command);
        expect(b.timeout).toBe(a.timeout);
      }
    } finally {
      rmSync(cwd2, { recursive: true, force: true });
    }
  });

  it('warns + skips when a hook uses a canonical event with no Claude equivalent', async () => {
    const ir: IR = {
      manifest: manifest(),
      hooks: [
        {
          id: 'opencode-only',
          events: ['model.request.pre'],
          command: 'echo x',
        },
      ],
    };
    const report = await claudeAdapter.write(ir, 'project', cwd, {});
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toContain('model.request.pre');
  });
});
