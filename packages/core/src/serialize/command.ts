import { parseFrontmatter, serializeFrontmatter } from '../engine/frontmatter.js';
import type { Command } from '../ir/types.js';

export function parseCommand(text: string, defaultName: string): Command {
  const { frontmatter, body } = parseFrontmatter<Partial<Command>>(text);
  const cmd: Command = {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : defaultName,
    body,
  };
  if (frontmatter.description) cmd.description = frontmatter.description;
  if (frontmatter.argument_hint) cmd.argument_hint = frontmatter.argument_hint;
  if (frontmatter.model) cmd.model = frontmatter.model;
  if (frontmatter.allowed_tools) cmd.allowed_tools = frontmatter.allowed_tools;
  if (frontmatter.targets) cmd.targets = frontmatter.targets;
  if (frontmatter.excludes) cmd.excludes = frontmatter.excludes;
  return cmd;
}

export function serializeCommand(cmd: Command): string {
  const fm: Record<string, unknown> = {};
  if (cmd.description) fm.description = cmd.description;
  if (cmd.argument_hint) fm.argument_hint = cmd.argument_hint;
  if (cmd.model) fm.model = cmd.model;
  if (cmd.allowed_tools) fm.allowed_tools = cmd.allowed_tools;
  if (cmd.targets) fm.targets = cmd.targets;
  if (cmd.excludes) fm.excludes = cmd.excludes;
  return serializeFrontmatter(fm, cmd.body);
}
