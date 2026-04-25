import {
  defaultIRRoot,
  findIRRoot,
  readIR,
  writeIR,
  type Adapter,
  type Hook,
  type IR,
  type Manifest,
  type Rule,
  type Scope,
} from '@leclabs/agentir-core';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import pc from 'picocolors';

export interface ImportOpts {
  client: string;
  scope?: Scope;
  from?: string;
  cwd?: string;
  /** Merge into the existing IR instead of overwriting. */
  merge?: boolean;
}

export async function runImport(opts: ImportOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();
  const sourceDir = opts.from ?? cwd;
  const adapter = adapters.find((a) => a.id === opts.client);
  if (!adapter) {
    console.error(pc.red(`agentir: unknown client '${opts.client}'`));
    console.error(`available: ${adapters.map((a) => a.id).join(', ')}`);
    return 1;
  }

  const detected = await adapter.detect(scope, sourceDir);
  if (!detected) {
    console.error(pc.yellow(`⚠ ${opts.client}: no config detected at ${sourceDir} (scope ${scope})`));
  }

  const incoming = await adapter.read(scope, sourceDir);

  const root = defaultIRRoot(scope, cwd);
  if (!existsSync(root)) {
    await mkdir(root, { recursive: true });
  }

  let ir: IR;
  let conflicts: string[] = [];
  if (opts.merge && findIRRoot(scope, cwd)) {
    // Read existing IR and merge incoming on top, preserving ours on conflict.
    const existing = await readIR(scope, cwd);
    const result = mergePreservingOurs(existing, incoming);
    ir = result.ir;
    conflicts = result.conflicts;
  } else {
    ir = {
      manifest: { agentir: 1, scope, targets: [opts.client] } satisfies Manifest,
      ...incoming,
    };
  }

  await writeIR(ir, scope, cwd);

  const counts = countResources(ir);
  console.log(pc.green('✓'), `${opts.merge ? 'merged' : 'imported'} ${opts.client} → ${root}`);
  for (const [k, n] of Object.entries(counts)) {
    if (n > 0) console.log(`    ${k}: ${n}`);
  }
  if (conflicts.length > 0) {
    console.log('');
    console.log(pc.yellow(`⚠ ${conflicts.length} conflict(s) — IR preserved, theirs noted below:`));
    for (const c of conflicts) console.log(`    ${pc.yellow('•')} ${c}`);
    console.log(pc.gray('  re-run without --merge to take theirs, or hand-resolve in the IR.'));
  }
  return 0;
}

interface MergeResult {
  ir: IR;
  conflicts: string[];
}

function mergePreservingOurs(existing: IR, incoming: Partial<IR>): MergeResult {
  const conflicts: string[] = [];
  const ir: IR = { ...existing };

  // Rules: by id
  if (incoming.rules) {
    const ourMap = new Map<string, Rule>(existing.rules?.map((r) => [r.id, r]) ?? []);
    for (const theirs of incoming.rules) {
      const ours = ourMap.get(theirs.id);
      if (!ours) {
        ourMap.set(theirs.id, theirs);
      } else if (ours.body !== theirs.body) {
        conflicts.push(`rule '${theirs.id}': content differs (kept ours)`);
      }
    }
    ir.rules = Array.from(ourMap.values());
  }

  // Hooks: by (events tuple, matcher)
  if (incoming.hooks) {
    const key = (h: Hook): string => `${[...h.events].sort().join(',')}|${h.matcher ?? ''}`;
    const ourMap = new Map<string, Hook>(existing.hooks?.map((h) => [key(h), h]) ?? []);
    for (const theirs of incoming.hooks) {
      const k = key(theirs);
      const ours = ourMap.get(k);
      if (!ours) {
        ourMap.set(k, theirs);
      } else if (ours.command !== theirs.command || ours.timeout !== theirs.timeout) {
        conflicts.push(`hook '${theirs.id ?? k}': command/timeout differs (kept ours)`);
      }
    }
    ir.hooks = Array.from(ourMap.values());
  }

  // skills/commands/agents/mcp_servers: by name
  ir.skills = mergeByName(existing.skills, incoming.skills, 'skill', conflicts);
  ir.commands = mergeByName(existing.commands, incoming.commands, 'command', conflicts);
  ir.agents = mergeByName(existing.agents, incoming.agents, 'agent', conflicts);
  ir.mcp_servers = mergeByName(existing.mcp_servers, incoming.mcp_servers, 'mcp', conflicts);

  // Permissions: combine (deny overrides allow handled by core merge but here we just union)
  if (incoming.permissions) {
    const allow = new Set([...(existing.permissions?.allow ?? []), ...(incoming.permissions.allow ?? [])]);
    const deny = new Set([...(existing.permissions?.deny ?? []), ...(incoming.permissions.deny ?? [])]);
    const ask = new Set([...(existing.permissions?.ask ?? []), ...(incoming.permissions.ask ?? [])]);
    for (const x of deny) allow.delete(x);
    ir.permissions = {
      ...(allow.size && { allow: Array.from(allow) }),
      ...(deny.size && { deny: Array.from(deny) }),
      ...(ask.size && { ask: Array.from(ask) }),
    };
  }

  // Env: ours wins per key on conflict
  if (incoming.env) {
    const out: Record<string, string> = { ...(incoming.env), ...(existing.env ?? {}) };
    for (const k of Object.keys(incoming.env)) {
      if (existing.env?.[k] !== undefined && existing.env[k] !== incoming.env[k]) {
        conflicts.push(`env '${k}': value differs (kept ours)`);
      }
    }
    ir.env = out;
  }

  return { ir, conflicts };
}

function mergeByName<T extends { name: string }>(
  ours: T[] | undefined,
  theirs: T[] | undefined,
  label: string,
  conflicts: string[],
): T[] | undefined {
  if (!theirs) return ours;
  const map = new Map<string, T>(ours?.map((x) => [x.name, x]) ?? []);
  for (const t of theirs) {
    const o = map.get(t.name);
    if (!o) {
      map.set(t.name, t);
    } else if (JSON.stringify(o) !== JSON.stringify(t)) {
      conflicts.push(`${label} '${t.name}': differs (kept ours)`);
    }
  }
  return map.size > 0 ? Array.from(map.values()) : undefined;
}

function countResources(ir: IR): Record<string, number> {
  return {
    rules: ir.rules?.length ?? 0,
    skills: ir.skills?.length ?? 0,
    commands: ir.commands?.length ?? 0,
    agents: ir.agents?.length ?? 0,
    hooks: ir.hooks?.length ?? 0,
    mcp_servers: ir.mcp_servers?.length ?? 0,
    permissions: ir.permissions ? 1 : 0,
    env: ir.env ? Object.keys(ir.env).length : 0,
  };
}
