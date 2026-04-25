/**
 * Schema migration framework.
 *
 * v1 is the only schema version today; this framework is a placeholder that
 * establishes the API for future versions. When v2 lands, register
 * `{ from: 1, to: 2, apply: ... }` and `migrate(ir, 1, 2)` will run it.
 */

export interface Migration {
  from: number;
  to: number;
  description?: string;
  apply: (ir: unknown) => unknown;
}

const REGISTRY: Migration[] = [];

export function registerMigration(m: Migration): void {
  REGISTRY.push(m);
}

export function listMigrations(): readonly Migration[] {
  return REGISTRY;
}

/**
 * Apply migrations to bring an IR from version `from` to version `to`.
 * Walks the registry to find a path of single-step migrations.
 *
 * Throws if no path exists.
 */
export function migrate(ir: unknown, from: number, to: number): unknown {
  if (from === to) return ir;
  const path = findPath(from, to);
  if (!path) {
    throw new Error(`No migration path from v${from} to v${to}`);
  }
  let current = ir;
  for (const step of path) {
    current = step.apply(current);
  }
  return current;
}

function findPath(from: number, to: number): Migration[] | null {
  if (from === to) return [];
  // BFS over the migration graph
  const queue: { version: number; path: Migration[] }[] = [{ version: from, path: [] }];
  const visited = new Set<number>([from]);
  while (queue.length > 0) {
    const { version, path } = queue.shift()!;
    for (const m of REGISTRY) {
      if (m.from !== version || visited.has(m.to)) continue;
      const next = [...path, m];
      if (m.to === to) return next;
      visited.add(m.to);
      queue.push({ version: m.to, path: next });
    }
  }
  return null;
}
