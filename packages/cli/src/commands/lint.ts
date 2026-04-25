import {
  readIR,
  validateIR,
  formatErrors,
  type Adapter,
  type Scope,
  type ResourceType,
  type Support,
} from '@leclabs/agentir-core';
import pc from 'picocolors';

export interface LintOpts {
  scope?: Scope;
  strict?: boolean;
  cwd?: string;
}

export async function runLint(opts: LintOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();

  let ir;
  try {
    ir = await readIR(scope, cwd);
  } catch (e) {
    console.error(pc.red('✗'), (e as Error).message);
    return 2;
  }

  if (!validateIR(ir)) {
    for (const err of formatErrors(validateIR.errors)) {
      console.error(pc.red('✗'), `${err.path}: ${err.message}`);
    }
    return 2;
  }
  console.log(pc.green('✓'), 'IR valid against schema v1');

  // Capability check vs declared targets
  const issues: string[] = [];
  for (const targetId of ir.manifest.targets) {
    const adapter = adapters.find((a) => a.id === targetId);
    if (!adapter) {
      issues.push(`target '${targetId}': adapter not installed`);
      continue;
    }
    const cap = adapter.capabilities.resources;
    for (const [type, items] of resourceCounts(ir).entries()) {
      if (items === 0) continue;
      const support: Support = cap[type as ResourceType];
      if (support === 'none') {
        issues.push(`target '${targetId}': ${items} ${type} resource(s) but adapter declares no support`);
      } else if (support === 'partial') {
        issues.push(`target '${targetId}': ${items} ${type} resource(s) — partial support, expect lossy translation`);
      }
    }
  }

  if (issues.length === 0) {
    console.log(pc.green('✓'), 'all resources supported by declared targets');
    return 0;
  }
  for (const i of issues) console.log(pc.yellow('⚠'), i);
  return opts.strict ? 2 : 0;
}

function resourceCounts(ir: { rules?: unknown[]; skills?: unknown[]; commands?: unknown[]; agents?: unknown[]; hooks?: unknown[]; mcp_servers?: unknown[]; permissions?: unknown; env?: unknown }): Map<ResourceType, number> {
  return new Map<ResourceType, number>([
    ['rules', ir.rules?.length ?? 0],
    ['skills', ir.skills?.length ?? 0],
    ['commands', ir.commands?.length ?? 0],
    ['agents', ir.agents?.length ?? 0],
    ['hooks', ir.hooks?.length ?? 0],
    ['mcp', ir.mcp_servers?.length ?? 0],
    ['permissions', ir.permissions ? 1 : 0],
    ['env', ir.env ? 1 : 0],
  ]);
}
