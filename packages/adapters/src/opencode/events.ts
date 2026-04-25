import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → OpenCode event name (per DESIGN.md §7 matrix).
 *
 * Note: many cells are approximations rather than 1:1. `turn.end → session.idle`
 * is a notable semantic widening — Claude's Stop fires per turn whereas
 * opencode session.idle fires when the whole session goes idle.
 */
export const canonicalToOpencode: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'session.created',
  'session.end': 'session.deleted',
  'agent.idle': 'session.idle',
  'turn.end': 'session.idle', // semantic widening
  'tool.use.pre': 'tool.execute.before',
  'tool.use.post': 'tool.execute.after',
  'file.edit.post': 'file.edited',
  'file.change.external': 'file.watcher.updated',
  'shell.exec.post': 'command.executed',
  'permission.request': 'permission.asked',
  'permission.deny': 'permission.replied',
  'notification': 'tui.toast.show',
  'context.compact.post': 'session.compacted',
};

export const opencodeToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToOpencode).map(([canonical, oc]) => [oc, canonical as CanonicalEvent]),
);
