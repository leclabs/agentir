import { parseFrontmatter, serializeFrontmatter } from '../engine/frontmatter.js';
import type { Rule } from '../ir/types.js';

/**
 * Parse a rule file (markdown with optional YAML frontmatter) into a Rule.
 * `id` defaults to the filename without extension; if frontmatter contains
 * an `id`, it overrides.
 */
export function parseRule(text: string, defaultId: string): Rule {
  const { frontmatter, body } = parseFrontmatter<Partial<Rule>>(text);
  const rule: Rule = {
    id: typeof frontmatter.id === 'string' ? frontmatter.id : defaultId,
    body,
  };
  if (frontmatter.targets) rule.targets = frontmatter.targets;
  if (frontmatter.excludes) rule.excludes = frontmatter.excludes;
  if (frontmatter.concat !== undefined) rule.concat = frontmatter.concat;
  if (frontmatter.order !== undefined) rule.order = frontmatter.order;
  return rule;
}

/**
 * Serialize a Rule into a markdown file string. The `id` is omitted from
 * frontmatter (it is encoded in the filename).
 */
export function serializeRule(rule: Rule): string {
  const fm: Record<string, unknown> = {};
  if (rule.targets) fm.targets = rule.targets;
  if (rule.excludes) fm.excludes = rule.excludes;
  if (rule.concat !== undefined) fm.concat = rule.concat;
  if (rule.order !== undefined) fm.order = rule.order;
  return serializeFrontmatter(fm, rule.body);
}
