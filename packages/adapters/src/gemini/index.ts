import { existsSync } from 'node:fs';
import type {
  Adapter,
  AdapterCapabilities,
  IR,
  Scope,
  WriteOpts,
  WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToGemini } from './events.js';
import { paths } from './paths.js';
import { readGemini } from './read.js';
import { writeGemini } from './write.js';

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'partial',     // SKILL.md works; some metadata may be ignored
    commands: 'none',
    agents: 'partial',     // .md subagents; conventions evolving
    hooks: 'full',         // 10 of 28 canonical events covered cleanly
    mcp: 'full',
    permissions: 'partial',
    env: 'full',
  },
  hooks: {
    supported: [
      'session.start',
      'session.end',
      'prompt.submit',
      'turn.end',
      'model.request.pre',
      'model.response.post',
      'tool.use.pre',
      'tool.use.post',
      'context.compact.pre',
      'notification',
    ],
    matchers: 'glob',
    payload: 'claude-json',
  },
  scopes: ['user', 'project'],
};

export const geminiAdapter: Adapter = {
  id: 'gemini',
  capabilities,
  eventMap: canonicalToGemini,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return existsSync(p.geminiDir) || existsSync(p.rulesFile);
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    return readGemini(scope, cwd);
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport> {
    return writeGemini(ir, scope, cwd, opts);
  },
};

export default geminiAdapter;
export { paths } from './paths.js';
export { canonicalToGemini, geminiToCanonical } from './events.js';
