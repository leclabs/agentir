import { describe, expect, it } from 'vitest';
import { parseFrontmatter, serializeFrontmatter } from '../../src/engine/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses YAML frontmatter and returns body', () => {
    const text = `---
title: Hello
tags:
  - a
  - b
---
Body content here.
`;
    const { frontmatter, body } = parseFrontmatter<{ title: string; tags: string[] }>(text);
    expect(frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] });
    expect(body.trim()).toBe('Body content here.');
  });

  it('returns empty frontmatter for plain markdown', () => {
    const text = '# Just a heading\n\nNo frontmatter here.';
    const { frontmatter, body } = parseFrontmatter(text);
    expect(frontmatter).toEqual({});
    expect(body).toBe(text);
  });

  it('handles multi-line YAML values', () => {
    const text = `---
description: |
  Line one.
  Line two.
---
body`;
    const { frontmatter } = parseFrontmatter<{ description: string }>(text);
    expect(frontmatter.description).toBe('Line one.\nLine two.\n');
  });
});

describe('serializeFrontmatter', () => {
  it('omits the frontmatter block entirely when frontmatter is empty', () => {
    expect(serializeFrontmatter({}, 'just a body')).toBe('just a body');
  });

  it('renders YAML frontmatter and body', () => {
    const out = serializeFrontmatter({ title: 'x' }, 'hello');
    expect(out).toContain('---');
    expect(out).toContain('title: x');
    expect(out.trim().endsWith('hello')).toBe(true);
  });

  it('round-trips parse → serialize for non-empty frontmatter', () => {
    const original = `---
a: 1
b: two
---
body line
`;
    const { frontmatter, body } = parseFrontmatter(original);
    const re = serializeFrontmatter(frontmatter, body);
    const reParsed = parseFrontmatter(re);
    expect(reParsed.frontmatter).toEqual(frontmatter);
    expect(reParsed.body).toBe(body);
  });
});
