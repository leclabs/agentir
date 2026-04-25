import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const STATE_FILENAME = '.compile-state.json';
export const STATE_VERSION = 1 as const;

export interface FileHash {
  path: string;
  hash: string;
}

export interface AdapterState {
  files: FileHash[];
  timestamp: string;
}

export interface CompileState {
  version: typeof STATE_VERSION;
  adapters: Record<string, AdapterState>;
}

export interface DriftEntry {
  path: string;
  status: 'modified' | 'missing';
  recordedHash: string;
  currentHash: string | null;
}

export interface DriftReport {
  adapter: string;
  drifted: DriftEntry[];
  cleanCount: number;
}

/**
 * Compute the SHA-256 hex digest of a file's contents.
 */
export async function hashFile(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Record the set of emitted files for an adapter into `<stateDir>/.compile-state.json`.
 * Paths are normalized to be relative to `cwd` for portability across machines.
 */
export async function recordCompileState(
  stateDir: string,
  adapter: string,
  cwd: string,
  files: string[],
): Promise<void> {
  const state = await readState(stateDir);
  const entries: FileHash[] = [];
  for (const f of files) {
    const abs = isAbsolute(f) ? f : resolve(cwd, f);
    const rel = relative(cwd, abs);
    entries.push({ path: rel, hash: await hashFile(abs) });
  }
  state.adapters[adapter] = {
    files: entries,
    timestamp: new Date().toISOString(),
  };
  await writeState(stateDir, state);
}

/**
 * Detect drift between the recorded compile state and current on-disk content.
 * Returns a report of files that have been modified or deleted since the last
 * compile.
 */
export async function detectDrift(
  stateDir: string,
  adapter: string,
  cwd: string,
): Promise<DriftReport> {
  const state = await readState(stateDir);
  const adapterState = state.adapters[adapter];
  if (!adapterState) {
    return { adapter, drifted: [], cleanCount: 0 };
  }
  const drifted: DriftEntry[] = [];
  let cleanCount = 0;
  for (const entry of adapterState.files) {
    const abs = resolve(cwd, entry.path);
    if (!existsSync(abs)) {
      drifted.push({
        path: entry.path,
        status: 'missing',
        recordedHash: entry.hash,
        currentHash: null,
      });
      continue;
    }
    const current = await hashFile(abs);
    if (current === entry.hash) {
      cleanCount++;
    } else {
      drifted.push({
        path: entry.path,
        status: 'modified',
        recordedHash: entry.hash,
        currentHash: current,
      });
    }
  }
  return { adapter, drifted, cleanCount };
}

async function readState(stateDir: string): Promise<CompileState> {
  const path = join(stateDir, STATE_FILENAME);
  if (!existsSync(path)) {
    return { version: STATE_VERSION, adapters: {} };
  }
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text) as CompileState;
  if (parsed.version !== STATE_VERSION) {
    throw new Error(
      `Unsupported compile-state version ${parsed.version} (expected ${STATE_VERSION})`,
    );
  }
  return parsed;
}

async function writeState(stateDir: string, state: CompileState): Promise<void> {
  const path = join(stateDir, STATE_FILENAME);
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
