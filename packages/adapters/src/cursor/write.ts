import { mkdir, writeFile } from 'node:fs/promises';
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
import { canonicalToCursor } from './events.js';
import { paths } from './paths.js';

export async function writeCursor(
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

  if (ir.hooks?.length) {
    const compatible: Hook[] = ir.hooks.filter((h: Hook) =>
      h.events.some((e) => canonicalToCursor[e]),
    );
    const dropped: Hook[] = ir.hooks.filter(
      (h: Hook) => !h.events.some((e) => canonicalToCursor[e]),
    );
    for (const d of dropped) {
      warnings.push(`hook '${d.id ?? '?'}': no Cursor equivalent for events ${d.events.join(',')}`);
      skipped.push({ path: `hooks/${d.id ?? '?'}.yaml`, reason: 'unsupported' });
    }
    if (compatible.length > 0) {
      const obj: { hooks: Record<string, Array<{ matcher?: string; command: string; timeout?: number }>> } = { hooks: {} };
      for (const hook of compatible) {
        for (const e of hook.events) {
          const cursorEvent = canonicalToCursor[e];
          if (!cursorEvent) continue;
          const entry: { matcher?: string; command: string; timeout?: number } = { command: hook.command };
          if (hook.matcher) entry.matcher = hook.matcher;
          if (hook.timeout !== undefined) entry.timeout = hook.timeout;
          (obj.hooks[cursorEvent] ??= []).push(entry);
        }
      }
      if (!opts.dryRun) {
        await mkdir(dirname(p.hooksFile), { recursive: true });
        await writeFile(p.hooksFile, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
      }
      written.push(p.hooksFile);
    }
  }

  if (ir.mcp_servers?.length) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.mcpFile), { recursive: true });
      await writeFile(
        p.mcpFile,
        `${JSON.stringify({ mcpServers: serializeMcp(ir.mcp_servers) }, null, 2)}\n`,
        'utf8',
      );
    }
    written.push(p.mcpFile);
  }

  if (ir.commands?.length) {
    warnings.push(`commands: Cursor has no slash-command system (${ir.commands.length} skipped)`);
    for (const c of ir.commands) skipped.push({ path: `commands/${c.name}.md`, reason: 'unsupported' });
  }
  if (ir.agents?.length) {
    warnings.push(`agents: Cursor subagent support is partial (${ir.agents.length} skipped)`);
    for (const a of ir.agents) skipped.push({ path: `agents/${a.name}.md`, reason: 'partial-support' });
  }
  if (ir.permissions) {
    warnings.push('permissions: Cursor uses MCP-server-level allowlist; not directly emitted');
  }
  if (ir.env) {
    warnings.push('env: Cursor env lives in VS Code-style settings; not emitted');
  }

  return { written, skipped, warnings };
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
