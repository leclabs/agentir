import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../../src/engine/compile.js';
import { detectDrift } from '../../src/engine/drift.js';
import type { Adapter, AdapterCapabilities, WriteReport } from '../../src/adapter/types.js';
import type { IR, Manifest } from '../../src/ir/types.js';

const caps: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'full',
    commands: 'full',
    agents: 'full',
    hooks: 'full',
    mcp: 'full',
    permissions: 'full',
    env: 'full',
  },
  hooks: { supported: [], matchers: 'glob', payload: 'claude-json' },
  scopes: ['user', 'project', 'local'],
};

function adapter(
  id: string,
  write: (cwd: string) => Promise<WriteReport>,
): Adapter {
  return {
    id,
    capabilities: caps,
    detect: async () => true,
    read: async () => ({}),
    write: async (_ir, _scope, cwd) => write(cwd),
  };
}

const manifest: Manifest = { agentir: 1, scope: 'project', targets: ['claude'] };
const ir: IR = { manifest };

describe('compile', () => {
  let cwd: string;
  let stateDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-compile-'));
    stateDir = join(cwd, '.agentir');
    mkdirSync(stateDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('aggregates write counts across adapters', async () => {
    const a = adapter('a', async () => ({
      written: ['out1.txt', 'out2.txt'],
      skipped: [],
      warnings: [],
    }));
    const b = adapter('b', async () => ({
      written: ['out3.txt'],
      skipped: [{ path: 'x', reason: 'unsupported' }],
      warnings: ['warning text'],
    }));
    const report = await compile(ir, [a, b], 'project', cwd);
    expect(report.totalWritten).toBe(3);
    expect(report.totalSkipped).toBe(1);
    expect(report.totalWarnings).toBe(1);
    expect(report.results.map((r) => r.adapter)).toEqual(['a', 'b']);
  });

  it('continues past adapter failure when not strict', async () => {
    const broken = adapter('broken', async () => {
      throw new Error('boom');
    });
    const ok = adapter('ok', async () => ({ written: [], skipped: [], warnings: [] }));
    const report = await compile(ir, [broken, ok], 'project', cwd);
    expect(report.results[0]?.error?.message).toBe('boom');
    expect(report.results[1]?.error).toBeUndefined();
  });

  it('aborts on first warning under strict mode', async () => {
    const a = adapter('a', async () => ({
      written: [],
      skipped: [],
      warnings: ['something'],
    }));
    const b = adapter('b', async () => ({ written: [], skipped: [], warnings: [] }));
    const report = await compile(ir, [a, b], 'project', cwd, { strict: true });
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.error?.message).toMatch(/strict/);
  });

  it('records drift state when stateDir is provided and not dry-run', async () => {
    const outFile = join(cwd, 'output.txt');
    writeFileSync(outFile, 'content');
    const a = adapter('a', async () => ({
      written: [outFile],
      skipped: [],
      warnings: [],
    }));
    await compile(ir, [a], 'project', cwd, { stateDir });
    const drift = await detectDrift(stateDir, 'a', cwd);
    expect(drift.cleanCount).toBe(1);
  });

  it('does not record state in dry-run mode', async () => {
    const outFile = join(cwd, 'phantom.txt');
    writeFileSync(outFile, 'x');
    const a = adapter('a', async () => ({
      written: [outFile],
      skipped: [],
      warnings: [],
    }));
    await compile(ir, [a], 'project', cwd, { stateDir, dryRun: true });
    const drift = await detectDrift(stateDir, 'a', cwd);
    expect(drift.cleanCount).toBe(0);
  });
});
