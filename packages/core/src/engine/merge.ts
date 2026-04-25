import type {
  Agent,
  Command,
  EnvVars,
  Hook,
  IR,
  McpServer,
  Permissions,
  Rule,
  Scope,
  Skill,
} from '../ir/types.js';

const SCOPE_ORDER: Scope[] = ['user', 'project', 'local'];

export interface ScopedIR {
  scope: Scope;
  ir: IR;
}

/**
 * Merge IRs from one or more scopes per DESIGN §9 semantics.
 *
 * Precedence (closest wins): local > project > user.
 *
 * Per resource:
 * - manifest          → closest scope wins entirely
 * - rules             → concatenated in scope order; ids prefixed with `<scope>/`
 *                       to preserve provenance for downstream writers
 * - skills/commands/  → union by `name`; closer scope overwrites on conflict
 *   agents
 * - hooks             → union by `(sortedEvents, matcher)` tuple; closer wins
 * - mcp_servers       → union by `name`; closer scope overwrites
 * - permissions       → combined allow/deny/ask; deny overrides allow
 * - env               → close-wins-per-key
 */
export function mergeIR(scopes: ScopedIR[]): IR {
  if (scopes.length === 0) {
    throw new Error('mergeIR requires at least one scope');
  }

  // Sort user → project → local so later entries override earlier.
  const sorted = [...scopes].sort(
    (a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope),
  );

  const manifest = sorted[sorted.length - 1]!.ir.manifest;

  const ir: IR = { manifest };

  const rules = mergeRules(sorted);
  if (rules.length) ir.rules = rules;

  const skills = unionBy<Skill>(sorted, (x) => x.skills, (s) => s.name);
  if (skills) ir.skills = skills;

  const commands = unionBy<Command>(sorted, (x) => x.commands, (c) => c.name);
  if (commands) ir.commands = commands;

  const agents = unionBy<Agent>(sorted, (x) => x.agents, (a) => a.name);
  if (agents) ir.agents = agents;

  const hooks = unionBy<Hook>(sorted, (x) => x.hooks, hookKey);
  if (hooks) ir.hooks = hooks;

  const mcp = unionBy<McpServer>(sorted, (x) => x.mcp_servers, (m) => m.name);
  if (mcp) ir.mcp_servers = mcp;

  const perms = mergePermissions(sorted);
  if (perms) ir.permissions = perms;

  const env = mergeEnv(sorted);
  if (env) ir.env = env;

  return ir;
}

function hookKey(h: Hook): string {
  return `${[...h.events].sort().join(',')}|${h.matcher ?? ''}`;
}

function mergeRules(scopes: ScopedIR[]): Rule[] {
  const out: Rule[] = [];
  for (const { scope, ir } of scopes) {
    if (!ir.rules) continue;
    for (const r of ir.rules) {
      out.push({ ...r, id: `${scope}/${r.id}` });
    }
  }
  return out;
}

function unionBy<T>(
  scopes: ScopedIR[],
  pick: (ir: IR) => T[] | undefined,
  keyFn: (item: T) => string,
): T[] | undefined {
  const map = new Map<string, T>();
  let any = false;
  for (const { ir } of scopes) {
    const items = pick(ir);
    if (!items) continue;
    any = true;
    for (const item of items) map.set(keyFn(item), item);
  }
  return any ? Array.from(map.values()) : undefined;
}

function mergePermissions(scopes: ScopedIR[]): Permissions | undefined {
  const allow = new Set<string>();
  const deny = new Set<string>();
  const ask = new Set<string>();
  let any = false;
  for (const { ir } of scopes) {
    if (!ir.permissions) continue;
    any = true;
    ir.permissions.allow?.forEach((x) => allow.add(x));
    ir.permissions.deny?.forEach((x) => deny.add(x));
    ir.permissions.ask?.forEach((x) => ask.add(x));
  }
  if (!any) return undefined;

  // Deny overrides allow: if X is in deny, remove it from allow.
  for (const x of deny) allow.delete(x);

  const out: Permissions = {};
  if (allow.size) out.allow = Array.from(allow);
  if (deny.size) out.deny = Array.from(deny);
  if (ask.size) out.ask = Array.from(ask);
  return out;
}

function mergeEnv(scopes: ScopedIR[]): EnvVars | undefined {
  const out: Record<string, string> = {};
  let any = false;
  for (const { ir } of scopes) {
    if (!ir.env) continue;
    any = true;
    Object.assign(out, ir.env);
  }
  return any ? out : undefined;
}
