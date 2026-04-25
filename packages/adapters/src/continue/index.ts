import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';
import {
  parseRule,
  type Adapter,
  type AdapterCapabilities,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';

interface ContinuePaths {
  rulesFile: string;
  configFile: string;
  continueDir: string;
}

function paths(scope: Scope, cwd: string): ContinuePaths {
  if (scope === 'user') {
    const root = join(homedir(), '.continue');
    return {
      continueDir: root,
      rulesFile: join(root, 'AGENTS.md'),
      configFile: join(root, 'config.yaml'),
    };
  }
  const root = join(cwd, '.continue');
  return {
    continueDir: root,
    rulesFile: join(cwd, 'AGENTS.md'),
    configFile: join(root, 'config.yaml'),
  };
}

interface McpEntry { command?: string; args?: string[]; env?: Record<string, string>; url?: string; type?: 'stdio' | 'http' | 'sse'; headers?: Record<string, string> }

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'none',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'partial',
    permissions: 'none',
    env: 'none',
  },
  hooks: { supported: [], matchers: 'none', payload: 'native' },
  scopes: ['user', 'project'],
};

async function readImpl(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  if (existsSync(p.rulesFile)) {
    ir.rules = [parseRule(await readFile(p.rulesFile, 'utf8'), 'main')];
  }

  if (existsSync(p.configFile)) {
    const parsed = (load(await readFile(p.configFile, 'utf8')) ?? {}) as { mcpServers?: Record<string, McpEntry> };
    if (parsed.mcpServers) {
      const out: McpServer[] = [];
      for (const [name, s] of Object.entries(parsed.mcpServers)) {
        if (s.url) out.push({ name, transport: s.type === 'sse' ? 'sse' : 'http', url: s.url } as McpServer);
        else if (s.command) {
          const server = { name, transport: 'stdio', command: s.command } as McpServer;
          if (s.args) (server as { args?: string[] }).args = s.args;
          if (s.env) (server as { env?: Record<string, string> }).env = s.env;
          out.push(server);
        }
      }
      if (out.length) ir.mcp_servers = out;
    }
  }
  return ir;
}

async function writeImpl(ir: IR, scope: Scope, cwd: string, opts: WriteOpts = {}): Promise<WriteReport> {
  const p = paths(scope, cwd);
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const warnings: string[] = [];

  if (ir.rules?.length) {
    const body = ir.rules.map((r: { body: string }) => r.body).join('\n\n');
    if (!opts.dryRun) {
      await mkdir(dirname(p.rulesFile), { recursive: true });
      await writeFile(p.rulesFile, `${body}\n`, 'utf8');
    }
    written.push(p.rulesFile);
  }

  if (ir.mcp_servers?.length) {
    const out: Record<string, unknown> = {};
    for (const s of ir.mcp_servers) {
      if (s.transport === 'stdio') {
        const entry: Record<string, unknown> = { command: s.command };
        if (s.args) entry.args = s.args;
        if (s.env) entry.env = s.env;
        out[s.name] = entry;
      } else {
        const entry: Record<string, unknown> = { url: s.url, type: s.transport };
        if (s.headers) entry.headers = s.headers;
        out[s.name] = entry;
      }
    }
    if (!opts.dryRun) {
      await mkdir(dirname(p.configFile), { recursive: true });
      await writeFile(p.configFile, dump({ mcpServers: out }, { lineWidth: 100, noRefs: true }), 'utf8');
    }
    written.push(p.configFile);
  }

  for (const [field, label] of [
    ['hooks', 'hooks'], ['skills', 'skills'], ['commands', 'commands'], ['agents', 'agents'],
  ] as const) {
    const items = ir[field];
    if (items?.length) {
      warnings.push(`${label}: Continue has no ${label} support (${items.length} skipped)`);
      for (const i of items) {
        const id = (i as { name?: string; id?: string }).name ?? (i as { id?: string }).id ?? '?';
        skipped.push({ path: `${label}/${id}`, reason: 'unsupported' });
      }
    }
  }

  return { written, skipped, warnings };
}

export const continueAdapter: Adapter = {
  id: 'continue',
  capabilities,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.continueDir) || existsSync(p.rulesFile);
  },
  read: readImpl,
  write: writeImpl,
};
export default continueAdapter;
