import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { dump, load } from 'js-yaml';

import {
  parseAgent,
  parseCommand,
  parseHook,
  parseRule,
  parseSkill,
  serializeAgent,
  serializeCommand,
  serializeHook,
  serializeRule,
  serializeSkill,
} from '../serialize/index.js';
import {
  formatErrors,
  validateIR,
  type ValidationError,
} from '../ir/validator.js';
import type {
  Agent,
  Command,
  EnvVars,
  Hook,
  IR,
  Manifest,
  McpServer,
  Permissions,
  Rule,
  Scope,
  Skill,
} from '../ir/types.js';
import { findIRRoot, IR_DIRNAME, LOCAL_SUBDIR } from './paths.js';

export class IRValidationError extends Error {
  constructor(public errors: ValidationError[]) {
    super(
      `IR validation failed:\n${errors
        .map((e) => `  ${e.path}: ${e.message}`)
        .join('\n')}`,
    );
    this.name = 'IRValidationError';
  }
}

/**
 * Canonical path of the .agentir/ directory for a scope, whether or not it
 * exists. Used by writeIR and init.
 */
export function defaultIRRoot(scope: Scope, cwd: string): string {
  if (scope === 'user') return join(homedir(), IR_DIRNAME);
  if (scope === 'local') return join(cwd, IR_DIRNAME, LOCAL_SUBDIR);
  return join(cwd, IR_DIRNAME);
}

/**
 * Read the IR for a given scope by walking the on-disk `.agentir/` directory.
 *
 * Throws if the directory cannot be located, the manifest is missing, or the
 * assembled IR fails schema validation.
 */
export async function readIR(scope: Scope, cwd: string): Promise<IR> {
  const root = findIRRoot(scope, cwd);
  if (!root || !existsSync(root)) {
    throw new Error(
      `Cannot read IR for scope '${scope}': no .agentir/ found from ${cwd}`,
    );
  }

  const manifest = await readManifest(root);
  const ir: IR = { manifest };

  const rules = await readResourceDir<Rule>(join(root, 'rules'), '.md', parseRule);
  if (rules.length) ir.rules = rules;

  const skills = await readSkillsDir(join(root, 'skills'));
  if (skills.length) ir.skills = skills;

  const commands = await readResourceDir<Command>(
    join(root, 'commands'),
    '.md',
    parseCommand,
  );
  if (commands.length) ir.commands = commands;

  const agents = await readResourceDir<Agent>(
    join(root, 'agents'),
    '.md',
    parseAgent,
  );
  if (agents.length) ir.agents = agents;

  const hooks = await readResourceDir<Hook>(
    join(root, 'hooks'),
    '.yaml',
    parseHook,
  );
  if (hooks.length) ir.hooks = hooks;

  const mcp = await readMcpServers(join(root, 'mcp', 'servers.yaml'));
  if (mcp && mcp.length) ir.mcp_servers = mcp;

  const perms = await readYamlIfExists<Permissions>(join(root, 'permissions.yaml'));
  if (perms) ir.permissions = perms;

  const env = await readYamlIfExists<EnvVars>(join(root, 'env.yaml'));
  if (env) ir.env = env;

  if (!validateIR(ir)) {
    throw new IRValidationError(formatErrors(validateIR.errors));
  }
  return ir;
}

/**
 * Write an IR to disk under the canonical `.agentir/` path for the given scope.
 * Validates the IR before any writes; throws `IRValidationError` if invalid.
 *
 * Existing files are overwritten. Files that no longer correspond to an IR
 * resource are NOT removed (use `clean` separately).
 */
export async function writeIR(ir: IR, scope: Scope, cwd: string): Promise<void> {
  if (!validateIR(ir)) {
    throw new IRValidationError(formatErrors(validateIR.errors));
  }

  const root = defaultIRRoot(scope, cwd);
  await mkdir(root, { recursive: true });

  await writeFile(
    join(root, 'manifest.yaml'),
    dump(ir.manifest, { lineWidth: 100, noRefs: true }),
    'utf8',
  );

  if (ir.rules) {
    await writeResourceDir(
      join(root, 'rules'),
      ir.rules,
      (r) => r.id,
      '.md',
      serializeRule,
    );
  }
  if (ir.skills) {
    await writeSkillsDir(join(root, 'skills'), ir.skills);
  }
  if (ir.commands) {
    await writeResourceDir(
      join(root, 'commands'),
      ir.commands,
      (c) => c.name,
      '.md',
      serializeCommand,
    );
  }
  if (ir.agents) {
    await writeResourceDir(
      join(root, 'agents'),
      ir.agents,
      (a) => a.name,
      '.md',
      serializeAgent,
    );
  }
  if (ir.hooks) {
    await writeResourceDir(
      join(root, 'hooks'),
      ir.hooks,
      (h, i) => h.id ?? `hook-${i}`,
      '.yaml',
      serializeHook,
    );
  }
  if (ir.mcp_servers && ir.mcp_servers.length) {
    const dir = join(root, 'mcp');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'servers.yaml'),
      dump({ servers: ir.mcp_servers }, { lineWidth: 100, noRefs: true }),
      'utf8',
    );
  }
  if (ir.permissions) {
    await writeFile(
      join(root, 'permissions.yaml'),
      dump(ir.permissions, { lineWidth: 100, noRefs: true }),
      'utf8',
    );
  }
  if (ir.env) {
    await writeFile(
      join(root, 'env.yaml'),
      dump(ir.env, { lineWidth: 100, noRefs: true }),
      'utf8',
    );
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function readManifest(root: string): Promise<Manifest> {
  const path = join(root, 'manifest.yaml');
  if (!existsSync(path)) {
    throw new Error(`Missing manifest.yaml at ${path}`);
  }
  const text = await readFile(path, 'utf8');
  const parsed = load(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`manifest.yaml at ${path} must be a YAML mapping`);
  }
  return parsed as Manifest;
}

async function readResourceDir<T>(
  dir: string,
  ext: string,
  parse: (text: string, defaultId: string) => T,
): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: T[] = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(ext)) continue;
    const id = basename(entry, ext);
    const text = await readFile(join(dir, entry), 'utf8');
    out.push(parse(text, id));
  }
  return out;
}

async function readSkillsDir(dir: string): Promise<Skill[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: Skill[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(dir, entry.name, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const text = await readFile(skillFile, 'utf8');
    out.push(parseSkill(text, entry.name));
  }
  return out;
}

async function readMcpServers(path: string): Promise<McpServer[] | undefined> {
  if (!existsSync(path)) return undefined;
  const text = await readFile(path, 'utf8');
  const parsed = (load(text) ?? {}) as { servers?: McpServer[] };
  return parsed.servers;
}

async function readYamlIfExists<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  const text = await readFile(path, 'utf8');
  const parsed = load(text);
  return (parsed ?? undefined) as T | undefined;
}

async function writeResourceDir<T>(
  dir: string,
  items: T[],
  idFn: (item: T, index: number) => string,
  ext: string,
  serialize: (item: T) => string,
): Promise<void> {
  if (!items.length) return;
  await mkdir(dir, { recursive: true });
  await Promise.all(
    items.map((item, i) =>
      writeFile(join(dir, `${idFn(item, i)}${ext}`), serialize(item), 'utf8'),
    ),
  );
}

async function writeSkillsDir(dir: string, skills: Skill[]): Promise<void> {
  if (!skills.length) return;
  await mkdir(dir, { recursive: true });
  for (const skill of skills) {
    const skillDir = join(dir, skill.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), serializeSkill(skill), 'utf8');
  }
}
