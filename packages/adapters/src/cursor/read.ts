import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseRule,
  parseSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type Skill,
} from '@leclabs/agentir-core';
import { cursorToCanonical } from './events.js';
import { paths } from './paths.js';

interface CursorHooksFile {
  hooks?: Record<string, Array<{ matcher?: string; command: string; timeout?: number }>>;
}

interface McpEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  type?: 'stdio' | 'http' | 'sse';
}

export async function readCursor(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  if (existsSync(p.rulesFile)) {
    const text = await readFile(p.rulesFile, 'utf8');
    ir.rules = [parseRule(text, 'main')];
  }

  if (existsSync(p.skillsDir)) {
    const skills = await readSkillsDir(p.skillsDir);
    if (skills.length) ir.skills = skills;
  }

  if (existsSync(p.hooksFile)) {
    const text = await readFile(p.hooksFile, 'utf8');
    const parsed = JSON.parse(text) as CursorHooksFile;
    if (parsed.hooks) {
      const hooks = parseCursorHooks(parsed.hooks);
      if (hooks.length) ir.hooks = hooks;
    }
  }

  if (existsSync(p.mcpFile)) {
    const text = await readFile(p.mcpFile, 'utf8');
    const parsed = JSON.parse(text) as { mcpServers?: Record<string, McpEntry> };
    if (parsed.mcpServers) ir.mcp_servers = parseMcp(parsed.mcpServers);
  }

  return ir;
}

function parseCursorHooks(hooks: NonNullable<CursorHooksFile['hooks']>): Hook[] {
  const out: Hook[] = [];
  let counter = 0;
  for (const [eventName, entries] of Object.entries(hooks)) {
    const canonical = cursorToCanonical[eventName];
    if (!canonical) continue;
    for (const entry of entries) {
      const hook: Hook = {
        id: `${eventName.toLowerCase()}-${counter++}`,
        events: [canonical],
        command: entry.command,
      };
      if (entry.matcher) hook.matcher = entry.matcher;
      if (entry.timeout !== undefined) hook.timeout = entry.timeout;
      out.push(hook);
    }
  }
  return out;
}

function parseMcp(servers: Record<string, McpEntry>): McpServer[] {
  const out: McpServer[] = [];
  for (const [name, s] of Object.entries(servers)) {
    if (s.url) {
      out.push({ name, transport: s.type === 'sse' ? 'sse' : 'http', url: s.url } as McpServer);
    } else if (s.command) {
      const server = { name, transport: 'stdio', command: s.command } as McpServer;
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
