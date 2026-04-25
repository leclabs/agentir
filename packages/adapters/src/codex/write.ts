import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';
import {
  serializeCommand,
  serializeSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToCodex } from './events.js';
import { paths } from './paths.js';

export async function writeCodex(
  ir: IR,
  scope: Scope,
  cwd: string,
  opts: WriteOpts = {},
): Promise<WriteReport> {
  const p = paths(scope, cwd);
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const warnings: string[] = [];

  // Rules → AGENTS.md
  if (ir.rules?.length) {
    const body = ir.rules.map((r: { body: string }) => r.body).join('\n\n');
    if (!opts.dryRun) {
      await mkdir(dirname(p.rulesFile), { recursive: true });
      await writeFile(p.rulesFile, `${body}\n`, 'utf8');
    }
    written.push(p.rulesFile);
  }

  // Config TOML — collect hooks/mcp/permissions/env into a single file
  const config: Record<string, unknown> = {};
  if (ir.hooks?.length) {
    const compatible: Hook[] = ir.hooks.filter((h: Hook) =>
      h.events.some((e) => canonicalToCodex[e]),
    );
    const dropped: Hook[] = ir.hooks.filter(
      (h: Hook) => !h.events.some((e) => canonicalToCodex[e]),
    );
    for (const d of dropped) {
      warnings.push(
        `hook '${d.id ?? '?'}': no Codex equivalent for events ${d.events.join(',')}`,
      );
      skipped.push({
        path: `hooks/${d.id ?? '?'}.yaml`,
        reason: 'unsupported by Codex 6-event subset',
      });
    }
    if (compatible.length > 0) {
      // Warn about Bash-only matcher limitation for tool.use.* events
      for (const h of compatible) {
        if (
          h.events.some((e: string) => e === 'tool.use.pre' || e === 'tool.use.post') &&
          h.matcher &&
          h.matcher !== 'Bash'
        ) {
          warnings.push(
            `hook '${h.id ?? '?'}': Codex hooks fire only for Bash; matcher '${h.matcher}' is ineffective`,
          );
        }
      }
      config.features = { codex_hooks: true };
      config.hooks = serializeCodexHooks(compatible);
    }
  }
  if (ir.mcp_servers?.length) {
    config.mcp_servers = serializeMcp(ir.mcp_servers);
  }
  if (ir.permissions) config.permissions = ir.permissions;
  if (ir.env) config.env = ir.env;

  if (Object.keys(config).length > 0) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.configFile), { recursive: true });
      await writeFile(p.configFile, TOML.stringify(config as TOML.JsonMap), 'utf8');
    }
    written.push(p.configFile);
  }

  // Commands → prompts/<name>.md
  if (ir.commands?.length) {
    if (!opts.dryRun) await mkdir(p.promptsDir, { recursive: true });
    for (const cmd of ir.commands) {
      const path = join(p.promptsDir, `${cmd.name}.md`);
      if (!opts.dryRun) await writeFile(path, serializeCommand(cmd), 'utf8');
      written.push(path);
    }
  }

  // Agents → agents/<name>.toml
  if (ir.agents?.length) {
    if (!opts.dryRun) await mkdir(p.agentsDir, { recursive: true });
    for (const agent of ir.agents) {
      const path = join(p.agentsDir, `${agent.name}.toml`);
      const obj: Record<string, unknown> = {
        name: agent.name,
        system_prompt: agent.body,
      };
      if (agent.description) obj.description = agent.description;
      if (agent.model) obj.model = agent.model;
      if (agent.tools) obj.tools = agent.tools;
      if (agent.color) obj.color = agent.color;
      if (!opts.dryRun) await writeFile(path, TOML.stringify(obj as TOML.JsonMap), 'utf8');
      written.push(path);
    }
  }

  // Skills
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

  return { written, skipped, warnings };
}

function serializeCodexHooks(
  hooks: Hook[],
): Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> {
  const out: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> = {};
  for (const hook of hooks) {
    for (const event of hook.events) {
      const codexEvent = canonicalToCodex[event];
      if (!codexEvent) continue;
      const cmd: { type: 'command'; command: string; timeout?: number } = {
        type: 'command',
        command: hook.command,
      };
      if (hook.timeout !== undefined) cmd.timeout = hook.timeout;
      const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> } = {
        hooks: [cmd],
      };
      if (hook.matcher) entry.matcher = hook.matcher;
      (out[codexEvent] ??= []).push(entry);
    }
  }
  return out;
}

function serializeMcp(servers: McpServer[]): Record<string, unknown> {
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
