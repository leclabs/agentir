import { cac } from 'cac';
import { aiderAdapter } from '@leclabs/agentir-adapters/aider';
import { claudeAdapter } from '@leclabs/agentir-adapters/claude';
import { clineAdapter } from '@leclabs/agentir-adapters/cline';
import { codexAdapter } from '@leclabs/agentir-adapters/codex';
import { continueAdapter } from '@leclabs/agentir-adapters/continue';
import { copilotAdapter } from '@leclabs/agentir-adapters/copilot';
import { crushAdapter } from '@leclabs/agentir-adapters/crush';
import { cursorAdapter } from '@leclabs/agentir-adapters/cursor';
import { geminiAdapter } from '@leclabs/agentir-adapters/gemini';
import { opencodeAdapter } from '@leclabs/agentir-adapters/opencode';
import type { Adapter, Scope } from '@leclabs/agentir-core';
import { runInit } from './commands/init.js';
import { runImport } from './commands/import.js';
import { runCompile } from './commands/compile.js';
import { runDiff } from './commands/diff.js';
import { runDoctor } from './commands/doctor.js';
import { runEventsList } from './commands/events.js';
import { runLint } from './commands/lint.js';
import { runMigrate } from './commands/migrate.js';
import { runWatch } from './commands/watch.js';

const VERSION = '0.0.0';

const adapters: Adapter[] = [
  claudeAdapter,
  opencodeAdapter,
  codexAdapter,
  geminiAdapter,
  copilotAdapter,
  cursorAdapter,
  clineAdapter,
  crushAdapter,
  aiderAdapter,
  continueAdapter,
];

const cli = cac('agentir');

cli
  .command('init', 'Bootstrap a new .agentir/ directory')
  .option('--scope <scope>', 'user | project | local', { default: 'project' })
  .action(async (opts: { scope: Scope }) => {
    process.exit(await runInit({ scope: opts.scope }));
  });

cli
  .command('import <client>', 'Lift a client config into the IR')
  .option('--scope <scope>', '', { default: 'project' })
  .option('--from <path>', 'Read from this directory instead of cwd')
  .option('--merge', 'Merge into existing IR (preserve ours on conflict)')
  .action(async (client: string, opts: { scope: Scope; from?: string; merge?: boolean }) => {
    process.exit(
      await runImport(
        { client, scope: opts.scope, from: opts.from, merge: opts.merge },
        adapters,
      ),
    );
  });

cli
  .command('compile [...clients]', 'Compile IR to one or more clients')
  .option('--scope <scope>', '', { default: 'project' })
  .option('--dry-run', 'Skip writes; show what would change')
  .option('--strict', 'Abort on any warning or skipped resource')
  .option('--explain', 'Verbose substitution and skip explanations')
  .action(
    async (
      clients: string[],
      opts: { scope: Scope; dryRun?: boolean; strict?: boolean; explain?: boolean },
    ) => {
      process.exit(
        await runCompile(
          {
            clients,
            scope: opts.scope,
            dryRun: opts.dryRun,
            strict: opts.strict,
            explain: opts.explain,
          },
          adapters,
        ),
      );
    },
  );

cli
  .command('diff [...clients]', 'Show what would change on next compile, plus drift')
  .option('--scope <scope>', '', { default: 'project' })
  .action(async (clients: string[], opts: { scope: Scope }) => {
    process.exit(await runDiff({ clients, scope: opts.scope }, adapters));
  });

cli
  .command('lint', 'Validate the IR against schema and adapter capabilities')
  .option('--scope <scope>', '', { default: 'project' })
  .option('--strict', 'Treat capability warnings as errors')
  .action(async (opts: { scope: Scope; strict?: boolean }) => {
    process.exit(await runLint({ scope: opts.scope, strict: opts.strict }, adapters));
  });

cli.command('adapters', 'List installed adapters and their capabilities').action(() => {
  const RESOURCE_TYPES = ['rules', 'skills', 'commands', 'agents', 'hooks', 'mcp', 'permissions', 'env'] as const;
  const sym = (s: string) => (s === 'full' ? '✓' : s === 'partial' ? '🟡' : '—');
  const head = `ID${' '.repeat(8)}${RESOURCE_TYPES.map((t) => t.slice(0, 4).padEnd(5)).join('')} HOOKS  SCOPES`;
  console.log(head);
  for (const a of adapters) {
    const cells = RESOURCE_TYPES.map((t) => sym(a.capabilities.resources[t]).padEnd(5)).join('');
    const hookCount = a.capabilities.hooks.supported.length;
    const scopes = a.capabilities.scopes.join(',');
    console.log(`${a.id.padEnd(10)}${cells} ${String(hookCount).padStart(2)}/28  ${scopes}`);
  }
  process.exit(0);
});

cli
  .command('events', 'List canonical events and per-client mappings')
  .option('--client <id>', 'Show mapping for a specific adapter')
  .action(async (opts: { client?: string }) => {
    process.exit(await runEventsList({ client: opts.client }, adapters));
  });

cli
  .command('doctor', 'Diagnose installation, manifest, and target detection')
  .option('--scope <scope>', '', { default: 'project' })
  .action(async (opts: { scope: Scope }) => {
    process.exit(await runDoctor({ scope: opts.scope }, adapters));
  });

cli
  .command('watch [...clients]', 'Auto-recompile on IR changes')
  .option('--scope <scope>', '', { default: 'project' })
  .option('--debounce <ms>', '', { default: 300 })
  .action(async (clients: string[], opts: { scope: Scope; debounce: number }) => {
    process.exit(
      await runWatch({ clients, scope: opts.scope, debounce: Number(opts.debounce) }, adapters),
    );
  });

cli
  .command('migrate', 'Migrate the IR schema between versions')
  .option('--from <n>', 'Source schema version (defaults to manifest)')
  .option('--to <n>', 'Target schema version (defaults to latest)')
  .option('--scope <scope>', '', { default: 'project' })
  .action(async (opts: { from?: string; to?: string; scope: Scope }) => {
    process.exit(
      await runMigrate({
        from: opts.from !== undefined ? Number(opts.from) : undefined,
        to: opts.to !== undefined ? Number(opts.to) : undefined,
        scope: opts.scope,
      }),
    );
  });

cli.help();
cli.version(VERSION);
cli.parse();
