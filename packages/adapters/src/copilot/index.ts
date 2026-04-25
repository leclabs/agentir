import { existsSync } from 'node:fs';
import type {
  Adapter,
  AdapterCapabilities,
  IR,
  Scope,
  WriteOpts,
  WriteReport,
} from '@leclabs/agentir-core';
import { canonicalToCopilot } from './events.js';
import { paths } from './paths.js';
import { readCopilot } from './read.js';
import { writeCopilot } from './write.js';

const capabilities: AdapterCapabilities = {
  resources: {
    rules: 'full',
    skills: 'full',
    commands: 'none',
    agents: 'partial',  // Copilot subagent support is experimental
    hooks: 'partial',   // 8 of 28 canonical events
    mcp: 'full',
    permissions: 'none', // VS Code settings, not in scope
    env: 'partial',
  },
  hooks: {
    supported: [
      'session.start',
      'prompt.submit',
      'tool.use.pre',
      'tool.use.post',
      'context.compact.pre',
      'subagent.start',
      'subagent.end',
      'turn.end',
    ],
    matchers: 'glob',
    payload: 'claude-json',
  },
  scopes: ['user', 'project'],
};

export const copilotAdapter: Adapter = {
  id: 'copilot',
  capabilities,
  eventMap: canonicalToCopilot,
  async detect(scope: Scope, cwd: string): Promise<boolean> {
    const p = paths(scope, cwd);
    return (
      existsSync(p.rulesFile) ||
      existsSync(p.skillsDir) ||
      existsSync(p.mcpFile) ||
      existsSync(p.hooksFile)
    );
  },
  async read(scope: Scope, cwd: string): Promise<Partial<IR>> {
    return readCopilot(scope, cwd);
  },
  async write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport> {
    return writeCopilot(ir, scope, cwd, opts);
  },
};

export default copilotAdapter;
export { paths } from './paths.js';
export { canonicalToCopilot, copilotToCanonical } from './events.js';
