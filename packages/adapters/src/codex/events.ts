import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → Codex CLI event name. Codex hooks are experimental
 * (behind `[features] codex_hooks = true`) and currently emit only for
 * `Bash` tool calls; matchers other than 'Bash' are ineffective.
 */
export const canonicalToCodex: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'SessionStart',
  'prompt.submit': 'UserPromptSubmit',
  'tool.use.pre': 'PreToolUse',
  'tool.use.post': 'PostToolUse',
  'permission.request': 'PermissionRequest',
  'turn.end': 'Stop',
};

export const codexToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToCodex).map(([canonical, codex]) => [codex, canonical as CanonicalEvent]),
);
