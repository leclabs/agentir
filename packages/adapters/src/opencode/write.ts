import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dump } from 'js-yaml';
import {
  serializeSkill,
  type Hook,
  type IR,
  type McpServer,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToOpencode } from './events.js';
import { paths } from './paths.js';

export async function writeOpencode(
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
    const body = ir.rules.map((r) => r.body).join('\n\n');
    if (!opts.dryRun) {
      await mkdir(dirname(p.rulesFile), { recursive: true });
      await writeFile(p.rulesFile, `${body}\n`, 'utf8');
    }
    written.push(p.rulesFile);
  }

  // Hooks → sidecar YAML + executable JS shim
  if (ir.hooks?.length) {
    const compatible: Hook[] = [];
    for (const hook of ir.hooks) {
      const unsupported = hook.events.filter((e) => !canonicalToOpencode[e]);
      if (unsupported.length === hook.events.length) {
        warnings.push(
          `hook '${hook.id ?? '?'}': no opencode equivalent for events ${unsupported.join(',')}`,
        );
        skipped.push({
          path: `hooks/${hook.id ?? '?'}.yaml`,
          reason: `no opencode mapping for events: ${unsupported.join(',')}`,
        });
        continue;
      }
      if (unsupported.length > 0) {
        warnings.push(
          `hook '${hook.id ?? '?'}': partial mapping; events ${unsupported.join(',')} dropped`,
        );
      }
      compatible.push(hook);
    }

    if (compatible.length > 0) {
      if (!opts.dryRun) {
        await mkdir(p.pluginsDir, { recursive: true });
        await writeFile(
          p.hooksManifestFile,
          dump({ hooks: compatible }, { lineWidth: 100, noRefs: true }),
          'utf8',
        );
        await writeFile(p.hooksShimFile, generateShim(compatible), 'utf8');
      }
      written.push(p.hooksManifestFile, p.hooksShimFile);
    }
  }

  // Skills (one directory per skill); allowed_tools field is dropped — opencode
  // does not honor it.
  if (ir.skills?.length) {
    for (const skill of ir.skills) {
      if (skill.allowed_tools && skill.allowed_tools.length > 0) {
        warnings.push(
          `skill '${skill.name}': opencode ignores 'allowed_tools'; field will be present in SKILL.md but unused`,
        );
      }
      const skillDir = join(p.skillsDir, skill.name);
      const skillFile = join(skillDir, 'SKILL.md');
      if (!opts.dryRun) {
        await mkdir(skillDir, { recursive: true });
        await writeFile(skillFile, serializeSkill(skill), 'utf8');
      }
      written.push(skillFile);
    }
  }

  // MCP servers → .opencode/mcp.json (matches the standard mcpServers shape)
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

  // Permissions — best-effort. opencode has its own DSL; we emit a JSON file
  // and warn that it is not natively respected.
  if (ir.permissions) {
    warnings.push(
      'permissions: opencode uses a different permission DSL; emitted as .opencode/permissions.json (not natively read)',
    );
    if (!opts.dryRun) {
      await mkdir(dirname(p.permissionsFile), { recursive: true });
      await writeFile(p.permissionsFile, `${JSON.stringify(ir.permissions, null, 2)}\n`, 'utf8');
    }
    written.push(p.permissionsFile);
  }

  // Env → JSON map
  if (ir.env) {
    if (!opts.dryRun) {
      await mkdir(dirname(p.envFile), { recursive: true });
      await writeFile(p.envFile, `${JSON.stringify(ir.env, null, 2)}\n`, 'utf8');
    }
    written.push(p.envFile);
  }

  // Commands and agents — opencode has no equivalent
  if (ir.commands?.length) {
    warnings.push(`commands: opencode has no slash-command system (${ir.commands.length} skipped)`);
    for (const c of ir.commands) skipped.push({ path: `commands/${c.name}.md`, reason: 'unsupported' });
  }
  if (ir.agents?.length) {
    warnings.push(`agents: opencode has no subagent system (${ir.agents.length} skipped)`);
    for (const a of ir.agents) skipped.push({ path: `agents/${a.name}.md`, reason: 'unsupported' });
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

function generateShim(hooks: Hook[]): string {
  const lines = [
    '// AUTO-GENERATED by agentir; do not edit by hand.',
    '// Source of truth: ./agentir-hooks.yaml',
    "import { spawnSync } from 'node:child_process';",
    '',
    'function runHook(command, payload) {',
    "  spawnSync('sh', ['-c', command], {",
    "    input: JSON.stringify(payload),",
    "    stdio: ['pipe', 'inherit', 'inherit'],",
    '  });',
    '}',
    '',
    'export const AgentIRHooks = async () => {',
    '  return {',
  ];

  const byEvent = new Map<string, Hook[]>();
  for (const hook of hooks) {
    for (const e of hook.events) {
      const oc = canonicalToOpencode[e];
      if (!oc) continue;
      const list = byEvent.get(oc) ?? [];
      list.push(hook);
      byEvent.set(oc, list);
    }
  }

  for (const [ocEvent, list] of byEvent) {
    lines.push(`    '${ocEvent}': async (input) => {`);
    for (const hook of list) {
      const matcherCheck = hook.matcher
        ? `if (!matcherMatches(${JSON.stringify(hook.matcher)}, input)) return;`
        : '';
      const meta = JSON.stringify({
        id: hook.id,
        canonicalEvent: hook.events[0],
        matcher: hook.matcher,
      });
      if (matcherCheck) lines.push(`      ${matcherCheck}`);
      lines.push(`      runHook(${JSON.stringify(hook.command)}, { ...input, _agentir: ${meta} });`);
    }
    lines.push('    },');
  }

  lines.push('  };');
  lines.push('};');
  lines.push('');
  lines.push('function matcherMatches(pattern, input) {');
  lines.push('  const target = input?.tool?.name ?? input?.path ?? "";');
  lines.push('  return new RegExp(pattern.replace(/\\*/g, ".*")).test(target);');
  lines.push('}');
  return lines.join('\n');
}

