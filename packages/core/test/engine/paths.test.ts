import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findIRRoot, IR_DIRNAME, LOCAL_SUBDIR } from '../../src/engine/paths.js';

describe('findIRRoot', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agentir-paths-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns ~/.agentir for user scope (regardless of existence)', () => {
    expect(findIRRoot('user', tmp)).toBe(join(homedir(), IR_DIRNAME));
  });

  it('returns null for project scope when no .agentir/ exists upward', () => {
    expect(findIRRoot('project', tmp)).toBeNull();
  });

  it('finds .agentir/ in cwd for project scope', () => {
    mkdirSync(join(tmp, IR_DIRNAME));
    expect(findIRRoot('project', tmp)).toBe(join(tmp, IR_DIRNAME));
  });

  it('walks up to find .agentir/ in an ancestor directory', () => {
    mkdirSync(join(tmp, IR_DIRNAME));
    const nested = join(tmp, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    expect(findIRRoot('project', nested)).toBe(join(tmp, IR_DIRNAME));
  });

  it('returns local subdir for local scope when project root is found', () => {
    mkdirSync(join(tmp, IR_DIRNAME));
    expect(findIRRoot('local', tmp)).toBe(join(tmp, IR_DIRNAME, LOCAL_SUBDIR));
  });

  it('returns null for local scope when no project IR exists', () => {
    expect(findIRRoot('local', tmp)).toBeNull();
  });
});
