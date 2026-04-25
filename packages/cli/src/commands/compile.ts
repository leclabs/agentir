import {
  compile,
  defaultIRRoot,
  readIR,
  type Adapter,
  type CompileReport,
  type Scope,
} from '@leclabs/agentir-core';
import pc from 'picocolors';

export interface CompileOpts {
  clients?: string[];
  scope?: Scope;
  dryRun?: boolean;
  strict?: boolean;
  explain?: boolean;
  cwd?: string;
}

export async function runCompile(opts: CompileOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();

  let ir;
  try {
    ir = await readIR(scope, cwd);
  } catch (e) {
    console.error(pc.red(`agentir: ${(e as Error).message}`));
    return 2;
  }

  const targetIds =
    opts.clients && opts.clients.length > 0 ? opts.clients : ir.manifest.targets;
  if (targetIds.length === 0) {
    console.error(
      pc.yellow('agentir: no targets — declare some in manifest.yaml or pass clients on CLI'),
    );
    return 1;
  }
  const targets: Adapter[] = [];
  for (const id of targetIds) {
    const a = adapters.find((x) => x.id === id);
    if (!a) {
      console.error(pc.red(`agentir: unknown adapter '${id}'`));
      return 1;
    }
    targets.push(a);
  }

  const stateDir = defaultIRRoot('project', cwd);
  const report = await compile(ir, targets, scope, cwd, {
    dryRun: opts.dryRun,
    strict: opts.strict,
    explain: opts.explain,
    stateDir,
  });

  printReport(report, opts);
  const hasError = report.results.some((r) => r.error);
  return hasError ? (opts.strict ? 4 : 1) : 0;
}

function printReport(report: CompileReport, opts: CompileOpts): void {
  for (const r of report.results) {
    const head = r.error
      ? pc.red(`✗ ${r.adapter}`)
      : r.report && r.report.warnings.length > 0
        ? pc.yellow(`⚠ ${r.adapter}`)
        : pc.green(`✓ ${r.adapter}`);
    const summary = r.report
      ? formatSummary(r.report.written.length, r.report.warnings.length, r.report.skipped.length)
      : r.error?.message ?? '';
    console.log(`${head}  ${summary}`);

    if (opts.explain && r.report) {
      // Group warnings/skips for readability
      const warnings = r.report.warnings;
      const skipped = r.report.skipped;
      if (warnings.length === 0 && skipped.length === 0) continue;

      // Skips grouped by reason
      const byReason = new Map<string, string[]>();
      for (const s of skipped) {
        const list = byReason.get(s.reason) ?? [];
        list.push(s.path);
        byReason.set(s.reason, list);
      }
      if (warnings.length > 0) {
        console.log(`    ${pc.bold(pc.yellow('warnings:'))}`);
        for (const w of warnings) console.log(`      ${pc.yellow('•')} ${w}`);
      }
      if (byReason.size > 0) {
        console.log(`    ${pc.bold(pc.gray('skipped:'))}`);
        for (const [reason, paths] of byReason) {
          console.log(`      ${pc.gray('•')} ${pc.gray(reason)} (${paths.length})`);
          for (const p of paths) console.log(`          ${pc.gray(p)}`);
        }
      }
    }
  }

  // Footer summary across adapters
  const adapters = report.results.length;
  const failed = report.results.filter((r) => r.error).length;
  console.log('');
  const footerSym =
    failed > 0 ? pc.red('✗') : report.totalWarnings > 0 ? pc.yellow('⚠') : pc.green('✓');
  const footerWords = `${adapters} adapter${adapters === 1 ? '' : 's'} · ${report.totalWritten} files written · ${report.totalWarnings} warning${report.totalWarnings === 1 ? '' : 's'} · ${report.totalSkipped} skipped${failed ? ` · ${failed} failed` : ''}`;
  console.log(`${footerSym} ${footerWords}`);
}

function formatSummary(written: number, warnings: number, skipped: number): string {
  return `${written} written · ${pc.yellow(`${warnings} warn`)} · ${pc.gray(`${skipped} skip`)}`;
}
