# agentir — Universal Agent Configuration

**Status:** Draft v0.1
**Date:** 2026-04-23
**Owner:** leclabs
**Name:** `agentir` (locked)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Prior Art & Landscape](#3-prior-art--landscape)
4. [Architecture](#4-architecture)
5. [The IR — Schema & Layout](#5-the-ir--schema--layout)
6. [Resource Types](#6-resource-types)
7. [Canonical Event Model (Hooks)](#7-canonical-event-model-hooks)
8. [Adapter Model](#8-adapter-model)
9. [Scope Model](#9-scope-model)
10. [Translation Semantics](#10-translation-semantics)
11. [CLI Surface](#11-cli-surface)
12. [Conflict Resolution & Drift Detection](#12-conflict-resolution--drift-detection)
13. [Versioning & Schema Evolution](#13-versioning--schema-evolution)
14. [Implementation Plan](#14-implementation-plan)
15. [Testing Strategy](#15-testing-strategy)
16. [Open Questions](#16-open-questions)
17. [Appendix A — Initial Adapter Coverage](#appendix-a--initial-adapter-coverage)
18. [Appendix B — Naming](#appendix-b--naming)
19. [Appendix C — Distribution](#appendix-c--distribution)

---

## 1. Overview

**agentir** is a universal configuration layer for AI coding agents. You author a single, canonical configuration in `agentir`'s intermediate representation (IR), and `agentir` compiles it down into the native config formats of every agent client you use — Claude Code, OpenCode, Codex CLI, Gemini CLI, VS Code Copilot, Cursor, Cline, and others. Conversely, you can point `agentir` at any existing client config and it will lift that config into the IR for editing or porting.

It's a two-way translator centered on a strongly-typed superset IR, scoped correctly at user / project / local levels, with first-class hook event mapping based on a documented canonical event taxonomy.

```
                ┌──────────────────────────────────┐
                │           agentir IR               │
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

The motivating problem: a developer who uses three agent clients today maintains three diverging copies of their rules, skills, slash commands, hooks, MCP servers, and permission allowlists. Existing tools like `rulesync` and `agentsys` solve slices of this — rules-only, or skills-only — but no single tool handles the full configuration surface across scopes with bidirectional fidelity.

## 2. Goals & Non-Goals

### Goals

- **G1.** Single canonical IR that is a strict superset of every supported client's configuration surface.
- **G2.** Lossless round-trip for the universal subset (configurations expressible in all targets round-trip byte-identically).
- **G3.** Bidirectional translation: import (client → IR) and compile (IR → client) for every supported client.
- **G4.** Correct handling of all three scopes — user, project, local — with per-client scope conventions respected on output.
- **G5.** First-class hook translation using a published canonical event taxonomy with explicit lossy-mapping warnings.
- **G6.** Drift detection: warn when a generated client config has been hand-edited so the user can re-import.
- **G7.** Operate as a Unix-philosophy CLI: deterministic, text-in/text-out, composable, no daemon.

### Non-Goals

- **NG1.** Not a runtime agent harness. `agentir` produces config; it does not execute agents or proxy their I/O.
- **NG2.** Not an MCP server registry. MCP server *configuration* is in scope; *discovery and installation* of MCP servers is delegated to existing tools (`mcp-get`, `smithery`).
- **NG3.** Not a plugin marketplace. `agentir` can install/translate Claude Code plugins (which are bundles of in-scope resources), but does not host or distribute them.
- **NG4.** Not a hook execution shim. We translate hook *configuration*; we do not interpose at runtime to provide cross-client event delivery (see `hcom` for that pattern).
- **NG5.** Not opinionated about content. We translate any valid config; we don't curate "good" rules or skills.

## 3. Prior Art & Landscape

| Tool | What it does | Why agentir is different |
|---|---|---|
| `rulesync` (dyoshikawa) | Single rules source → many clients' rule files; some hook syncing | Rules-centric; no first-class IR; hook semantics are surface-level |
| `agentsys` (agent-sh) | Skills+plugins installer for ~5 clients | Skills-centric; install-only, not bidirectional |
| `agnix` (agent-sh) | Lints config across 12+ clients | Validation only; doesn't translate |
| `claude-plugins.dev` / `ccpi` | Claude Code plugin installer | Single-client (Claude only), despite cross-client marketing |
| `hcom` (aannoo) | Shared SQLite bus for cross-client notifications | Runtime sidestep, not a config translator |
| `mcp-get`, `smithery` | MCP server installation across clients | MCP-only; no rules/skills/hooks |

**Gap agentir fills:** there is no tool today that (a) covers the full agent config surface (rules + skills + commands + subagents + hooks + MCP + permissions + env), (b) is bidirectional, (c) uses a typed IR rather than ad-hoc per-target converters, and (d) handles user/project/local scopes correctly per-client.

## 4. Architecture

agentir is structured as four layers:

```
┌────────────────────────────────────────────────────┐
│  CLI                                               │
│  init · import · compile · diff · lint · watch     │
├────────────────────────────────────────────────────┤
│  Engine                                            │
│  scope resolution · merge · drift detection        │
├────────────────────────────────────────────────────┤
│  IR (TypeScript types + JSON Schema)               │
│  Manifest · Rules · Skills · Commands · Agents     │
│  Hooks (canonical events) · MCP · Permissions      │
├────────────────────────────────────────────────────┤
│  Adapters (per client)                             │
│  read(): client → IR    write(): IR → client       │
│  claude · opencode · codex · gemini · copilot      │
│  cursor · cline · ...                              │
└────────────────────────────────────────────────────┘
```

Each adapter is a self-contained module implementing a small interface:

```typescript
interface Adapter {
  id: string;                             // e.g. "claude", "opencode"
  scopes: ScopeSpec;                      // where this client looks for config per scope
  detect(scope: Scope, cwd: string): Promise<boolean>;
  read(scope: Scope, cwd: string): Promise<Partial<IR>>;
  write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport>;
  capabilities: AdapterCapabilities;     // what resource types this adapter supports
}
```

Adapters are pure: given the same input, they produce the same output. State lives in the filesystem and the IR.

## 5. The IR — Schema & Layout

The IR lives in a directory (`.agentir/` for project scope, `~/.agentir/` for user scope). It is a directory of typed resources, not a single monolithic file — agent configs are inherently multi-resource and benefit from per-resource diffing, file watching, and partial editing.

### Directory layout

```
.agentir/
  manifest.yaml            # version, scope, target list, options
  rules/
    main.md                # universal rules
    @claude.md             # Claude-only addendum (filename namespace)
    @cursor.md             # Cursor-only addendum
  skills/
    code-review/
      SKILL.md             # Agent Skills spec
      reference.md
      scripts/
        run.sh
  commands/                # slash commands
    review.md
    plan.md
  agents/                  # subagents
    explorer.md
    planner.md
  hooks/
    on-stop-notify.yaml    # uses canonical event names
    on-edit-format.yaml
  mcp/
    servers.yaml           # MCP server definitions
  permissions.yaml         # allow / deny / ask lists
  env.yaml                 # environment variables
  models.yaml              # default model, per-client overrides
  plugins.yaml             # plugin marketplace references
  local/                   # local scope (gitignored)
    permissions.yaml
    env.yaml
```

### Manifest

`manifest.yaml` is the entry point:

```yaml
agentir: 1                               # IR schema version
scope: project                         # project | user | local
targets:                               # which clients to compile to
  - claude
  - opencode
  - codex
  - gemini
options:
  strict: false                        # fail on lossy translations
  emit_warnings: true
  drift_check: warn                    # warn | error | ignore
overrides:
  claude:
    settings_path: .claude/settings.json
```

### Resource type discovery

Resource types are discovered by directory convention, not declared in the manifest. Adding `rules/foo.md` immediately makes it visible. This keeps authoring friction near zero.

### Client-specific extensions

Two mechanisms, used together:

1. **Filename namespace** — files prefixed with `@<client>` (or `@<client>-<scope>`) are scoped to one client:
   - `rules/@claude.md` — only emitted into Claude output
   - `commands/@cursor-staging.md` — Cursor-only, only at "staging" environment
2. **Frontmatter targets** — explicit target list in YAML frontmatter:
   ```yaml
   ---
   targets: [claude, codex]
   excludes: [gemini]
   ---
   ```

Frontmatter wins on conflict. Adapters that don't recognize a resource silently skip it; the engine logs the skip.

## 6. Resource Types

### 6.1 Rules

Markdown files, optional YAML frontmatter. Compiled to:
- Claude: `CLAUDE.md` (project) or `~/.claude/CLAUDE.md` (user)
- Codex / OpenCode / Cursor / Copilot / Gemini: `AGENTS.md`
- Cline: `.clinerules/*.md`
- Cursor (additional): `.cursor/rules/*.mdc`

Multiple files in `rules/` are concatenated in lexical order with `## <filename>` separators, unless `concat: false` is set in the file's frontmatter (then each becomes a separate output file where the target supports it).

### 6.2 Skills

Standard Agent Skills spec (`SKILL.md` + frontmatter + adjacent files). Compiled by copying or symlinking the skill directory into each target's skills location:
- Claude: `.claude/skills/<name>/`
- OpenCode: `.opencode/skills/<name>/`
- Codex: per `codex skills` convention
- Cursor / Copilot / Gemini: per their respective SKILL.md loaders

Adapters with no native skill support are reported via warning and skipped.

### 6.3 Slash Commands

Markdown files with frontmatter declaring args, model, allowed tools. IR uses Claude Code's command frontmatter as the canonical superset (it's the most expressive). Compiled to:
- Claude: `.claude/commands/<name>.md`
- Codex: prompt files in `~/.codex/prompts/`
- Cursor: `.cursor/commands/<name>.md`
- Others: skipped with warning

### 6.4 Subagents

Markdown files with frontmatter declaring system prompt, tools, model. Canonical superset is Claude's subagent format. Compiled to:
- Claude: `.claude/agents/<name>.md`
- Codex: `~/.codex/agents/<name>.toml`
- Gemini: extension agent format
- Others: skipped with warning

### 6.5 Hooks

YAML files declaring event triggers and commands. Use the **canonical event taxonomy** (§7). Each adapter translates canonical events to its native event names at compile time.

```yaml
# hooks/on-stop-notify.yaml
event: turn.end
matcher: "*"
command: notify-send "agent done"
timeout: 30
```

For events with no equivalent in a target client, the adapter emits a warning and skips that hook for that target. A single hook file can target multiple events:

```yaml
events:
  - tool.use.pre
  - tool.use.post
matcher: "Edit|Write"
command: ./scripts/format.sh
```

### 6.6 MCP Servers

YAML registry of MCP server configurations:

```yaml
# mcp/servers.yaml
servers:
  - name: github
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: ${env:GITHUB_TOKEN}
```

Compiled to each client's MCP configuration location (Claude `.mcp.json`, OpenCode `.opencode/mcp.json`, etc.). MCP is the most universally supported config type — adapter coverage here should be 100%.

### 6.7 Permissions

YAML allow/deny/ask lists, normalized:

```yaml
allow:
  - "Bash(git status)"
  - "Bash(npm:*)"
  - "Read(*)"
deny:
  - "Bash(rm -rf:*)"
ask:
  - "Bash(*)"
```

Compiled to each client's permission system. Format mappings vary widely; lossy translation is expected and warned.

### 6.8 Environment Variables

Simple key/value, with scope:

```yaml
ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
DEBUG: "true"
```

Compiled to each client's env config (Claude `settings.json` env, OpenCode `.opencode/env`, etc.). Local scope only — never committed.

### 6.9 Models & Plugins

Model defaults and plugin marketplace references. Lower-priority resource types; adapter support is inconsistent.

## 7. Canonical Event Model (Hooks)

agentir adopts a neutral, dotted-namespace canonical event taxonomy. Each adapter maintains a translation table from canonical events to native names, derived from the equivalence matrix (see separate document). The portable subset (events present in 5+ clients) is guaranteed lossless; events outside this subset trigger warnings on translation to clients that lack them.

### Canonical event names

| Phase | Event | Description |
|---|---|---|
| Session | `session.start` | Agent session begins |
| Session | `session.resume` | Restoring prior session |
| Session | `session.end` | Session terminating |
| Turn | `prompt.submit` | User submitted input |
| Turn | `turn.end` | Agent finished responding |
| Turn | `turn.fail` | Turn ended via error |
| Turn | `agent.idle` | Agent waiting for input |
| Model | `model.request.pre` | About to call LLM |
| Model | `model.response.post` | LLM responded |
| Tool | `tool.use.pre` | Before any tool invocation |
| Tool | `tool.use.post` | After tool invocation |
| Tool | `tool.use.fail` | Tool call failed |
| File | `file.edit.post` | File modified by agent |
| File | `file.read.pre` | About to read file |
| File | `file.change.external` | External file change detected |
| Shell | `shell.exec.pre` | Before shell command |
| Shell | `shell.exec.post` | After shell command |
| MCP | `mcp.exec.pre` | Before MCP call |
| MCP | `mcp.exec.post` | After MCP call |
| Subagent | `subagent.start` | Child agent spawned |
| Subagent | `subagent.end` | Child agent finished |
| Permission | `permission.request` | Permission dialog shown |
| Permission | `permission.deny` | Permission denied |
| Notification | `notification` | Agent notification |
| Context | `context.compact.pre` | Before compression |
| Context | `context.compact.post` | After compression |
| Config | `config.changed` | Config changed at runtime |
| Config | `instructions.loaded` | Rules file loaded |

### Hook script body conventions

The hook body is a shell command. agentir does **not** translate hook bodies into JS plugins (e.g. for OpenCode). When a target client requires a non-shell hook representation, agentir emits a thin shim that shells out to the original command. Adapters that cannot do this fall back to warning + skip.

### Hook payload normalization

Hook scripts receive a JSON payload on stdin. agentir defines a canonical payload schema (modeled on Claude Code's, since it is the de-facto standard already adopted by VS Copilot and Gemini's compatibility shim). Adapters that emit different native payloads inject a thin payload-translation shim.

## 8. Adapter Model

### Adapter responsibilities

1. **Detect** — check whether the client's config exists at a given scope and path.
2. **Read** — parse all known config files for the client and produce a partial IR.
3. **Write** — given an IR and a scope, emit native config files for the client.
4. **Declare capabilities** — which resource types and which canonical events the adapter supports.
5. **Translate hook events** — maintain a canonical → native event mapping table.

### Capabilities declaration

```typescript
interface AdapterCapabilities {
  resources: {
    rules: 'full' | 'partial' | 'none';
    skills: 'full' | 'partial' | 'none';
    commands: 'full' | 'partial' | 'none';
    agents: 'full' | 'partial' | 'none';
    hooks: 'full' | 'partial' | 'none';
    mcp: 'full' | 'partial' | 'none';
    permissions: 'full' | 'partial' | 'none';
    env: 'full' | 'partial' | 'none';
  };
  hooks: {
    supported: CanonicalEvent[];        // events this client can fire
    matchers: 'glob' | 'literal' | 'none';
    payload: 'claude-json' | 'native' | 'shim';
  };
  scopes: ('user' | 'project' | 'local')[];
}
```

### Initial adapter set (v1.0)

| Adapter | Status | Resource coverage | Hook coverage |
|---|---|---|---|
| claude | first-class | full | full |
| opencode | first-class | partial | partial |
| codex | first-class | partial | minimal |
| gemini | first-class | partial | partial |
| copilot | beta | partial (skills, hooks, mcp) | high |
| cursor | beta | partial (rules, skills, hooks) | high |
| cline | beta | partial (rules, hooks) | partial |
| crush | minimal | rules, skills, mcp | none |
| aider | minimal | rules only | none |
| continue | minimal | rules only | none |

See Appendix A for the resource × adapter matrix.

## 9. Scope Model

### The three scopes

| Scope | Location (project IR) | Purpose | Typical contents |
|---|---|---|---|
| `user` | `~/.agentir/` | Personal, machine-wide defaults | Personal rules, identity, global MCP servers |
| `project` | `<repo>/.agentir/` (committed) | Team-shared, repo-specific | Project rules, project skills, project hooks |
| `local` | `<repo>/.agentir/local/` (gitignored) | Personal overrides for this repo | Local API keys, debug hooks, machine-specific paths |

Precedence on read (closer wins): **local > project > user**.

### Per-client scope output

Each adapter knows which client locations correspond to which scopes, and writes there:

| Client | user scope | project scope | local scope |
|---|---|---|---|
| Claude Code | `~/.claude/` | `<repo>/.claude/` | `<repo>/.claude/settings.local.json` |
| OpenCode | `~/.config/opencode/` | `<repo>/.opencode/` | (no native local scope; uses gitignored settings split) |
| Codex CLI | `~/.codex/` | `<repo>/.codex/` | `<repo>/.codex/local/` |
| Gemini CLI | `~/.gemini/` | `<repo>/.gemini/` | (none; emit to project + warn) |
| Cursor | `~/.cursor/` | `<repo>/.cursor/` | `<repo>/.cursor/local/` |
| Copilot | `~/.config/github-copilot/` | `<repo>/.github/copilot/` | (none) |

Where a client lacks a native scope, agentir either (a) emits to the closest available scope with a warning, or (b) skips and warns, controlled by `manifest.yaml` policy.

### Merge semantics

When `agentir compile` runs, it computes the effective IR by merging scopes in precedence order. Merge rules are resource-type specific:

- **Rules**: concatenated in scope order (user → project → local) with scope-labeled separators
- **Skills / commands / agents**: union by name; closer scope wins on name conflict
- **Hooks**: union; closer scope wins on (event, matcher) tuple conflict
- **MCP servers**: union by server name; closer scope wins
- **Permissions**: combined allow/deny/ask sets; explicit deny overrides allow
- **Env**: closer scope wins per key

Merge can be inspected via `agentir scope --resolve`.

## 10. Translation Semantics

### Lossless subset

The lossless subset is computed as the intersection of capabilities across all targets in `manifest.yaml`. Operations that produce IR entirely within this subset are guaranteed to round-trip byte-identically across all targets.

### Lossy mappings

When IR contains resources outside the lossless subset for a given target, the adapter applies one of:

1. **Substitute** — emit a near-equivalent (e.g. `tool.use.pre` matching `Edit|Write` → `file.edit.pre` for Cursor)
2. **Skip with warning** — omit the resource and log a warning
3. **Fail** — under `--strict`, abort the compile with an error

Each adapter declares its substitution rules in a static `mappings.yaml`. Substitutions are auditable: `agentir compile --explain` shows every substitution applied.

### Round-trip fidelity

Round-trip requirement: `compile → import → compile` must be a fixed point for the lossless subset. We enforce this via golden-file tests (§15).

### Hook body translation

Hook bodies are shell commands. They are not rewritten. When a target requires a different hook representation (e.g. OpenCode JS plugin), agentir emits a wrapper plugin that executes the shell body. This keeps hook authoring portable at the cost of a thin runtime indirection.

## 11. CLI Surface

```
agentir init [--scope <user|project|local>]
    Bootstrap a new .agentir/ directory in CWD (or ~/.agentir/ for user scope).
    Creates manifest.yaml and empty resource directories.

agentir import <client> [--scope <scope>] [--from <path>]
    Read an existing client's config and lift into the IR.
    Examples:
      agentir import claude --scope user
      agentir import opencode --from ./other-project

agentir compile [<client>...] [--scope <scope>] [--dry-run] [--strict] [--explain]
    Compile IR to one or more clients. Defaults to all targets in manifest.
    --dry-run prints what would be written without writing.
    --strict fails on any lossy translation.
    --explain shows substitutions and skips.

agentir diff [<client>...] [--scope <scope>]
    Show what would change if compile were run now.
    Detects drift in already-generated files.

agentir lint [--strict]
    Validate the IR against schema and adapter capabilities.
    Reports unsupported resources per declared target.

agentir scope --resolve [--scope <scope>]
    Print the merged effective IR for the given scope (defaults to all).

agentir watch [<client>...]
    Watch the IR for changes and recompile on save.

agentir events list [--client <client>]
    List canonical events and their per-client mappings.
    Useful when authoring hooks.

agentir adapter list
    List all installed adapters and their capabilities.

agentir doctor
    Diagnose: verify each declared target exists on the system,
    check write paths are accessible, detect drift.
```

### Exit codes

- `0` — success
- `1` — generic error
- `2` — validation failure (lint, schema)
- `3` — drift detected (when `drift_check: error`)
- `4` — lossy translation under `--strict`

### Environment variables

- `AGENTIR_HOME` — override `~/.agentir/`
- `AGENTIR_CONFIG` — override per-invocation manifest path
- `AGENTIR_LOG_LEVEL` — `error | warn | info | debug`

## 12. Conflict Resolution & Drift Detection

### Drift

After every `compile`, agentir records a manifest of generated files and their content hashes in `.agentir/.compile-state.json`. On the next compile (or `agentir diff`), agentir compares current on-disk hashes against the recorded ones. If they differ, the file has been hand-edited.

Drift policy is configurable per `manifest.yaml`:
- `warn` (default) — log a warning, proceed with overwrite
- `error` — abort compile, prompt user to `agentir import` first
- `ignore` — silent overwrite

### Conflict resolution

When `agentir import` discovers a resource that already exists in the IR with different content:

1. Default: write to a `.conflict` sibling file (e.g. `rules/main.md.conflict`)
2. `--overwrite` flag: replace IR content
3. `--merge` flag: invoke `git merge-file` if both have a common ancestor

### Three-way reconciliation

A common pattern: user edits Claude config in Claude Code's UI, then wants to sync back. `agentir import claude --merge` performs a three-way merge using the recorded compile-state hash as the common ancestor.

## 13. Versioning & Schema Evolution

### IR schema versioning

The `agentir:` field in `manifest.yaml` is the IR schema version (currently `1`). Backwards-incompatible changes bump this number. agentir ships migrations:

```
agentir migrate [--from 1 --to 2]
```

### Adapter versioning

Each adapter has its own version, surfaced via `agentir adapter list`. Adapters declare which IR schema version(s) they support. Mismatches are surfaced at lint time.

### Client-format versioning

Clients evolve their config formats. Adapters track supported client versions and emit warnings when they detect a newer format than they understand (e.g. unknown fields in `settings.json`).

## 14. Implementation Plan

### Phase 0 — Spike (1 week)
- Decide language (TypeScript on Node — fits leclabs npm namespace, gives a usable lib + CLI from one codebase, has solid YAML/JSON-Schema tooling)
- Stand up monorepo skeleton: `packages/core`, `packages/cli`, `packages/adapter-claude`, `packages/adapter-opencode`
- Write IR JSON Schema for rules + hooks only

### Phase 1 — Walking skeleton (2-3 weeks)
- Engine: scope resolution, merge, drift state
- Adapters: claude (full), opencode (read+write rules+hooks)
- CLI: `init`, `import`, `compile`, `diff`, `lint`
- Round-trip tests for rules and hooks

### Phase 2 — Resource breadth (3-4 weeks)
- Add remaining resource types: skills, commands, agents, MCP, permissions, env
- Adapters: codex, gemini, copilot
- `events` command, `mappings.yaml` per adapter

### Phase 3 — Adapter breadth (2-3 weeks)
- Adapters: cursor, cline, crush, aider, continue
- Capability matrix surfaced in `agentir adapter list`

### Phase 4 — UX polish (2 weeks)
- `watch`, `doctor`, `--explain`
- Three-way merge for `import --merge`
- Migration framework

### Phase 5 — v1.0 release
- Documentation site
- Publish to npm under `@leclabs/agentir`
- GitHub release on `leclabs/agentir`
- Community adapter SDK published as `@leclabs/agentir-adapter-sdk`

## 15. Testing Strategy

### Golden-file tests
Every adapter ships a `fixtures/` directory of canonical client configs. Tests:
1. **Read fidelity**: `read(fixture)` produces a snapshot IR; compared against checked-in golden IR.
2. **Write fidelity**: `write(golden_ir)` produces files; compared against checked-in golden client config.
3. **Round-trip**: `read(write(read(fixture)))` equals `read(fixture)`.

### Cross-adapter tests
For the lossless subset, IR generated from adapter A should compile via adapter B and round-trip back through A unchanged.

### Property tests
Use fast-check to generate random valid IRs in the lossless subset; assert round-trip identity.

### Integration tests
`agentir compile` against a sandboxed `.claude/` and `.opencode/`, assert the resulting configs are loaded correctly by spawning each client in `--check` modes where available.

### CI
- Unit + property tests on every PR
- Integration tests gated to nightly (require client binaries)
- Drift in canonical event taxonomy guarded by a static check against the equivalence matrix

## 16. Open Questions

1. **Hook payload shim:** do we ship one binary `agentir-hook-shim` that all adapters reference, or inline the shim per adapter? Single binary is cleaner but introduces a runtime dependency on agentir being installed.
2. **Plugin marketplaces:** should `plugins.yaml` install Claude Code plugins by extracting their resources into the IR, or should it pass through as a Claude-only directive? Extraction is the more principled path but loses the marketplace update mechanism.
3. **MCP discovery:** punt entirely to `mcp-get`/`smithery`, or provide a thin wrapper command (`agentir mcp add github`)?
4. **Config-as-code:** should we offer a TypeScript-authored alternative to YAML manifests (à la `tsconfig.json`)? Lower priority but a long-term ergonomic win.
5. **Subagent format superset:** Claude's subagent format is the most expressive today, but Codex's TOML-based agents have features Claude lacks (per-agent reasoning effort). Need a side-by-side audit before locking the IR.
6. **Watch mode UX:** debounce, batched compiles, per-target watch, vs. compile-all on any change.
7. **Telemetry:** none in v1, but we should leave a hook for opt-in usage stats so we can prioritize adapter work.

## Appendix A — Initial Adapter Coverage

Resource × adapter matrix for v1.0. ✅ = full · 🟡 = partial · ❌ = absent.

| Resource | claude | opencode | codex | gemini | copilot | cursor | cline | crush | aider | continue |
|---|---|---|---|---|---|---|---|---|---|---|
| Rules | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Skills | ✅ | 🟡 | ✅ | 🟡 | ✅ | 🟡 | ❌ | 🟡 | ❌ | ❌ |
| Commands | ✅ | 🟡 | ✅ | 🟡 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Subagents | ✅ | ❌ | ✅ | ✅ | 🟡 | 🟡 | ❌ | ❌ | ❌ | ❌ |
| Hooks | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| MCP | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | ✅ |
| Permissions | ✅ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | ❌ | 🟡 | ❌ |
| Env | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ |

## Appendix B — Naming

**Name `agentir` is locked.** Selected because it directly emphasizes the IR-centric architecture — the central technical claim of the project — and pairs cleanly with the leclabs namespace.

Alternatives considered and rejected:
- `aconf` — shorter but underspecified; loses the IR framing
- `agentcfg` — descriptive but less brandable
- `unirc` — "unified rc" obscure to newcomers
- `confab` — cute but loses the "agent" anchor
- `polyglot-agent` — verbose
- `rosetta` — namespace likely contested

Pronunciation: "agent-IR" (IR as in "intermediate representation").

Locked across: npm `@leclabs/agentir`, GitHub `leclabs/agentir`, binary `agentir`, IR directory `.agentir/`, manifest field `agentir: 1`.

## Appendix C — Distribution

- **GitHub:** `github.com/leclabs/agentir` (monorepo)
- **npm packages:**
  - `@leclabs/agentir` — CLI (installs binary `agentir`)
  - `@leclabs/agentir-core` — IR types, schema, engine
  - `@leclabs/agentir-adapter-sdk` — public SDK for community adapters
  - `@leclabs/agentir-adapter-<client>` — per-client adapters
- **Homebrew (later):** `leclabs/tap/agentir`
- **License:** MIT (matches the rest of the agent-config ecosystem)

---

*End of design document v0.1.*
