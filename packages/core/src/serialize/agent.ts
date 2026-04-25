import { parseFrontmatter, serializeFrontmatter } from '../engine/frontmatter.js';
import type { Agent } from '../ir/types.js';

export function parseAgent(text: string, defaultName: string): Agent {
  const { frontmatter, body } = parseFrontmatter<Partial<Agent>>(text);
  const agent: Agent = {
    name: typeof frontmatter.name === 'string' ? frontmatter.name : defaultName,
    body,
  };
  if (frontmatter.description) agent.description = frontmatter.description;
  if (frontmatter.model) agent.model = frontmatter.model;
  if (frontmatter.tools) agent.tools = frontmatter.tools;
  if (frontmatter.color) agent.color = frontmatter.color;
  if (frontmatter.targets) agent.targets = frontmatter.targets;
  if (frontmatter.excludes) agent.excludes = frontmatter.excludes;
  return agent;
}

export function serializeAgent(agent: Agent): string {
  const fm: Record<string, unknown> = {};
  if (agent.description) fm.description = agent.description;
  if (agent.model) fm.model = agent.model;
  if (agent.tools) fm.tools = agent.tools;
  if (agent.color) fm.color = agent.color;
  if (agent.targets) fm.targets = agent.targets;
  if (agent.excludes) fm.excludes = agent.excludes;
  return serializeFrontmatter(fm, agent.body);
}
