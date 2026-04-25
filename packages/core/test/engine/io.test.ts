import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IRValidationError,
  defaultIRRoot,
  readIR,
  writeIR,
} from '../../src/engine/io.js';
import type { IR, Manifest } from '../../src/ir/types.js';

const baseManifest = (overrides: Partial<Manifest> = {}): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['claude'],
  ...overrides,
});

const fullIR = (manifest: Manifest): IR => ({
  manifest,
  rules: [
    { id: 'main', body: '# Project rules\n\nBe terse.', order: 1 },
    { id: 'style', body: 'Two-space indent.' },
  ],
  skills: [
    {
      name: 'review',
      description: 'Review code',
      body: '# Review steps\n\n1. read\n2. comment',
      allowed_tools: ['Read'],
    },
  ],
  commands: [
    { name: 'plan', body: 'Make a plan.', description: 'Trigger planning' },
  ],
  agents: [
    { name: 'planner', body: 'You are the planner.', model: 'claude-sonnet-4-6' },
  ],
  hooks: [
    {
      id: 'fmt-on-edit',
      events: ['tool.use.post'],
      matcher: 'Edit|Write',
      command: './scripts/fmt.sh',
      timeout: 30,
    },
  ],
  mcp_servers: [
    {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
  ],
  permissions: { allow: ['Read(*)'], deny: ['Bash(rm -rf:*)'] },
  env: { DEBUG: 'true' },
});

describe('defaultIRRoot', () => {
  it('returns project .agentir/ for project scope', () => {
    expect(defaultIRRoot('project', '/x/y')).toBe('/x/y/.agentir');
  });

  it('returns project .agentir/local/ for local scope', () => {
    expect(defaultIRRoot('local', '/x/y')).toBe('/x/y/.agentir/local');
  });

  it('returns ~/.agentir for user scope', () => {
    expect(defaultIRRoot('user', '/anything')).toMatch(/\.agentir$/);
  });
});

describe('readIR / writeIR', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'agentir-io-'));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('round-trips a minimal IR', async () => {
    const ir: IR = { manifest: baseManifest() };
    await writeIR(ir, 'project', cwd);
    const re = await readIR('project', cwd);
    expect(re).toEqual(ir);
  });

  it('round-trips a full IR with all resource types', async () => {
    const ir = fullIR(baseManifest());
    await writeIR(ir, 'project', cwd);
    const re = await readIR('project', cwd);
    // Compare with deep equality; field order in arrays should be preserved
    expect(re.manifest).toEqual(ir.manifest);
    expect(re.rules).toEqual(ir.rules);
    expect(re.skills).toEqual(ir.skills);
    expect(re.commands).toEqual(ir.commands);
    expect(re.agents).toEqual(ir.agents);
    expect(re.hooks).toEqual(ir.hooks);
    expect(re.mcp_servers).toEqual(ir.mcp_servers);
    expect(re.permissions).toEqual(ir.permissions);
    expect(re.env).toEqual(ir.env);
  });

  it('throws when no .agentir/ exists', async () => {
    await expect(readIR('project', cwd)).rejects.toThrow(/no \.agentir/i);
  });

  it('throws when manifest.yaml is missing', async () => {
    mkdirSync(join(cwd, '.agentir'));
    await expect(readIR('project', cwd)).rejects.toThrow(/manifest/i);
  });

  it('throws IRValidationError on schema-invalid IR', async () => {
    const bad: IR = {
      // @ts-expect-error intentionally invalid
      manifest: { agentir: 99, scope: 'global', targets: [] },
    };
    await expect(writeIR(bad, 'project', cwd)).rejects.toThrow(IRValidationError);
  });

  it('handles a written manifest with extra fields by failing schema check on read', async () => {
    const root = join(cwd, '.agentir');
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, 'manifest.yaml'),
      'agentir: 1\nscope: project\ntargets:\n  - claude\nbogus: yes\n',
      'utf8',
    );
    await expect(readIR('project', cwd)).rejects.toThrow(IRValidationError);
  });

  it('writes manifest.yaml with stable formatting', async () => {
    await writeIR({ manifest: baseManifest() }, 'project', cwd);
    const text = readFileSync(join(cwd, '.agentir', 'manifest.yaml'), 'utf8');
    expect(text).toContain('agentir: 1');
    expect(text).toContain('scope: project');
  });
});
