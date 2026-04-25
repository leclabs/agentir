import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  parseRule,
  parseSkill,
  serializeSkill,
  type Adapter,
  type AdapterCapabilities,
  type IR,
  type McpServer,
  type Scope,
  type Skill,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';

interface CrushPaths {
  rulesFile: string;
  mcpFile: string;
  skillsDir: string;
  crushDir: string;
}

function paths(scope: Scope, cwd: string): CrushPaths {
  if (scope === 'user') {
    const root = join(homedir(), '.config', 'crush');
    return {
      crushDir: root,
      rulesFile: join(root, 'AGENTS.md'),
      mcpFile: join(root, 'mcp.json'),
      skillsDir: join(root, 'skills'),
    };
  }
  const root = join(cwd, '.crush');
  return {
    crushDir: root,
    rulesFile: join(cwd, 'AGENTS.md'),
    mcpFile: join(root, 'mcp.json'),
    skillsDir: join(root, 'skills'),
  };
}

interface McpEntry { command?: string; args?: string[]; env?: Record<string, string>; url?: string; type?: 'stdio' | 'http' | 'sse'; headers?: Record<string, string> }

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'partial',
    commands: 'none',
    agents: 'none',
    hooks: 'none',
    mcp: 'partial',
    permissions: 'none',
    env: 'partial',
  },
  hooks: { supported: [], matchers: 'none', payload: 'native' },
  scopes: ['user', 'project'],
};

async function readImpl(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  if (existsSync(p.rulesFile)) {
    const text = await readFile(p.rulesFile, 'utf8');
    ir.rules = [parseRule(text, 'main')];
  }

  if (existsSync(p.skillsDir)) {
    const entries = await readdir(p.skillsDir, { withFileTypes: true });
    const skills: Skill[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const f = join(p.skillsDir, entry.name, 'SKILL.md');
      if (!existsSync(f)) continue;
      skills.push(parseSkill(await readFile(f, 'utf8'), entry.name));
    }
    if (skills.length) ir.skills = skills;
  }

  if (existsSync(p.mcpFile)) {
    const parsed = JSON.parse(await readFile(p.mcpFile, 'utf8')) as { mcpServers?: Record<string, McpEntry> };
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

  if (ir.skills?.length) {
    for (const skill of ir.skills) {
      const skillDir = join(p.skillsDir, skill.name);
      const skillFile = join(skillDir, 'SKILL.md');
      if (!opts.dryRun) {
        await mkdir(skillDir, { recursive: true });
        await writeFile(skillFile, serializeSkill(skill), 'utf8');
      }
      written.push(skillFile);
    }
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
      await mkdir(dirname(p.mcpFile), { recursive: true });
      await writeFile(p.mcpFile, `${JSON.stringify({ mcpServers: out }, null, 2)}\n`, 'utf8');
    }
    written.push(p.mcpFile);
  }

  if (ir.hooks?.length) {
    warnings.push(`hooks: Crush has no native hook system (${ir.hooks.length} skipped)`);
    for (const h of ir.hooks) skipped.push({ path: `hooks/${h.id ?? '?'}.yaml`, reason: 'unsupported' });
  }
  for (const [field, label] of [['commands', 'commands'], ['agents', 'agents']] as const) {
    const items = ir[field];
    if (items?.length) {
      warnings.push(`${label}: Crush has no ${label} (${items.length} skipped)`);
      for (const i of items) skipped.push({ path: `${label}/${(i as { name: string }).name}`, reason: 'unsupported' });
    }
  }

  return { written, skipped, warnings };
}

export const crushAdapter: Adapter = {
  id: 'crush',
  capabilities,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.crushDir) || existsSync(p.rulesFile);
  },
  read: readImpl,
  write: writeImpl,
};
export default crushAdapter;
