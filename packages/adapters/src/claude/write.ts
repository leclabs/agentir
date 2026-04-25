import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  serializeAgent,
  serializeCommand,
  serializeSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToClaude } from './events.js';
import { paths } from './paths.js';

export async function writeClaude(
  ir: IR,
  scope: Scope,
  cwd: string,
  opts: WriteOpts = {},
): Promise<WriteReport> {
  const p = paths(scope, cwd);
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const warnings: string[] = [];

  // Rules → CLAUDE.md (concatenated)
  if (ir.rules?.length) {
    if (!p.rulesFile) {
      warnings.push(`scope '${scope}' does not support rules; skipping ${ir.rules.length} rule(s)`);
    } else {
      const body = ir.rules.map((r) => r.body).join('\n\n');
      if (!opts.dryRun) {
        await mkdir(dirname(p.rulesFile), { recursive: true });
        await writeFile(p.rulesFile, `${body}\n`, 'utf8');
      }
      written.push(p.rulesFile);
    }
  }

  // Settings.json: hooks + permissions + env + mcpServers
  const settings: Record<string, unknown> = {};
  if (ir.hooks?.length) {
    const claudeHooks = serializeClaudeHooks(ir.hooks, warnings, skipped);
    if (Object.keys(claudeHooks).length > 0) settings.hooks = claudeHooks;
  }
  if (ir.permissions) settings.permissions = ir.permissions;
  if (ir.env) settings.env = ir.env;
  if (ir.mcp_servers?.length) {
    settings.mcpServers = serializeClaudeMcp(ir.mcp_servers);
  }

  if (Object.keys(settings).length > 0) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.settingsFile), { recursive: true });
      await writeFile(p.settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    }
    written.push(p.settingsFile);
  }

  // Commands
  if (ir.commands?.length) {
    if (!p.commandsDir) {
      warnings.push(`scope '${scope}' does not support commands; skipping ${ir.commands.length}`);
    } else {
      if (!opts.dryRun) await mkdir(p.commandsDir, { recursive: true });
      for (const cmd of ir.commands) {
        const path = join(p.commandsDir, `${cmd.name}.md`);
        if (!opts.dryRun) await writeFile(path, serializeCommand(cmd), 'utf8');
        written.push(path);
      }
    }
  }

  // Agents
  if (ir.agents?.length) {
    if (!p.agentsDir) {
      warnings.push(`scope '${scope}' does not support agents; skipping ${ir.agents.length}`);
    } else {
      if (!opts.dryRun) await mkdir(p.agentsDir, { recursive: true });
      for (const agent of ir.agents) {
        const path = join(p.agentsDir, `${agent.name}.md`);
        if (!opts.dryRun) await writeFile(path, serializeAgent(agent), 'utf8');
        written.push(path);
      }
    }
  }

  // Skills (one directory per skill)
  if (ir.skills?.length) {
    if (!p.skillsDir) {
      warnings.push(`scope '${scope}' does not support skills; skipping ${ir.skills.length}`);
    } else {
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
  }

  return { written, skipped, warnings };
}

function serializeClaudeHooks(
  hooks: Hook[],
  warnings: string[],
  skipped: { path: string; reason: string }[],
): Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> {
  const out: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> = {};
  for (const hook of hooks) {
    for (const event of hook.events) {
      const claudeEvent = canonicalToClaude[event];
      if (!claudeEvent) {
        warnings.push(`hook '${hook.id ?? '?'}': canonical event '${event}' has no Claude equivalent`);
        skipped.push({ path: `hooks/${hook.id ?? '?'}.yaml`, reason: `no Claude mapping for ${event}` });
        continue;
      }
      const cmd: { type: 'command'; command: string; timeout?: number } = {
        type: 'command',
        command: hook.command,
      };
      if (hook.timeout !== undefined) cmd.timeout = hook.timeout;
      const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> } = {
        hooks: [cmd],
      };
      if (hook.matcher) entry.matcher = hook.matcher;
      (out[claudeEvent] ??= []).push(entry);
    }
  }
  return out;
}

function serializeClaudeMcp(servers: McpServer[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of servers) {
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
  return out;
}
