# agentir

> Universal configuration translator for AI coding agents.

Author your agent configuration once in agentir's typed intermediate representation (IR), then compile it to the native config format of every agent client you use — Claude Code, OpenCode, Codex, Gemini, Copilot, Cursor, Cline, Crush, Aider, Continue.

You can also point agentir at any existing client config and lift it back into the IR for editing or porting.

```
                ┌──────────────────────────────────┐
                │           agentir IR             │
                │   (canonical, lossless superset) │
                └──────────────────────────────────┘
                  ▲                    │
        import    │                    │   compile
                  │                    ▼
   ┌─────────────────────┬─────────────────────┐
   │ .claude/  .codex/   │ .claude/  .codex/   │
   │ .opencode/ .cursor/ │ .opencode/ .cursor/ │
   │ .gemini/  .cline/   │ .gemini/  .cline/   │
   └─────────────────────┴─────────────────────┘
```

## Install

```bash
npm install -g @leclabs/agentir
```

## 30-second example

```bash
cd ~/myproject

# 1. Bootstrap an .agentir/ directory
agentir init

# 2. Lift your existing Claude config into the IR
agentir import claude

# 3. Edit .agentir/manifest.yaml to add more targets
#    targets: [claude, opencode, cursor]

# 4. Compile to all targets
agentir compile

# Now ./.opencode/ and ./.cursor/ exist alongside ./.claude/, all in sync.
```

## Supported clients

| Client | rules | skills | commands | agents | hooks | mcp | perm | env | hooks/28 |
|---|---|---|---|---|---|---|---|---|---|
| claude   | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 19 |
| opencode | ✓ | 🟡 | — | — | 🟡 | ✓ | 🟡 | ✓ | 13 |
| codex    | ✓ | ✓ | ✓ | ✓ | 🟡 | ✓ | 🟡 | ✓ | 6 |
| gemini   | ✓ | 🟡 | — | 🟡 | ✓ | ✓ | 🟡 | ✓ | 10 |
| copilot  | ✓ | ✓ | — | 🟡 | 🟡 | ✓ | — | 🟡 | 8 |
| cursor   | ✓ | 🟡 | — | 🟡 | ✓ | ✓ | 🟡 | — | 17 |
| cline    | ✓ | — | — | — | 🟡 | ✓ | 🟡 | 🟡 | 8 |
| crush    | ✓ | 🟡 | — | — | — | 🟡 | — | 🟡 | 0 |
| aider    | ✓ | — | — | — | — | — | — | — | 0 |
| continue | ✓ | — | — | — | — | 🟡 | — | — | 0 |

✓ = full · 🟡 = partial (lossy translation, surfaced via `--explain`) · — = absent

Lossy translations are always explicit: `agentir compile --explain` shows every substitution, every dropped resource, and why.

## Commands

```
agentir init [--scope user|project|local]
agentir import <client> [--scope] [--from] [--merge]
agentir compile [...clients] [--scope] [--dry-run] [--strict] [--explain]
agentir diff [...clients] [--scope]
agentir lint [--scope] [--strict]
agentir adapters
agentir events [--client <id>]
agentir doctor [--scope]
agentir watch [...clients] [--scope] [--debounce <ms>]
agentir migrate [--from <n>] [--to <n>] [--scope]
```

## Packages

agentir is published as 3 packages:

| Package | Use case |
|---|---|
| [`@leclabs/agentir`](packages/cli) | The CLI binary. End users want this. |
| [`@leclabs/agentir-adapters`](packages/adapters) | Bundle of all 10 adapters with subpath imports. |
| [`@leclabs/agentir-core`](packages/core) | IR types, schema, engine, validator, serializers, Adapter contract for community authors. |

## Documentation

- [DESIGN.md](DESIGN.md) — full architecture, IR shape, canonical event taxonomy, scope semantics
- [CONTRIBUTING.md](CONTRIBUTING.md) — repo setup, release process
- [Writing an adapter](packages/core/docs/writing-an-adapter.md) — community adapter author tutorial

## License

MIT © leclabs
