import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeAdapter } from '@leclabs/agentir-adapters/claude';
import { opencodeAdapter } from '@leclabs/agentir-adapters/opencode';
import { runInit } from '../src/commands/init.js';
import { runImport } from '../src/commands/import.js';
import { runCompile } from '../src/commands/compile.js';
import { runLint } from '../src/commands/lint.js';

const adapters = [claudeAdapter, opencodeAdapter];

function buildClaudeFixture(cwd: string): void {
  writeFileSync(join(cwd, 'CLAUDE.md'), '# Project rules\n\nBe terse.', 'utf8');
  const claude = join(cwd, '.claude');
  mkdirSync(claude, { recursive: true });
  writeFileSync(
    join(claude, 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          PostToolUse: [
            { matcher: 'Edit', hooks: [{ type: 'command', command: './fmt.sh', timeout: 30 }] },
          ],
        },
        permissions: { allow: ['Read(*)'] },
      },
      null,
      2,
    ),
    'utf8',
  );
}

describe('CLI commands (integration)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-cli-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('init creates .agentir/ with manifest and resource dirs', async () => {
    const code = await runInit({ scope: 'project', cwd });
    expect(code).toBe(0);
    expect(existsSync(join(cwd, '.agentir', 'manifest.yaml'))).toBe(true);
    expect(existsSync(join(cwd, '.agentir', 'rules'))).toBe(true);
    expect(existsSync(join(cwd, '.agentir', 'hooks'))).toBe(true);
  });

  it('init refuses to overwrite an existing .agentir/', async () => {
    await runInit({ scope: 'project', cwd });
    const code = await runInit({ scope: 'project', cwd });
    expect(code).toBe(1);
  });

  it('init appends to an existing .gitignore on project scope', async () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules/\n', 'utf8');
    await runInit({ scope: 'project', cwd });
    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toContain('.agentir/local/');
  });

  it('import claude lifts a real .claude/ tree into the IR', async () => {
    buildClaudeFixture(cwd);
    await runInit({ scope: 'project', cwd });
    const code = await runImport({ client: 'claude', scope: 'project', cwd }, adapters);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, '.agentir', 'rules', 'main.md'))).toBe(true);
    expect(existsSync(join(cwd, '.agentir', 'hooks'))).toBe(true);
    expect(existsSync(join(cwd, '.agentir', 'permissions.yaml'))).toBe(true);
  });

  it('full flow: init → import claude → compile opencode produces opencode files', async () => {
    buildClaudeFixture(cwd);
    await runInit({ scope: 'project', cwd });
    await runImport({ client: 'claude', scope: 'project', cwd }, adapters);

    // Add opencode to manifest targets so default compile picks it up.
    const manifestPath = join(cwd, '.agentir', 'manifest.yaml');
    const text = readFileSync(manifestPath, 'utf8');
    writeFileSync(manifestPath, text.replace('targets:\n  - claude', 'targets:\n  - claude\n  - opencode'), 'utf8');

    const code = await runCompile({ scope: 'project', cwd }, adapters);
    expect(code).toBe(0);
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.yaml'))).toBe(true);
    expect(existsSync(join(cwd, '.opencode', 'plugins', 'agentir-hooks.ts'))).toBe(true);
  });

  it('lint reports unsupported resource per declared target', async () => {
    buildClaudeFixture(cwd);
    await runInit({ scope: 'project', cwd });
    await runImport({ client: 'claude', scope: 'project', cwd }, adapters);
    // Add a command (which opencode does not support) and add opencode to targets
    const cmdDir = join(cwd, '.agentir', 'commands');
    mkdirSync(cmdDir, { recursive: true });
    writeFileSync(
      join(cmdDir, 'review.md'),
      '---\ndescription: Review code\n---\nReview the diff.',
      'utf8',
    );
    const manifestPath = join(cwd, '.agentir', 'manifest.yaml');
    const text = readFileSync(manifestPath, 'utf8');
    writeFileSync(
      manifestPath,
      text.replace('targets:\n  - claude', 'targets:\n  - claude\n  - opencode'),
      'utf8',
    );

    // Capture stdout
    const messages: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      messages.push(args.join(' '));
    };
    try {
      const code = await runLint({ scope: 'project', cwd }, adapters);
      expect(code).toBe(0);
      expect(messages.some((m) => m.includes('opencode') && m.includes('commands'))).toBe(true);
    } finally {
      console.log = origLog;
    }
  });
});
