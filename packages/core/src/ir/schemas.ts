import agentSchema from '../../schema/agent.schema.json' with { type: 'json' };
import commandSchema from '../../schema/command.schema.json' with { type: 'json' };
import envSchema from '../../schema/env.schema.json' with { type: 'json' };
import hookSchema from '../../schema/hook.schema.json' with { type: 'json' };
import irSchema from '../../schema/ir.schema.json' with { type: 'json' };
import manifestSchema from '../../schema/manifest.schema.json' with { type: 'json' };
import mcpServerSchema from '../../schema/mcp-server.schema.json' with { type: 'json' };
import permissionsSchema from '../../schema/permissions.schema.json' with { type: 'json' };
import ruleSchema from '../../schema/rule.schema.json' with { type: 'json' };
import skillSchema from '../../schema/skill.schema.json' with { type: 'json' };

export {
  agentSchema,
  commandSchema,
  envSchema,
  hookSchema,
  irSchema,
  manifestSchema,
  mcpServerSchema,
  permissionsSchema,
  ruleSchema,
  skillSchema,
};

export const allSchemas = [
  manifestSchema,
  ruleSchema,
  skillSchema,
  commandSchema,
  agentSchema,
  hookSchema,
  mcpServerSchema,
  permissionsSchema,
  envSchema,
  irSchema,
] as const;
