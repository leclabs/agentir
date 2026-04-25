import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → Cursor event name. Cursor uses camelCase verb-phrase
 * naming and exposes the broadest event surface among non-Claude clients
 * (20 native events; we map 17 canonical events here).
 */
export const canonicalToCursor: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'sessionStart',
  'session.end': 'sessionEnd',
  'prompt.submit': 'beforeSubmitPrompt',
  'turn.end': 'stop',
  'model.response.post': 'afterAgentResponse',
  'tool.use.pre': 'preToolUse',
  'tool.use.post': 'postToolUse',
  'tool.use.fail': 'postToolUseFailure',
  'file.read.pre': 'beforeReadFile',
  'file.edit.post': 'afterFileEdit',
  'shell.exec.pre': 'beforeShellExecution',
  'shell.exec.post': 'afterShellExecution',
  'mcp.exec.pre': 'beforeMCPExecution',
  'mcp.exec.post': 'afterMCPExecution',
  'subagent.start': 'subagentStart',
  'subagent.end': 'subagentStop',
  'context.compact.pre': 'preCompact',
};

export const cursorToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToCursor).map(([canonical, cursor]) => [cursor, canonical as CanonicalEvent]),
);
