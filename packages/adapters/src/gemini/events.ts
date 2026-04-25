import type { CanonicalEvent } from '@leclabs/agentir-core';

/**
 * Canonical event → Gemini CLI event name.
 *
 * Gemini exposes 11 hook events (per April 2026 docs). It also reads
 * CLAUDE_PROJECT_DIR as a compatibility alias, but the native event names
 * are distinct (BeforeAgent/AfterAgent rather than UserPromptSubmit/Stop).
 */
export const canonicalToGemini: Partial<Record<CanonicalEvent, string>> = {
  'session.start': 'SessionStart',
  'session.end': 'SessionEnd',
  'prompt.submit': 'BeforeAgent',
  'turn.end': 'AfterAgent',
  'model.request.pre': 'BeforeModel',
  'model.response.post': 'AfterModel',
  'tool.use.pre': 'BeforeTool',
  'tool.use.post': 'AfterTool',
  'context.compact.pre': 'PreCompress',
  'notification': 'Notification',
};

export const geminiToCanonical: Record<string, CanonicalEvent> = Object.fromEntries(
  Object.entries(canonicalToGemini).map(([canonical, gemini]) => [gemini, canonical as CanonicalEvent]),
);
