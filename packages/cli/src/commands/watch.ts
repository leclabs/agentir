import { findIRRoot, type Adapter, type Scope } from '@leclabs/agentir-core';
import chokidar from 'chokidar';
import pc from 'picocolors';
import { runCompile } from './compile.js';

export interface WatchOpts {
  clients?: string[];
  scope?: Scope;
  cwd?: string;
  /** Debounce window in ms (default 300) */
  debounce?: number;
  /** Stop after N rebuilds (for tests). Undefined = forever. */
  maxRebuilds?: number;
}

export async function runWatch(opts: WatchOpts, adapters: Adapter[]): Promise<number> {
  const scope = opts.scope ?? 'project';
  const cwd = opts.cwd ?? process.cwd();
  const debounceMs = opts.debounce ?? 300;
  const root = findIRRoot(scope, cwd);
  if (!root) {
    console.error(pc.red(`agentir watch: no .agentir/ found for scope '${scope}' from ${cwd}`));
    return 2;
  }

  console.log(pc.bold('agentir watch'), pc.gray(`(scope: ${scope}, watching: ${root})`));
  console.log(pc.gray(`debounce: ${debounceMs}ms · ctrl-c to exit`));
  console.log('');

  const watcher = chokidar.watch(root, {
    ignored: (p: string) => p.endsWith('.compile-state.json') || p.includes('/local/'),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  let rebuildCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingFiles = new Set<string>();
  let inFlight = false;
  let closing = false;
  let resolveExit!: (code: number) => void;
  const exitPromise = new Promise<number>((res) => {
    resolveExit = res;
  });

  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await watcher.close();
    console.log(pc.gray(`\nwatch stopped (${rebuildCount} rebuild${rebuildCount === 1 ? '' : 's'})`));
    resolveExit(0);
  };

  const compileNow = async (): Promise<void> => {
    if (inFlight) return;
    inFlight = true;
    const files = Array.from(pendingFiles);
    pendingFiles = new Set();
    rebuildCount++;
    const ts = new Date().toISOString().slice(11, 19);
    console.log(
      pc.gray(`[${ts}]`),
      pc.bold(`rebuild #${rebuildCount}`),
      pc.gray(`(${files.length} change${files.length === 1 ? '' : 's'})`),
    );
    try {
      const code = await runCompile({ ...opts, cwd }, adapters);
      if (code !== 0) console.log(pc.red(`  exit code ${code}`));
    } catch (e) {
      console.log(pc.red(`  ${(e as Error).message}`));
    }
    inFlight = false;
    if (opts.maxRebuilds !== undefined && rebuildCount >= opts.maxRebuilds) {
      void close();
    }
  };

  const onChange = (path: string): void => {
    pendingFiles.add(path);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void compileNow();
    }, debounceMs);
  };

  watcher.on('add', onChange);
  watcher.on('change', onChange);
  watcher.on('unlink', onChange);
  watcher.on('error', (err: unknown) => {
    console.error(pc.red(`watch error: ${(err as Error).message}`));
  });
  process.once('SIGINT', () => {
    void close();
  });

  return exitPromise;
}
