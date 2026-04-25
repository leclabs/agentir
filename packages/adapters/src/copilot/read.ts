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
import { copilotToCanonical } from './events.js';
import { paths } from './paths.js';

interface SettingsFile {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command: string; timeout?: number }> }>>;
}

interface McpEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  type?: 'stdio' | 'http' | 'sse';
}

export async function readCopilot(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  // Rules
  if (existsSync(p.rulesFile)) {
    const text = await readFile(p.rulesFile, 'utf8');
    ir.rules = [parseRule(text, 'main')];
  }

  // Skills
  if (existsSync(p.skillsDir)) {
    const skills = await readSkillsDir(p.skillsDir);
    if (skills.length) ir.skills = skills;
  }

  // Hooks — only the 8 events Copilot recognizes
  if (existsSync(p.hooksFile)) {
    const text = await readFile(p.hooksFile, 'utf8');
    const settings = JSON.parse(text) as SettingsFile;
    if (settings.hooks) {
      const hooks = parseCopilotHooks(settings.hooks);
      if (hooks.length) ir.hooks = hooks;
    }
  }

  // MCP
  if (existsSync(p.mcpFile)) {
    const text = await readFile(p.mcpFile, 'utf8');
    const parsed = JSON.parse(text) as { servers?: Record<string, McpEntry>; mcpServers?: Record<string, McpEntry> };
    const servers = parsed.servers ?? parsed.mcpServers;
    if (servers) ir.mcp_servers = parseMcp(servers);
  }

  return ir;
}

function parseCopilotHooks(claudeShape: NonNullable<SettingsFile['hooks']>): Hook[] {
  const out: Hook[] = [];
  let counter = 0;
  for (const [eventName, entries] of Object.entries(claudeShape)) {
    const canonical = copilotToCanonical[eventName];
    if (!canonical) continue;
    for (const entry of entries) {
      for (const h of entry.hooks ?? []) {
        if (h.type !== 'command') continue;
        const hook: Hook = {
          id: `${eventName.toLowerCase()}-${counter++}`,
          events: [canonical],
          command: h.command,
        };
        if (entry.matcher) hook.matcher = entry.matcher;
        if (h.timeout !== undefined) hook.timeout = h.timeout;
        out.push(hook);
      }
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
