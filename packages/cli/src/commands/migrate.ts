import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump, load } from 'js-yaml';
import {
  findIRRoot,
  listMigrations,
  migrate,
  type Manifest,
  type Scope,
} from '@leclabs/agentir-core';
import pc from 'picocolors';

export interface MigrateOpts {
  from?: number;
  to?: number;
  scope?: Scope;
  cwd?: string;
}

const CURRENT_SCHEMA_VERSION = 1;

export async function runMigrate(opts: MigrateOpts): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();
  const root = findIRRoot(scope, cwd);
  if (!root) {
    console.error(pc.red(`agentir migrate: no .agentir/ found for scope '${scope}'`));
    return 2;
  }

  const manifestPath = join(root, 'manifest.yaml');
  if (!existsSync(manifestPath)) {
    console.error(pc.red('agentir migrate: missing manifest.yaml'));
    return 2;
  }

  const manifest = load(await readFile(manifestPath, 'utf8')) as Manifest;
  const from = opts.from ?? manifest.agentir;
  const to = opts.to ?? CURRENT_SCHEMA_VERSION;

  if (from === to) {
    console.log(
      pc.green('✓'),
      `IR is already at schema v${to}`,
      pc.gray(`(${listMigrations().length} migrations registered)`),
    );
    return 0;
  }

  console.log(pc.bold(`migrating IR v${from} → v${to}`));
  // Read full IR as raw YAML/JSON, apply migrations, write back.
  // For v1 (current) → v1, this is a no-op. When v2 ships, migrations are applied here.
  try {
    const migrated = migrate(manifest, from, to) as Manifest;
    migrated.agentir = to as 1;  // schema version field always reflects target
    await writeFile(
      manifestPath,
      dump(migrated, { lineWidth: 100, noRefs: true }),
      'utf8',
    );
    console.log(pc.green('✓'), `manifest schema upgraded to v${to}`);
    return 0;
  } catch (e) {
    console.error(pc.red('agentir migrate:'), (e as Error).message);
    return 1;
  }
}
