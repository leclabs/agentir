import {
  defaultIRRoot,
  detectDrift,
  type Adapter,
  type Scope,
} from '@leclabs/agentir-core';
import pc from 'picocolors';
import { runCompile } from './compile.js';

export interface DiffOpts {
  clients?: string[];
  scope?: Scope;
  cwd?: string;
}

export async function runDiff(opts: DiffOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();

  // Pending: what would compile write?
  const pendingExitCode = await runCompile(
    { ...opts, dryRun: true, explain: false },
    adapters,
  );
  if (pendingExitCode !== 0) return pendingExitCode;

  // Drift: anything hand-edited since last compile?
  const stateDir = defaultIRRoot('project', cwd);
  let totalDrift = 0;
  for (const id of opts.clients && opts.clients.length > 0 ? opts.clients : []) {
    const adapter = adapters.find((a) => a.id === id);
    if (!adapter) continue;
    const drift = await detectDrift(stateDir, adapter.id, cwd);
    if (drift.drifted.length === 0) {
      console.log(pc.green('✓'), `${adapter.id}: ${drift.cleanCount} file(s) clean, no drift`);
    } else {
      totalDrift += drift.drifted.length;
      console.log(pc.yellow('⚠'), `${adapter.id}: ${drift.drifted.length} file(s) drifted`);
      for (const d of drift.drifted) {
        console.log(`    ${pc.yellow(d.status)}: ${d.path}`);
      }
    }
  }

  return totalDrift > 0 ? 3 : 0;
}
