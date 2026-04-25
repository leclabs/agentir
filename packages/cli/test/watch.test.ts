import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { claudeAdapter } from '@leclabs/agentir-adapters/claude';
import { opencodeAdapter } from '@leclabs/agentir-adapters/opencode';
import { runInit } from '../src/commands/init.js';
import { runImport } from '../src/commands/import.js';
import { runWatch } from '../src/commands/watch.js';

const adapters = [claudeAdapter, opencodeAdapter];

describe('watch', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-watch-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('compiles after a file changes (maxRebuilds=1)', async () => {
    // Set up a fixture
    writeFileSync(join(cwd, 'CLAUDE.md'), '# hi', 'utf8');
    mkdirSync(join(cwd, '.claude'));
    writeFileSync(join(cwd, '.claude', 'settings.json'), '{}', 'utf8');
    await runInit({ scope: 'project', cwd });
    await runImport({ client: 'claude', scope: 'project', cwd }, adapters);
    // Add opencode to manifest
    const manifestPath = join(cwd, '.agentir', 'manifest.yaml');
    const text = readFileSync(manifestPath, 'utf8');
    writeFileSync(
      manifestPath,
      text.replace('targets:\n  - claude', 'targets:\n  - claude\n  - opencode'),
      'utf8',
    );

    // Start watch with maxRebuilds=1, then trigger a file change
    const watchPromise = runWatch(
      { scope: 'project', cwd, debounce: 50, maxRebuilds: 1 },
      adapters,
    );

    // Give chokidar time to set up watchers, then trigger a change
    await new Promise((r) => setTimeout(r, 200));
    writeFileSync(join(cwd, '.agentir', 'rules', 'main.md'), '# updated', 'utf8');

    const code = await watchPromise;
    expect(code).toBe(0);
  }, 10000);
});
