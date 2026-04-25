import { parseFrontmatter, serializeFrontmatter } from '../engine/frontmatter.js';
import type { Skill } from '../ir/types.js';

/**
 * Parse a SKILL.md file into a Skill IR resource.
 *
 * Per the AgentSkills spec, `name` and `description` are required in
 * frontmatter. If `name` is missing, falls back to `defaultName` (typically
 * the parent directory name).
 */
export function parseSkill(text: string, defaultName: string): Skill {
  const { frontmatter, body } = parseFrontmatter<Partial<Skill>>(text);
  const name = typeof frontmatter.name === 'string' ? frontmatter.name : defaultName;
  if (!frontmatter.description) {
    throw new Error(`Skill '${name}': frontmatter must include 'description'`);
  }
  const skill: Skill = {
    name,
    description: frontmatter.description,
    body,
  };
  if (frontmatter.allowed_tools) skill.allowed_tools = frontmatter.allowed_tools;
  if (frontmatter.files) skill.files = frontmatter.files;
  if (frontmatter.targets) skill.targets = frontmatter.targets;
  if (frontmatter.excludes) skill.excludes = frontmatter.excludes;
  return skill;
}

/**
 * Serialize a Skill to SKILL.md content. `name` and `description` remain in
 * frontmatter for AgentSkills-spec compatibility.
 */
export function serializeSkill(skill: Skill): string {
  const fm: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
  };
  if (skill.allowed_tools) fm.allowed_tools = skill.allowed_tools;
  if (skill.files) fm.files = skill.files;
  if (skill.targets) fm.targets = skill.targets;
  if (skill.excludes) fm.excludes = skill.excludes;
  return serializeFrontmatter(fm, skill.body);
}
