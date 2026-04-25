import type { Adapter, WriteOpts, WriteReport } from '../adapter/types.js';
import type { IR, Scope } from '../ir/types.js';
import { recordCompileState } from './drift.js';

export interface CompileOpts {
  /** Skip writing to disk; collect what would be written and return it. */
  dryRun?: boolean;
  /** Abort the compile if any adapter reports warnings or skipped resources. */
  strict?: boolean;
  /** Include verbose substitution explanations in the report. */
  explain?: boolean;
  /**
   * Directory to record `.compile-state.json` into for drift tracking.
   * Typically the project's `.agentir/` root. If undefined, drift state is not
   * recorded for this compile.
   */
  stateDir?: string;
}

export interface AdapterCompileResult {
  adapter: string;
  detected: boolean;
  report?: WriteReport;
  error?: Error;
}

export interface CompileReport {
  scope: Scope;
  results: AdapterCompileResult[];
  totalWritten: number;
  totalSkipped: number;
  totalWarnings: number;
}

/**
 * Compile an IR to one or more adapters at the given scope.
 *
 * Per adapter: detect → write → record drift state. Aggregates per-adapter
 * `WriteReport`s into a single `CompileReport`.
 *
 * - `strict` mode aborts the entire compile on the first adapter that reports
 *   any warning or skipped resource.
 * - `dryRun` skips writes (adapters are still called and may simulate); drift
 *   state is not recorded.
 */
export async function compile(
  ir: IR,
  adapters: Adapter[],
  scope: Scope,
  cwd: string,
  opts: CompileOpts = {},
): Promise<CompileReport> {
  const results: AdapterCompileResult[] = [];

  for (const adapter of adapters) {
    const result: AdapterCompileResult = { adapter: adapter.id, detected: false };
    try {
      result.detected = await adapter.detect(scope, cwd);
      const writeOpts: WriteOpts = {
        dryRun: opts.dryRun,
        strict: opts.strict,
        explain: opts.explain,
      };
      const report = await adapter.write(ir, scope, cwd, writeOpts);
      result.report = report;

      if (opts.strict && (report.warnings.length > 0 || report.skipped.length > 0)) {
        result.error = new Error(
          `[${adapter.id}] strict: ${report.warnings.length} warning(s), ${report.skipped.length} skipped`,
        );
        results.push(result);
        return finalize(results, scope);
      }

      if (!opts.dryRun && opts.stateDir && report.written.length > 0) {
        await recordCompileState(opts.stateDir, adapter.id, cwd, report.written);
      }
    } catch (err) {
      result.error = err as Error;
      if (opts.strict) {
        results.push(result);
        return finalize(results, scope);
      }
    }
    results.push(result);
  }

  return finalize(results, scope);
}

function finalize(results: AdapterCompileResult[], scope: Scope): CompileReport {
  let totalWritten = 0;
  let totalSkipped = 0;
  let totalWarnings = 0;
  for (const r of results) {
    if (!r.report) continue;
    totalWritten += r.report.written.length;
    totalSkipped += r.report.skipped.length;
    totalWarnings += r.report.warnings.length;
  }
  return { scope, results, totalWritten, totalSkipped, totalWarnings };
}
