import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  serializeSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToCopilot } from './events.js';
import { paths } from './paths.js';

export async function writeCopilot(
  ir: IR,
  scope: Scope,
  cwd: string,
  opts: WriteOpts = {},
): Promise<WriteReport> {
  const p = paths(scope, cwd);
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const warnings: string[] = [];

  // Rules
  if (ir.rules?.length) {
    const body = ir.rules.map((r) => r.body).join('\n\n');
    if (!opts.dryRun) {
      await mkdir(dirname(p.rulesFile), { recursive: true });
      await writeFile(p.rulesFile, `${body}\n`, 'utf8');
    }
    written.push(p.rulesFile);
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

  // Hooks → .claude/settings.json (Copilot reads this)
  // Avoid clobbering an existing file from the Claude adapter — read it first
  // and merge our 8-event subset in.
  if (ir.hooks?.length) {
    const compatibleHooks = ir.hooks.filter((h) => h.events.some((e) => canonicalToCopilot[e]));
    const droppedHooks = ir.hooks.filter((h) => !h.events.some((e) => canonicalToCopilot[e]));
    for (const dropped of droppedHooks) {
      warnings.push(
        `hook '${dropped.id ?? '?'}': no Copilot equivalent for events ${dropped.events.join(',')}`,
      );
      skipped.push({
        path: `hooks/${dropped.id ?? '?'}.yaml`,
        reason: 'unsupported by Copilot 8-event subset',
      });
    }
    if (compatibleHooks.length > 0) {
      let existing: Record<string, unknown> = {};
      if (existsSync(p.hooksFile)) {
        try {
          existing = JSON.parse(await readFile(p.hooksFile, 'utf8'));
        } catch {
          warnings.push(
            `existing ${p.hooksFile} is not valid JSON; overwriting (use Claude target if you need to coexist)`,
          );
        }
      }
      const claudeShape = serializeHooksClaudeShape(compatibleHooks);
      existing.hooks = { ...((existing.hooks as object) ?? {}), ...claudeShape };
      if (!opts.dryRun) {
        await mkdir(dirname(p.hooksFile), { recursive: true });
        await writeFile(p.hooksFile, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
      }
      written.push(p.hooksFile);
    }
  }

  // MCP
  if (ir.mcp_servers?.length) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.mcpFile), { recursive: true });
      await writeFile(
        p.mcpFile,
        `${JSON.stringify({ servers: serializeMcp(ir.mcp_servers) }, null, 2)}\n`,
        'utf8',
      );
    }
    written.push(p.mcpFile);
  }

  // Phase-2 unsupported by Copilot
  if (ir.commands?.length) {
    warnings.push(`commands: Copilot has no slash-command system (${ir.commands.length} skipped)`);
    for (const c of ir.commands) skipped.push({ path: `commands/${c.name}.md`, reason: 'unsupported' });
  }
  if (ir.agents?.length) {
    warnings.push(`agents: Copilot subagent support is experimental (${ir.agents.length} skipped)`);
    for (const a of ir.agents) skipped.push({ path: `agents/${a.name}.md`, reason: 'experimental' });
  }
  if (ir.permissions) {
    warnings.push('permissions: Copilot permissions live in VS Code settings; not emitted');
  }
  if (ir.env) {
    warnings.push('env: Copilot env lives in VS Code settings; not emitted');
  }

  return { written, skipped, warnings };
}

function serializeHooksClaudeShape(
  hooks: Hook[],
): Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> {
  const out: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> = {};
  for (const hook of hooks) {
    for (const event of hook.events) {
      const copilotEvent = canonicalToCopilot[event];
      if (!copilotEvent) continue;
      const cmd: { type: 'command'; command: string; timeout?: number } = {
        type: 'command',
        command: hook.command,
      };
      if (hook.timeout !== undefined) cmd.timeout = hook.timeout;
      const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> } = {
        hooks: [cmd],
      };
      if (hook.matcher) entry.matcher = hook.matcher;
      (out[copilotEvent] ??= []).push(entry);
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
