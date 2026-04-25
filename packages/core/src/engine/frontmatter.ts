import matter from 'gray-matter';

export interface ParsedFrontmatter<T = Record<string, unknown>> {
  frontmatter: T;
  body: string;
}

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Returns `{ frontmatter: {}, body: text }` for input with no frontmatter.
 * The body is the markdown content with frontmatter (and its delimiters)
 * stripped; gray-matter's leading newline after the delimiter is preserved.
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  text: string,
): ParsedFrontmatter<T> {
  const parsed = matter(text);
  // gray-matter's stringify always appends a single trailing newline.
  // Strip it on parse so round-trips are byte-identical for the body.
  let body = parsed.content;
  if (body.endsWith('\n')) body = body.slice(0, -1);
  return {
    frontmatter: parsed.data as T,
    body,
  };
}

/**
 * Serialize a frontmatter object plus markdown body into a single string.
 *
 * Empty frontmatter objects are omitted entirely (no `---` block written).
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }
  return matter.stringify(body, frontmatter);
}
