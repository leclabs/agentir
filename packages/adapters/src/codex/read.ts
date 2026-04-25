import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import TOML from '@iarna/toml';
import {
  parseAgent,
  parseCommand,
  parseRule,
  parseSkill,
  type Agent,
  type Command,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type Skill,
} from '@leclabs/agentir-core';
import { codexToCanonical } from './events.js';
import { paths } from './paths.js';

interface CodexConfig {
  features?: { codex_hooks?: boolean };
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command: string; timeout?: number }> }>>;
  mcp_servers?: Record<string, McpEntry>;
  permissions?: { allow?: string[]; deny?: string[]; ask?: string[] };
  env?: Record<string, string>;
}

interface McpEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  type?: 'stdio' | 'http' | 'sse';
}

export async function readCodex(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  // Rules — AGENTS.md
  if (existsSync(p.rulesFile)) {
    const text = await readFile(p.rulesFile, 'utf8');
    ir.rules = [parseRule(text, 'main')];
  }

  // Config TOML
  if (existsSync(p.configFile)) {
    const text = await readFile(p.configFile, 'utf8');
    const cfg = TOML.parse(text) as unknown as CodexConfig;
    if (cfg.hooks) {
      const hooks = parseCodexHooks(cfg.hooks);
      if (hooks.length) ir.hooks = hooks;
    }
    if (cfg.mcp_servers) {
      ir.mcp_servers = parseMcp(cfg.mcp_servers);
    }
    if (cfg.permissions) ir.permissions = cfg.permissions;
    if (cfg.env) ir.env = cfg.env;
  }

  // Prompts (commands)
  if (existsSync(p.promptsDir)) {
    const commands = await readMarkdownDir<Command>(p.promptsDir, parseCommand);
    if (commands.length) ir.commands = commands;
  }

  // Agents
  if (existsSync(p.agentsDir)) {
    const agents = await readCodexAgentsDir(p.agentsDir);
    if (agents.length) ir.agents = agents;
  }

  // Skills
  if (existsSync(p.skillsDir)) {
    const skills = await readSkillsDir(p.skillsDir);
    if (skills.length) ir.skills = skills;
  }

  return ir;
}

function parseCodexHooks(hooks: NonNullable<CodexConfig['hooks']>): Hook[] {
  const out: Hook[] = [];
  let counter = 0;
  for (const [eventName, entries] of Object.entries(hooks)) {
    const canonical = codexToCanonical[eventName];
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

async function readMarkdownDir<T>(
  dir: string,
  parse: (text: string, name: string) => T,
): Promise<T[]> {
  const entries = await readdir(dir);
  const out: T[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue;
    const name = basename(entry, '.md');
    const text = await readFile(join(dir, entry), 'utf8');
    out.push(parse(text, name));
  }
  return out;
}

async function readCodexAgentsDir(dir: string): Promise<Agent[]> {
  const entries = await readdir(dir);
  const out: Agent[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.toml')) continue;
    const text = await readFile(join(dir, entry), 'utf8');
    const parsed = TOML.parse(text) as unknown as {
      name?: string;
      description?: string;
      model?: string;
      tools?: string[];
      color?: string;
      system_prompt?: string;
    };
    const name = parsed.name ?? basename(entry, '.toml');
    const agent: Agent = {
      name,
      body: parsed.system_prompt ?? '',
    };
    if (parsed.description) agent.description = parsed.description;
    if (parsed.model) agent.model = parsed.model;
    if (parsed.tools) agent.tools = parsed.tools;
    if (parsed.color) agent.color = parsed.color;
    out.push(agent);
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
