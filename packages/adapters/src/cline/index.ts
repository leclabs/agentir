import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  parseRule,
  serializeRule,
  type Adapter,
  type AdapterCapabilities,
  type CanonicalEvent,
  type Hook,
  type IR,
  type McpServer,
  type Rule,
  type Scope,
  type WriteOpts,
  type WriteReport,
} from '@leclabs/agentir-core';

const canonicalToCline: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'TaskStart',
  'session.resume': 'TaskResume',
  'session.end': 'TaskComplete',
  'turn.fail': 'TaskCancel',
  'prompt.submit': 'UserPromptSubmit',
  'tool.use.pre': 'PreToolUse',
  'tool.use.post': 'PostToolUse',
  'context.compact.pre': 'PreCompact',
};
const clineToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToCline).map(([c, n]) => [n, c as CanonicalEvent]),
);

interface ClinePaths {
  rulesDir: string;
  hooksFile: string;
  mcpFile: string;
  clineDir: string;
}

function paths(scope: Scope, cwd: string): ClinePaths {
  const root = scope === 'user' ? join(homedir(), '.cline') : join(cwd, '.cline');
  return {
    clineDir: root,
    rulesDir: scope === 'user' ? join(root, 'rules') : join(cwd, '.clinerules'),
    hooksFile: join(root, 'hooks.json'),
    mcpFile: join(root, 'mcp.json'),
  };
}

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'none',
    commands: 'none',
    agents: 'none',
    hooks: 'partial',
    mcp: 'full',
    permissions: 'partial',
    env: 'partial',
  },
  hooks: {
    supported: [
      'session.start',
      'session.resume',
      'session.end',
      'turn.fail',
      'prompt.submit',
      'tool.use.pre',
      'tool.use.post',
      'context.compact.pre',
    ],
    matchers: 'glob',
    payload: 'claude-json',
  },
  scopes: ['user', 'project'],
};

interface ClineHooksFile {
  hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type: string; command: string; timeout?: number }> }>>;
}

interface McpEntry { command?: string; args?: string[]; env?: Record<string, string>; url?: string; type?: 'stdio' | 'http' | 'sse'; headers?: Record<string, string> }

async function readImpl(scope: Scope, cwd: string): Promise<Partial<IR>> {
  const p = paths(scope, cwd);
  const ir: Partial<IR> = {};

  // Multi-file rules in .clinerules/
  if (existsSync(p.rulesDir)) {
    const entries = await readdir(p.rulesDir);
    const rules: Rule[] = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.md')) continue;
      const text = await readFile(join(p.rulesDir, entry), 'utf8');
      rules.push(parseRule(text, basename(entry, '.md')));
    }
    if (rules.length) ir.rules = rules;
  }

  if (existsSync(p.hooksFile)) {
    const settings = JSON.parse(await readFile(p.hooksFile, 'utf8')) as ClineHooksFile;
    if (settings.hooks) {
      const hooks: Hook[] = [];
      let counter = 0;
      for (const [eventName, entries] of Object.entries(settings.hooks)) {
        const canonical = clineToCanonical[eventName];
        if (!canonical) continue;
        for (const entry of entries) {
          for (const h of entry.hooks ?? []) {
            if (h.type !== 'command') continue;
            const hook: Hook = { id: `${eventName.toLowerCase()}-${counter++}`, events: [canonical], command: h.command };
            if (entry.matcher) hook.matcher = entry.matcher;
            if (h.timeout !== undefined) hook.timeout = h.timeout;
            hooks.push(hook);
          }
        }
      }
      if (hooks.length) ir.hooks = hooks;
    }
  }

  if (existsSync(p.mcpFile)) {
    const parsed = JSON.parse(await readFile(p.mcpFile, 'utf8')) as { mcpServers?: Record<string, McpEntry> };
    if (parsed.mcpServers) {
      const mcp: McpServer[] = [];
      for (const [name, s] of Object.entries(parsed.mcpServers)) {
        if (s.url) mcp.push({ name, transport: s.type === 'sse' ? 'sse' : 'http', url: s.url } as McpServer);
        else if (s.command) {
          const server = { name, transport: 'stdio', command: s.command } as McpServer;
          if (s.args) (server as { args?: string[] }).args = s.args;
          if (s.env) (server as { env?: Record<string, string> }).env = s.env;
          mcp.push(server);
        }
      }
      if (mcp.length) ir.mcp_servers = mcp;
    }
  }

  return ir;
}

async function writeImpl(ir: IR, scope: Scope, cwd: string, opts: WriteOpts = {}): Promise<WriteReport> {
  const p = paths(scope, cwd);
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const warnings: string[] = [];

  // Multi-file rules
  if (ir.rules?.length) {
    if (!opts.dryRun) await mkdir(p.rulesDir, { recursive: true });
    for (const rule of ir.rules) {
      const path = join(p.rulesDir, `${rule.id}.md`);
      if (!opts.dryRun) await writeFile(path, serializeRule(rule), 'utf8');
      written.push(path);
    }
  }

  if (ir.hooks?.length) {
    const compatible: Hook[] = ir.hooks.filter((h: Hook) => h.events.some((e) => canonicalToCline[e]));
    const dropped: Hook[] = ir.hooks.filter((h: Hook) => !h.events.some((e) => canonicalToCline[e]));
    for (const d of dropped) {
      warnings.push(`hook '${d.id ?? '?'}': no Cline equivalent for events ${d.events.join(',')}`);
      skipped.push({ path: `hooks/${d.id ?? '?'}.yaml`, reason: 'unsupported' });
    }
    if (compatible.length > 0) {
      const obj: { hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> }>> } = { hooks: {} };
      for (const hook of compatible) {
        for (const e of hook.events) {
          const clineEvent = canonicalToCline[e];
          if (!clineEvent) continue;
          const cmd: { type: 'command'; command: string; timeout?: number } = { type: 'command', command: hook.command };
          if (hook.timeout !== undefined) cmd.timeout = hook.timeout;
          const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string; timeout?: number }> } = { hooks: [cmd] };
          if (hook.matcher) entry.matcher = hook.matcher;
          (obj.hooks[clineEvent] ??= []).push(entry);
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
    const out: Record<string, unknown> = {};
    for (const s of ir.mcp_servers) {
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
    if (!opts.dryRun) {
      await mkdir(dirname(p.mcpFile), { recursive: true });
      await writeFile(p.mcpFile, `${JSON.stringify({ mcpServers: out }, null, 2)}\n`, 'utf8');
    }
    written.push(p.mcpFile);
  }

  for (const [field, label] of [
    ['skills', 'skills'],
    ['commands', 'commands'],
    ['agents', 'agents'],
  ] as const) {
    const items = ir[field];
    if (items && items.length) {
      warnings.push(`${label}: Cline does not support ${label} (${items.length} skipped)`);
      for (const i of items) skipped.push({ path: `${label}/${(i as { name?: string; id?: string }).name ?? (i as { id?: string }).id ?? '?'}`, reason: 'unsupported' });
    }
  }

  return { written, skipped, warnings };
}

export const clineAdapter: Adapter = {
  id: 'cline',
  capabilities,
  eventMap: canonicalToCline,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.clineDir) || existsSync(p.rulesDir);
  },
  read: readImpl,
  write: writeImpl,
};
export default clineAdapter;
