import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'js-yaml';
import {
  parseRule,
  parseSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type Skill,
} from '@leclabs/agentir-core';
import { paths } from './paths.js';

export async function readOpencode(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  // Rules — AGENTS.md
  if (existsSync(p.rulesFile)) {
    const text = await readFile(p.rulesFile, 'utf8');
    ir.rules = [parseRule(text, 'main')];
  }

  // Hooks — read the canonical sidecar YAML if present.
  if (existsSync(p.hooksManifestFile)) {
    const text = await readFile(p.hooksManifestFile, 'utf8');
    const parsed = (load(text) ?? {}) as { hooks?: Hook[] };
    if (parsed.hooks?.length) ir.hooks = parsed.hooks;
  }

  // Skills
  if (existsSync(p.skillsDir)) {
    const skills = await readSkillsDir(p.skillsDir);
    if (skills.length) ir.skills = skills;
  }

  // MCP servers
  if (existsSync(p.mcpFile)) {
    const text = await readFile(p.mcpFile, 'utf8');
    const parsed = JSON.parse(text) as { mcpServers?: Record<string, McpServerEntry> };
    if (parsed.mcpServers) {
      ir.mcp_servers = parseMcpServers(parsed.mcpServers);
    }
  }

  // Permissions
  if (existsSync(p.permissionsFile)) {
    const text = await readFile(p.permissionsFile, 'utf8');
    ir.permissions = JSON.parse(text);
  }

  // Env
  if (existsSync(p.envFile)) {
    const text = await readFile(p.envFile, 'utf8');
    ir.env = JSON.parse(text);
  }

  return ir;
}

interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  type?: 'stdio' | 'http' | 'sse';
}

function parseMcpServers(servers: Record<string, McpServerEntry>): McpServer[] {
  const out: McpServer[] = [];
  for (const [name, s] of Object.entries(servers)) {
    if (s.url) {
      const transport = s.type === 'sse' ? 'sse' : 'http';
      const server = { name, transport, url: s.url } as McpServer;
      if (s.headers) (server as { headers?: Record<string, string> }).headers = s.headers;
      out.push(server);
    } else if (s.command) {
      const server = {
        name,
        transport: 'stdio',
        command: s.command,
      } as McpServer;
      if (s.args) (server as { args?: string[] }).args = s.args;
      if (s.env) (server as { env?: Record<string, string> }).env = s.env;
      out.push(server);
    }
  }
  return out;
}

async function readSkillsDir(dir: string): Promise<Skill[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Skill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const text = await readFile(skillFile, 'utf8');
    out.push(parseSkill(text, entry.name));
  }
  return out;
}
