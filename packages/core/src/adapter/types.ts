import type { CanonicalEvent, IR, Scope } from '../ir/types.js';

export type ResourceType =
  | 'rules'
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'mcp'
  | 'permissions'
  | 'env';

export type Support = 'full' | 'partial' | 'none';

export interface AdapterCapabilities {
  resources: Record<ResourceType, Support>;
  hooks: {
    supported: CanonicalEvent[];
    matchers: 'glob' | 'literal' | 'none';
    payload: 'claude-json' | 'native' | 'shim';
  };
  scopes: Scope[];
}

export interface WriteOpts {
  dryRun?: boolean;
  strict?: boolean;
  explain?: boolean;
}

export interface WriteReport {
  written: string[];
  skipped: { path: string; reason: string }[];
  warnings: string[];
}

/**
 * Adapter-published mapping from canonical event names to the adapter's native
 * event names. Absence of a key (or a null value) means the canonical event has
 * no native equivalent — emitting it triggers a warning + skip on write.
 */
export type EventMap = Partial<Record<CanonicalEvent, string | null>>;

/**
 * The contract every agentir adapter implements. Adapters are pure: given the
 * same input, they produce the same output. State lives in the filesystem.
 */
export interface Adapter {
  id: string;
  capabilities: AdapterCapabilities;
  /**
   * Canonical → native event mapping. Adapters without hook support may omit.
   * Surfaced via `agentir events list --client <id>`.
   */
  eventMap?: EventMap;
  detect(scope: Scope, cwd: string): Promise<boolean>;
  read(scope: Scope, cwd: string): Promise<Partial<IR>>;
  write(ir: IR, scope: Scope, cwd: string, opts: WriteOpts): Promise<WriteReport>;
}
