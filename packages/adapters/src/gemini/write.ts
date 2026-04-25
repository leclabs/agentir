import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  serializeAgent,
  serializeSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToGemini } from './events.js';
import { paths } from './paths.js';

export async function writeGemini(
  ir: IR,
  scope: Scope,
  cwd: string,
  opts: WriteOpts = {},
): Promise<WriteReport> {
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

  // Agents (subagent .md files)
  if (ir.agents?.length) {
    if (!opts.dryRun) await mkdir(p.agentsDir, { recursive: true });
    for (const agent of ir.agents) {
      const path = join(p.agentsDir, `${agent.name}.md`);
      if (!opts.dryRun) await writeFile(path, serializeAgent(agent), 'utf8');
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

  // settings.json: hooks + mcp + permissions + env
  const settings: Record<string, unknown> = {};
  if (ir.hooks?.length) {
    const compatible: Hook[] = ir.hooks.filter((h: Hook) =>
      h.events.some((e) => canonicalToGemini[e]),
    );
    const dropped: Hook[] = ir.hooks.filter(
      (h: Hook) => !h.events.some((e) => canonicalToGemini[e]),
    );
    for (const d of dropped) {
      warnings.push(
        `hook '${d.id ?? '?'}': no Gemini equivalent for events ${d.events.join(',')}`,
      );
      skipped.push({
        path: `hooks/${d.id ?? '?'}.yaml`,
        reason: 'unsupported by Gemini event surface',
      });
    }
    if (compatible.length > 0) settings.hooks = serializeGeminiHooks(compatible);
  }
  if (ir.mcp_servers?.length) settings.mcpServers = serializeMcp(ir.mcp_servers);
  if (ir.permissions) {
    warnings.push(
      'permissions: Gemini permission DSL differs from canonical; emitted verbatim, may not be honored',
    );
    settings.permissions = ir.permissions;
  }
  if (ir.env) settings.env = ir.env;

  if (Object.keys(settings).length > 0) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.settingsFile), { recursive: true });
      await writeFile(p.settingsFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    }
    written.push(p.settingsFile);
  }

  if (ir.commands?.length) {
    warnings.push(`commands: Gemini has no slash-command system (${ir.commands.length} skipped)`);
    for (const c of ir.commands) skipped.push({ path: `commands/${c.name}.md`, reason: 'unsupported' });
  }

  return { written, skipped, warnings };
}

function serializeGeminiHooks(
  hooks: Hook[],
): Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> {
  const out: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> = {};
  for (const hook of hooks) {
    for (const event of hook.events) {
      const geminiEvent = canonicalToGemini[event];
      if (!geminiEvent) continue;
      const cmd: { type: 'command'; command: string; timeout?: number } = {
        type: 'command',
        command: hook.command,
      };
      if (hook.timeout !== undefined) cmd.timeout = hook.timeout;
      const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> } = {
        hooks: [cmd],
      };
      if (hook.matcher) entry.matcher = hook.matcher;
      (out[geminiEvent] ??= []).push(entry);
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
