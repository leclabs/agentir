import { existsSync } from 'node:fs';
import type {
  Adapter,
  AdapterCapabilities,
  IR,
  Scope,
  WriteOpts,
  WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToOpencode } from './events.js';
import { paths } from './paths.js';
import { readOpencode } from './read.js';
import { writeOpencode } from './write.js';

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'partial',     // SKILL.md round-trips, but allowed_tools is dropped
    commands: 'none',
    agents: 'none',
    hooks: 'partial',      // 13 of 28 canonical events mapped
    mcp: 'full',
    permissions: 'partial',// emitted as JSON; opencode's native DSL not honored
    env: 'full',
  },
  hooks: {
    supported: [
      'session.start',
      'session.end',
      'agent.idle',
      'turn.end',
      'tool.use.pre',
      'tool.use.post',
      'file.edit.post',
      'file.change.external',
      'shell.exec.post',
      'permission.request',
      'permission.deny',
      'notification',
      'context.compact.post',
    ],
    matchers: 'glob',
    payload: 'shim',
  },
  scopes: ['user', 'project'],
};

export const opencodeAdapter: Adapter = {
  id: 'opencode',
  capabilities,
  eventMap: canonicalToOpencode,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.opencodeDir) || existsSync(p.rulesFile);
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    return readOpencode(scope, cwd);
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport> {
    return writeOpencode(ir, scope, cwd, opts);
  },
};

export default opencodeAdapter;
export { paths } from './paths.js';
export { canonicalToOpencode, opencodeToCanonical } from './events.js';
