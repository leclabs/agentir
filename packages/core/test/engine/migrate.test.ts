import { describe, expect, it } from 'vitest';
import { migrate, listMigrations, registerMigration } from '../../src/engine/migrate.js';

describe('migrate', () => {
  it('is a no-op when from === to', () => {
    const ir = { agentir: 1, foo: 'bar' };
    expect(migrate(ir, 1, 1)).toBe(ir);
  });

  it('throws when no migration path exists', () => {
    expect(() => migrate({}, 1, 99)).toThrow(/No migration path/);
  });

  it('applies a single registered migration', () => {
    registerMigration({
      from: 1,
      to: 2,
      description: 'test: 1 → 2',
      apply: (ir: unknown) => ({ ...(ir as object), migrated: true }),
    });
    const out = migrate({ agentir: 1 }, 1, 2) as { migrated?: boolean };
    expect(out.migrated).toBe(true);
  });

  it('walks a multi-step path', () => {
    registerMigration({
      from: 2,
      to: 3,
      apply: (ir: unknown) => ({ ...(ir as object), step2: true }),
    });
    const out = migrate({}, 1, 3) as { migrated?: boolean; step2?: boolean };
    expect(out.migrated).toBe(true);
    expect(out.step2).toBe(true);
  });

  it('listMigrations returns the registry', () => {
    expect(listMigrations().length).toBeGreaterThanOrEqual(2);
  });
});
