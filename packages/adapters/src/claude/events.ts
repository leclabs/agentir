import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → Claude Code event name. Lifted from DESIGN.md §7
 * equivalence matrix.
 *
 * Events without a Claude equivalent are absent from this map; emitting them
 * yields a warning + skip on write.
 */
export const canonicalToClaude: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'SessionStart',
  'session.end': 'SessionEnd',
  'prompt.submit': 'UserPromptSubmit',
  'turn.end': 'Stop',
  'turn.fail': 'StopFailure',
  'agent.idle': 'TeammateIdle',
  'tool.use.pre': 'PreToolUse',
  'tool.use.post': 'PostToolUse',
  'tool.use.fail': 'PostToolUseFailure',
  'subagent.start': 'SubagentStart',
  'subagent.end': 'SubagentStop',
  'notification': 'Notification',
  'context.compact.pre': 'PreCompact',
  'context.compact.post': 'PostCompact',
  'file.change.external': 'FileChanged',
  'config.changed': 'ConfigChange',
  'instructions.loaded': 'InstructionsLoaded',
  'permission.request': 'PermissionRequest',
  'permission.deny': 'PermissionDenied',
};

/**
 * Reverse map: Claude event name → canonical event. Used by `read()`.
 */
export const claudeToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToClaude).map(([canonical, claude]) => [claude, canonical as CanonicalEvent]),
);
