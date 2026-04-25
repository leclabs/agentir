import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectDrift,
  hashFile,
  recordCompileState,
  STATE_FILENAME,
} from '../../src/engine/drift.js';

describe('drift', () => {
  let cwd: string;
  let stateDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-drift-'));
    stateDir = join(cwd, '.agentir');
    mkdirSync(stateDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('hashes a file deterministically', async () => {
    const f = join(cwd, 'a.txt');
    writeFileSync(f, 'hello');
    const a = await hashFile(f);
    const b = await hashFile(f);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records and detects clean state with no drift', async () => {
    const f = join(cwd, 'out.txt');
    writeFileSync(f, 'one');
    await recordCompileState(stateDir, 'claude', cwd, [f]);
    const report = await detectDrift(stateDir, 'claude', cwd);
    expect(report.drifted).toEqual([]);
    expect(report.cleanCount).toBe(1);
  });

  it('detects modified files', async () => {
    const f = join(cwd, 'out.txt');
    writeFileSync(f, 'one');
    await recordCompileState(stateDir, 'claude', cwd, [f]);
    writeFileSync(f, 'two'); // mutate after record
    const report = await detectDrift(stateDir, 'claude', cwd);
    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0]).toMatchObject({
      path: 'out.txt',
      status: 'modified',
    });
    expect(report.cleanCount).toBe(0);
  });

  it('detects deleted files', async () => {
    const f = join(cwd, 'out.txt');
    writeFileSync(f, 'one');
    await recordCompileState(stateDir, 'claude', cwd, [f]);
    unlinkSync(f);
    const report = await detectDrift(stateDir, 'claude', cwd);
    expect(report.drifted).toHaveLength(1);
    expect(report.drifted[0]).toMatchObject({
      path: 'out.txt',
      status: 'missing',
      currentHash: null,
    });
  });

  it('returns empty report for unknown adapter', async () => {
    const report = await detectDrift(stateDir, 'never-recorded', cwd);
    expect(report.drifted).toEqual([]);
    expect(report.cleanCount).toBe(0);
  });

  it('preserves state for other adapters when recording', async () => {
    const a = join(cwd, 'a.txt');
    const b = join(cwd, 'b.txt');
    writeFileSync(a, 'a');
    writeFileSync(b, 'b');
    await recordCompileState(stateDir, 'claude', cwd, [a]);
    await recordCompileState(stateDir, 'opencode', cwd, [b]);
    const claude = await detectDrift(stateDir, 'claude', cwd);
    const opencode = await detectDrift(stateDir, 'opencode', cwd);
    expect(claude.cleanCount).toBe(1);
    expect(opencode.cleanCount).toBe(1);
  });

  it('writes the state file at <stateDir>/.compile-state.json', async () => {
    const f = join(cwd, 'out.txt');
    writeFileSync(f, 'x');
    await recordCompileState(stateDir, 'claude', cwd, [f]);
    expect(() => statSync(join(stateDir, STATE_FILENAME))).not.toThrow();
  });

  it('normalizes paths to be relative to cwd', async () => {
    mkdirSync(join(cwd, 'sub'));
    const f = join(cwd, 'sub', 'nested.txt');
    writeFileSync(f, 'x');
    await recordCompileState(stateDir, 'claude', cwd, [f]);
    const report = await detectDrift(stateDir, 'claude', cwd);
    expect(report.cleanCount).toBe(1);
  });
});
