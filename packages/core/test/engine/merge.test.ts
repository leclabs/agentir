import { describe, expect, it } from 'vitest';
import { mergeIR, type ScopedIR } from '../../src/engine/merge.js';
import type { IR, Manifest } from '../../src/ir/types.js';

const baseManifest = (overrides: Partial<Manifest> = {}): Manifest => ({
  agentir: 1,
  scope: 'project',
  targets: ['claude'],
  ...overrides,
});

const ir = (overrides: Partial<IR> = {}): IR => ({
  manifest: baseManifest(),
  ...overrides,
});

describe('mergeIR', () => {
  it('throws on empty scopes array', () => {
    expect(() => mergeIR([])).toThrow();
  });

  it('returns the closest scope manifest verbatim', () => {
    const scopes: ScopedIR[] = [
      { scope: 'user', ir: ir({ manifest: baseManifest({ scope: 'user', targets: ['claude'] }) }) },
      {
        scope: 'project',
        ir: ir({ manifest: baseManifest({ scope: 'project', targets: ['claude', 'opencode'] }) }),
      },
      { scope: 'local', ir: ir({ manifest: baseManifest({ scope: 'local', targets: ['codex'] }) }) },
    ];
    const merged = mergeIR(scopes);
    expect(merged.manifest.scope).toBe('local');
    expect(merged.manifest.targets).toEqual(['codex']);
  });

  it('concatenates rules in scope order with prefixed ids', () => {
    const scopes: ScopedIR[] = [
      { scope: 'project', ir: ir({ rules: [{ id: 'main', body: 'P' }] }) },
      { scope: 'user', ir: ir({ rules: [{ id: 'main', body: 'U' }] }) },
    ];
    const merged = mergeIR(scopes);
    // user comes first in scope order, then project
    expect(merged.rules?.map((r) => r.id)).toEqual(['user/main', 'project/main']);
    expect(merged.rules?.map((r) => r.body)).toEqual(['U', 'P']);
  });

  it('unions skills by name; closer scope wins', () => {
    const scopes: ScopedIR[] = [
      {
        scope: 'user',
        ir: ir({
          skills: [
            { name: 'fmt', description: 'user-fmt', body: 'U' },
            { name: 'lint', description: 'user-lint', body: 'U' },
          ],
        }),
      },
      {
        scope: 'project',
        ir: ir({
          skills: [{ name: 'fmt', description: 'proj-fmt', body: 'P' }],
        }),
      },
    ];
    const merged = mergeIR(scopes);
    const byName = new Map(merged.skills?.map((s) => [s.name, s]));
    expect(byName.get('fmt')?.body).toBe('P'); // project wins
    expect(byName.get('lint')?.body).toBe('U'); // only in user
    expect(merged.skills).toHaveLength(2);
  });

  it('unions hooks by (events, matcher) tuple', () => {
    const scopes: ScopedIR[] = [
      {
        scope: 'user',
        ir: ir({
          hooks: [
            { events: ['tool.use.post'], matcher: 'Edit', command: 'U-edit' },
            { events: ['turn.end'], command: 'U-end' },
          ],
        }),
      },
      {
        scope: 'project',
        ir: ir({
          hooks: [
            // same events+matcher as user → overrides
            { events: ['tool.use.post'], matcher: 'Edit', command: 'P-edit' },
            // different matcher → unioned
            { events: ['tool.use.post'], matcher: 'Write', command: 'P-write' },
          ],
        }),
      },
    ];
    const merged = mergeIR(scopes);
    expect(merged.hooks).toHaveLength(3);
    const editPost = merged.hooks?.find((h) => h.matcher === 'Edit');
    expect(editPost?.command).toBe('P-edit');
  });

  it('combines permissions; deny overrides allow', () => {
    const scopes: ScopedIR[] = [
      {
        scope: 'user',
        ir: ir({ permissions: { allow: ['Bash(npm:*)', 'Bash(git status)'] } }),
      },
      {
        scope: 'project',
        ir: ir({ permissions: { deny: ['Bash(npm:*)'], ask: ['Bash(curl:*)'] } }),
      },
    ];
    const merged = mergeIR(scopes);
    expect(merged.permissions?.allow).toEqual(['Bash(git status)']);
    expect(merged.permissions?.deny).toEqual(['Bash(npm:*)']);
    expect(merged.permissions?.ask).toEqual(['Bash(curl:*)']);
  });

  it('merges env close-wins-per-key', () => {
    const scopes: ScopedIR[] = [
      { scope: 'user', ir: ir({ env: { A: 'u', B: 'u' } }) },
      { scope: 'project', ir: ir({ env: { B: 'p', C: 'p' } }) },
      { scope: 'local', ir: ir({ env: { C: 'l' } }) },
    ];
    const merged = mergeIR(scopes);
    expect(merged.env).toEqual({ A: 'u', B: 'p', C: 'l' });
  });

  it('omits resource fields entirely when none of the scopes define them', () => {
    const merged = mergeIR([{ scope: 'project', ir: ir() }]);
    expect(merged.skills).toBeUndefined();
    expect(merged.hooks).toBeUndefined();
    expect(merged.permissions).toBeUndefined();
    expect(merged.env).toBeUndefined();
  });
});
