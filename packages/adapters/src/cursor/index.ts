import { existsSync } from 'node:fs';
import type {
  Adapter,
  AdapterCapabilities,
  IR,
  Scope,
  WriteOpts,
  WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToCursor } from './events.js';
import { paths } from './paths.js';
import { readCursor } from './read.js';
import { writeCursor } from './write.js';

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'partial',
    commands: 'none',
    agents: 'partial',
    hooks: 'full',
    mcp: 'full',
    permissions: 'partial',
    env: 'none',
  },
  hooks: {
    supported: [
      'session.start',
      'session.end',
      'prompt.submit',
      'turn.end',
      'model.response.post',
      'tool.use.pre',
      'tool.use.post',
      'tool.use.fail',
      'file.read.pre',
      'file.edit.post',
      'shell.exec.pre',
      'shell.exec.post',
      'mcp.exec.pre',
      'mcp.exec.post',
      'subagent.start',
      'subagent.end',
      'context.compact.pre',
    ],
    matchers: 'glob',
    payload: 'native',
  },
  scopes: ['user', 'project'],
};

export const cursorAdapter: Adapter = {
  id: 'cursor',
  capabilities,
  eventMap: canonicalToCursor,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.cursorDir) || existsSync(p.rulesFile);
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    return readCursor(scope, cwd);
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport> {
    return writeCursor(ir, scope, cwd, opts);
  },
};

export default cursorAdapter;
export { paths } from './paths.js';
export { canonicalToCursor, cursorToCanonical } from './events.js';
