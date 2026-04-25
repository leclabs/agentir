import { describe, expect, it } from 'vitest';
import {
  parseAgent,
  parseCommand,
  parseHook,
  parseRule,
  parseSkill,
  serializeAgent,
  serializeCommand,
  serializeHook,
  serializeRule,
  serializeSkill,
} from '../../src/serialize/index.js';

describe('rule serializer', () => {
  it('round-trips a rule with frontmatter', () => {
    const rule = {
      id: 'main',
      body: '# Project rules\n\nBe terse.',
      targets: ['claude', 'opencode'],
      order: 10,
    };
    const text = serializeRule(rule);
    const re = parseRule(text, 'main');
    expect(re).toEqual(rule);
  });

  it('uses defaultId when frontmatter has no id', () => {
    const r = parseRule('plain body, no frontmatter', 'foo');
    expect(r.id).toBe('foo');
    expect(r.body).toBe('plain body, no frontmatter');
  });

  it('omits frontmatter block entirely when no fields are set', () => {
    const text = serializeRule({ id: 'x', body: 'just body' });
    expect(text).toBe('just body');
  });
});

describe('command serializer', () => {
  it('round-trips a command', () => {
    const cmd = {
      name: 'review',
      body: 'Review the diff and respond.',
      description: 'Trigger code review',
      argument_hint: '<pr#>',
      model: 'claude-opus-4-7',
      allowed_tools: ['Bash', 'Read'],
    };
    const re = parseCommand(serializeCommand(cmd), 'review');
    expect(re).toEqual(cmd);
  });

  it('falls back to defaultName when frontmatter has none', () => {
    const c = parseCommand('---\ndescription: x\n---\nbody', 'fromfile');
    expect(c.name).toBe('fromfile');
  });
});

describe('agent serializer', () => {
  it('round-trips an agent', () => {
    const agent = {
      name: 'planner',
      body: 'You are the planner.',
      description: 'Plan tasks',
      model: 'claude-sonnet-4-6',
      tools: ['Read', 'Grep'],
      color: 'cyan',
    };
    expect(parseAgent(serializeAgent(agent), 'planner')).toEqual(agent);
  });
});

describe('skill serializer', () => {
  it('round-trips a skill (name+description in frontmatter)', () => {
    const skill = {
      name: 'code-review',
      description: 'Review code quality',
      body: '# How to review\n\nCheck X, Y, Z.',
      allowed_tools: ['Read'],
      files: ['reference.md'],
    };
    const re = parseSkill(serializeSkill(skill), 'code-review');
    expect(re).toEqual(skill);
  });

  it('throws when description is missing', () => {
    expect(() => parseSkill('---\nname: x\n---\n', 'x')).toThrow(/description/);
  });
});

describe('hook serializer', () => {
  it('round-trips a hook', () => {
    const hook = {
      id: 'fmt-on-edit',
      events: ['tool.use.post'] as const,
      matcher: 'Edit|Write',
      command: './scripts/format.sh',
      timeout: 30,
    };
    const text = serializeHook({ ...hook, events: [...hook.events] });
    const re = parseHook(text, 'fmt-on-edit');
    expect(re).toEqual({ ...hook, events: [...hook.events] });
  });

  it('uses defaultId when YAML has no id', () => {
    const h = parseHook(
      'events:\n  - turn.end\ncommand: echo done\n',
      'on-end',
    );
    expect(h.id).toBe('on-end');
    expect(h.events).toEqual(['turn.end']);
  });

  it('throws when events array is missing', () => {
    expect(() => parseHook('command: x\n', 'h')).toThrow(/event/);
  });

  it('throws when command is missing', () => {
    expect(() => parseHook('events: [turn.end]\n', 'h')).toThrow(/command/);
  });
});
