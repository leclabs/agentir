import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → Copilot event name. Copilot's agent hooks (Preview)
 * supports exactly 8 events, intentionally Claude-Code–compatible. The
 * superset that Claude supports but Copilot drops is: SessionEnd,
 * Notification, Permission*, Task*, Teammate*, FileChanged, Worktree*,
 * Config*, Instructions*, PostCompact, PostToolUseFailure, etc.
 */
export const canonicalToCopilot: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'SessionStart',
  'prompt.submit': 'UserPromptSubmit',
  'tool.use.pre': 'PreToolUse',
  'tool.use.post': 'PostToolUse',
  'context.compact.pre': 'PreCompact',
  'subagent.start': 'SubagentStart',
  'subagent.end': 'SubagentStop',
  'turn.end': 'Stop',
};

export const copilotToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToCopilot).map(([canonical, copilot]) => [copilot, canonical as CanonicalEvent]),
);
