import { dump, load } from 'js-yaml';
import type { Hook } from '../ir/types.js';

/**
 * Parse a hook YAML file into a Hook IR resource. `id` defaults to the
 * filename without extension; if YAML contains `id`, it overrides.
 */
export function parseHook(text: string, defaultId: string): Hook {
  const parsed = (load(text) ?? {}) as Partial<Hook>;
  if (!parsed.events || !Array.isArray(parsed.events) || parsed.events.length === 0) {
    throw new Error(`Hook '${defaultId}': must declare at least one event`);
  }
  if (typeof parsed.command !== 'string') {
    throw new Error(`Hook '${defaultId}': must declare a 'command' string`);
  }
  const hook: Hook = {
    id: typeof parsed.id === 'string' ? parsed.id : defaultId,
    events: parsed.events,
    command: parsed.command,
  };
  if (parsed.matcher !== undefined) hook.matcher = parsed.matcher;
  if (parsed.timeout !== undefined) hook.timeout = parsed.timeout;
  if (parsed.targets) hook.targets = parsed.targets;
  if (parsed.excludes) hook.excludes = parsed.excludes;
  return hook;
}

/**
 * Serialize a Hook to YAML. The `id` is omitted (encoded in the filename).
 */
export function serializeHook(hook: Hook): string {
  const out: Record<string, unknown> = {
    events: hook.events,
    command: hook.command,
  };
  if (hook.matcher !== undefined) out.matcher = hook.matcher;
  if (hook.timeout !== undefined) out.timeout = hook.timeout;
  if (hook.targets) out.targets = hook.targets;
  if (hook.excludes) out.excludes = hook.excludes;
  return dump(out, { lineWidth: 100, noRefs: true });
}
