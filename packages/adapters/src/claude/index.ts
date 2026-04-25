import { existsSync } from 'node:fs';
import type {
  Adapter,
  AdapterCapabilities,
  IR,
  Scope,
  WriteOpts,
  WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToClaude } from './events.js';
import { paths } from './paths.js';
import { readClaude } from './read.js';
import { writeClaude } from './write.js';

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'full',
    commands: 'full',
    agents: 'full',
    hooks: 'full',
    mcp: 'full',
    permissions: 'full',
    env: 'full',
  },
  hooks: {
    supported: [
      'session.start',
      'session.end',
      'prompt.submit',
      'turn.end',
      'turn.fail',
      'agent.idle',
      'tool.use.pre',
      'tool.use.post',
      'tool.use.fail',
      'subagent.start',
      'subagent.end',
      'notification',
      'context.compact.pre',
      'context.compact.post',
      'file.change.external',
      'config.changed',
      'instructions.loaded',
      'permission.request',
      'permission.deny',
    ],
    matchers: 'glob',
    payload: 'claude-json',
  },
  scopes: ['user', 'project', 'local'],
};

export const claudeAdapter: Adapter = {
  id: 'claude',
  capabilities,
  eventMap: canonicalToClaude,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.claudeDir) || (p.rulesFile !== null && existsSync(p.rulesFile));
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    return readClaude(scope, cwd);
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport> {
    return writeClaude(ir, scope, cwd, opts);
  },
};

export default claudeAdapter;
export { paths } from './paths.js';
export { canonicalToClaude, claudeToCanonical } from './events.js';
