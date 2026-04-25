import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  defaultIRRoot,
  detectDrift,
  findIRRoot,
  formatErrors,
  STATE_FILENAME,
  STATE_VERSION,
  validateManifest,
  type Adapter,
  type Manifest,
  type Scope,
} from '@leclabs/agentir-core';
import { load } from 'js-yaml';
import pc from 'picocolors';

export interface DoctorOpts {
  scope?: Scope;
  cwd?: string;
}

interface CheckResult {
  status: 'pass' | 'warn' | 'fail';
  label: string;
  detail?: string;
}

function fmt(r: CheckResult): string {
  const sym =
    r.status === 'pass' ? pc.green('✓') : r.status === 'warn' ? pc.yellow('⚠') : pc.red('✗');
  const detail = r.detail ? pc.gray(`  ${r.detail}`) : '';
  return `${sym} ${r.label}${detail}`;
}

export async function runDoctor(opts: DoctorOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();
  const root = findIRRoot(scope, cwd);
  const targetRoot = root ?? defaultIRRoot(scope, cwd);

  console.log(pc.bold(`agentir doctor`), pc.gray(`(scope: ${scope}, cwd: ${cwd})`));
  console.log('');

  let failures = 0;
  let warnings = 0;

  // 1. .agentir/ presence
  if (root && existsSync(root)) {
    console.log(fmt({ status: 'pass', label: '.agentir/ exists', detail: root }));
  } else {
    console.log(
      fmt({
        status: 'warn',
        label: `.agentir/ not found for scope '${scope}'`,
        detail: `would be created at ${targetRoot}; run \`agentir init\``,
      }),
    );
    warnings++;
    console.log('');
    console.log(`${pc.yellow('⚠')} Skipping further checks (no IR to inspect)`);
    return 0;
  }

  // 2. Manifest validity
  let manifest: Manifest | null = null;
  const manifestPath = join(root, 'manifest.yaml');
  if (!existsSync(manifestPath)) {
    console.log(fmt({ status: 'fail', label: 'manifest.yaml: missing' }));
    failures++;
  } else {
    try {
      const text = await readFile(manifestPath, 'utf8');
      const parsed = load(text);
      if (!validateManifest(parsed)) {
        const errs = formatErrors(validateManifest.errors);
        console.log(
          fmt({
            status: 'fail',
            label: 'manifest.yaml: schema-invalid',
            detail: errs.map((e) => `${e.path}: ${e.message}`).join('; '),
          }),
        );
        failures++;
      } else {
        manifest = parsed as Manifest;
        console.log(
          fmt({
            status: 'pass',
            label: 'manifest.yaml: valid',
            detail: `agentir v${manifest.agentir}, scope ${manifest.scope}, ${manifest.targets.length} target(s)`,
          }),
        );
      }
    } catch (e) {
      console.log(
        fmt({
          status: 'fail',
          label: 'manifest.yaml: unparseable',
          detail: (e as Error).message,
        }),
      );
      failures++;
    }
  }

  // 3. Compile state
  const statePath = join(root, STATE_FILENAME);
  if (!existsSync(statePath)) {
    console.log(
      fmt({ status: 'warn', label: 'compile state: absent', detail: 'no prior compile recorded' }),
    );
    warnings++;
  } else {
    try {
      const state = JSON.parse(await readFile(statePath, 'utf8')) as { version: number; adapters: Record<string, { timestamp: string }> };
      if (state.version !== STATE_VERSION) {
        console.log(
          fmt({
            status: 'fail',
            label: `compile state: version mismatch`,
            detail: `expected ${STATE_VERSION}, got ${state.version}`,
          }),
        );
        failures++;
      } else {
        const ids = Object.keys(state.adapters);
        const lastCompile = ids
          .map((id) => state.adapters[id]?.timestamp)
          .filter((t): t is string => Boolean(t))
          .sort()
          .pop();
        console.log(
          fmt({
            status: 'pass',
            label: 'compile state: present',
            detail: `${ids.length} adapter(s) recorded${lastCompile ? `, last: ${lastCompile}` : ''}`,
          }),
        );
      }
    } catch (e) {
      console.log(
        fmt({ status: 'fail', label: 'compile state: corrupt', detail: (e as Error).message }),
      );
      failures++;
    }
  }

  // 4. Per-target detection + drift
  if (manifest && manifest.targets.length > 0) {
    console.log('');
    console.log(pc.bold('Target detection:'));
    for (const targetId of manifest.targets) {
      const adapter = adapters.find((a) => a.id === targetId);
      if (!adapter) {
        console.log(`  ${fmt({ status: 'fail', label: `${targetId}: adapter not installed` })}`);
        failures++;
        continue;
      }
      try {
        const detected = await adapter.detect(scope, cwd);
        if (detected) {
          // Check drift if state has this adapter
          const drift = await detectDrift(root, adapter.id, cwd);
          if (drift.drifted.length > 0) {
            console.log(
              `  ${fmt({
                status: 'warn',
                label: `${targetId}: detected, ${drift.drifted.length} drifted file(s)`,
              })}`,
            );
            warnings++;
          } else {
            console.log(
              `  ${fmt({
                status: 'pass',
                label: `${targetId}: detected`,
                detail: drift.cleanCount > 0 ? `${drift.cleanCount} file(s) clean` : undefined,
              })}`,
            );
          }
        } else {
          console.log(
            `  ${fmt({
              status: 'warn',
              label: `${targetId}: no config detected (will be created on compile)`,
            })}`,
          );
          warnings++;
        }
      } catch (e) {
        console.log(
          `  ${fmt({ status: 'fail', label: `${targetId}: detect() failed`, detail: (e as Error).message })}`,
        );
        failures++;
      }
    }
  }

  // Summary
  console.log('');
  if (failures > 0) {
    console.log(pc.red(`${failures} failure(s), ${warnings} warning(s)`));
    return 1;
  }
  if (warnings > 0) {
    console.log(pc.yellow(`${warnings} warning(s)`));
  } else {
    console.log(pc.green('all checks passed'));
  }
  return 0;
}
