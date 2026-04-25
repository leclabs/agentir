---
"@leclabs/agentir": minor
"@leclabs/agentir-adapters": minor
"@leclabs/agentir-core": minor
---

Initial public release.

- Universal IR for AI agent configuration with 28-event canonical hook taxonomy
- 10 official adapters: claude, opencode, codex, gemini, copilot, cursor, cline, crush, aider, continue
- 10 CLI commands: init, import, compile, diff, lint, adapters, events, doctor, watch, migrate
- Full bidirectional translation with explicit lossy-translation reporting
- Three-scope model (user/project/local) with documented merge semantics
- Drift detection via SHA-256 hashing of emitted files
- Schema migration framework
